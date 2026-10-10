/**
 * controllers/commentController.js
 *
 * Comments on articles (full CRUD on the Comment model):
 * - On the article page, for everyone: list an article's comments and add a new one
 *   (guests are limited to 3 per minute by middleware/commentRateLimiter.js, which runs
 *   before addComment).
 * - For the editor: the comment moderation page and API (search, edit, delete).
 *   These are still PLACEHOLDERS answering 501 until OS builds moderation.
 *
 * Every comment sent to the browser has the shape { id, authorName, text, createdAt }.
 * deviceId is never sent: it identifies a reader's browser and is only for the server.
 *
 * Used by: routes/pageRoutes/commentPageRoutes.js, routes/apiRoutes/commentApiRoutes.js.
 * Related: models/Comment.js, models/Article.js, public/js/articleComments.js.
 * Owner: OS.
 */

const Comment = require('../models/Comment');
const Article = require('../models/Article');
const logger = require('../services/logger');

// A MongoDB id is exactly 24 hexadecimal characters. We check the shape ourselves
// to give a clear 400 message. (mongoose.isValidObjectId also accepts any 12-character
// string, so "hello world!" would pass it.)
const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

// The most comments one request returns. An article page shows the newest ones; this
// keeps the answer small and fast even for an article with thousands of comments.
const MAX_COMMENTS_PER_ARTICLE = 100;

// Length limits from the work plan, the same as in models/Comment.js. The model
// checks them again as a safety net; here we give the reader a friendly message.
const MAX_AUTHOR_NAME_LENGTH = 50;
const MAX_COMMENT_TEXT_LENGTH = 1000;

/**
 * Turns a comment from the database into the shape we send to the browser.
 * Choosing the fields one by one means nothing else (like deviceId) leaks out,
 * even if the model gets new fields later.
 *
 * @param {Object} comment - A comment document or a lean object.
 * @returns {{id: string, authorName: string, text: string, createdAt: Date}}
 */
function toCommentResponse(comment) {
  return {
    id: comment._id.toString(),
    authorName: comment.authorName,
    text: comment.text,
    createdAt: comment.createdAt,
  };
}

/**
 * Builds the error passed to errorHandler, which answers with this status and message.
 *
 * @param {number} statusCode - A 4xx status.
 * @param {string} message - What the user is told.
 * @returns {Error}
 */
function createClientError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Finds a live article by its id from the URL. "Live" means it has a published
 * version (published is not null); readers can't see or comment on drafts.
 *
 * @param {string} articleId - The :id from the URL.
 * @returns {Promise<Object>} The article (only its _id), if it exists and is live.
 * @throws {Error} 400 if the id is malformed, 404 if there is no live article with it.
 */
async function findLiveArticle(articleId) {
  if (!OBJECT_ID_PATTERN.test(articleId)) {
    throw createClientError(400, 'Invalid article id.');
  }

  // We only need to know that it exists, so we load just its _id.
  const article = await Article.findOne({ _id: articleId, published: { $ne: null } }).select('_id').lean();
  if (!article) {
    throw createClientError(404, 'Article not found.');
  }
  return article;
}

/**
 * Reads and checks the name and text of a new comment from the request body.
 *
 * Both must be strings: a number would otherwise be saved as text, and an object such
 * as { "$gt": "" } has no business in a comment. Spaces around them are removed first,
 * so a name made only of spaces counts as empty.
 *
 * @param {Object|undefined} body - req.body (undefined in Express 5 when there is no body).
 * @returns {{authorName: string, text: string}} The cleaned values.
 * @throws {Error} 400 with a message that says what to fix.
 */
function readNewCommentFields(body) {
  const authorName = body && typeof body.authorName === 'string' ? body.authorName.trim() : '';
  const text = body && typeof body.text === 'string' ? body.text.trim() : '';

  if (authorName === '') {
    throw createClientError(400, 'Please enter your name.');
  }
  if (authorName.length > MAX_AUTHOR_NAME_LENGTH) {
    throw createClientError(400, `Your name can be at most ${MAX_AUTHOR_NAME_LENGTH} characters.`);
  }
  if (text === '') {
    throw createClientError(400, 'Please write a comment.');
  }
  if (text.length > MAX_COMMENT_TEXT_LENGTH) {
    throw createClientError(400, `A comment can be at most ${MAX_COMMENT_TEXT_LENGTH.toLocaleString('en-US')} characters.`);
  }

  return { authorName: authorName, text: text };
}

/**
 * GET /api/articles/:id/comments - the article's comments, newest first
 * (at most MAX_COMMENTS_PER_ARTICLE). Open to everyone.
 * Answers 200 { success: true, data: { comments: [...] } }.
 *
 * The query matches the { article: 1, createdAt: -1 } index on Comment, so MongoDB
 * reads only this article's newest comments instead of every comment.
 * _id is a tie-breaker for two comments created in the same millisecond.
 *
 * @param {import('express').Request} request - request.params.id is the article id.
 * @param {import('express').Response} response - The JSON answer.
 * @returns {Promise<void>}
 * @throws {Error} 400 or 404 from findLiveArticle, passed on to errorHandler by Express.
 */
async function listArticleComments(request, response) {
  const article = await findLiveArticle(request.params.id);

  const comments = await Comment.find({ article: article._id })
    .sort({ createdAt: -1, _id: -1 })
    .limit(MAX_COMMENTS_PER_ARTICLE)
    .select('authorName text createdAt')
    .lean();

  response.json({ success: true, data: { comments: comments.map(toCommentResponse) } });
}

/**
 * POST /api/articles/:id/comments - body { authorName, text }. Open to everyone;
 * commentRateLimiter runs first and stops a guest's 4th comment within a minute.
 * Answers 201 { success: true, data: <the new comment> }, so the page can add it to
 * the list right away without loading the list again.
 *
 * The article comes from the URL and the device id from the deviceId cookie
 * (req.deviceId), never from the body, so nobody can post as another device or
 * attach a comment to a different article by editing the request.
 *
 * Text is saved exactly as typed, HTML included. It is made safe when shown:
 * articleComments.js uses textContent and EJS uses the escaping <%= %> tag.
 *
 * @param {import('express').Request} request - The new comment.
 * @param {import('express').Response} response - The JSON answer.
 * @returns {Promise<void>}
 * @throws {Error} 400 for bad fields or id, 404 if the article isn't live.
 */
async function addComment(request, response) {
  // Fields first: a bad request is refused without touching the database.
  const fields = readNewCommentFields(request.body);
  const article = await findLiveArticle(request.params.id);

  const comment = await Comment.create({
    article: article._id,
    authorName: fields.authorName,
    text: fields.text,
    deviceId: request.deviceId,
  });

  logger.info(`New comment on article ${article._id} by ${JSON.stringify(comment.authorName)}`);
  response.status(201).json({ success: true, data: toCommentResponse(comment) });
}

/**
 * GET /editor/comments - the comment moderation page. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function showCommentModerationPage(request, response) {
  response.status(501).render('public/error', { statusCode: 501, message: 'Comment moderation is not built yet.' });
}

/**
 * GET /api/comments?search=&page= - search all comments, 20 per page. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function searchComments(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
}

/**
 * PATCH /api/comments/:id - edit a comment's text. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function updateComment(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
}

/**
 * DELETE /api/comments/:id - delete a comment. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function deleteComment(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
}

module.exports = {
  listArticleComments,
  addComment,
  showCommentModerationPage,
  searchComments,
  updateComment,
  deleteComment,
};
