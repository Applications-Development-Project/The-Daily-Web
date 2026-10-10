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

// A MongoDB id is exactly 24 hexadecimal characters. We check the shape ourselves
// to give a clear 400 message. (mongoose.isValidObjectId also accepts any 12-character
// string, so "hello world!" would pass it.)
const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

// The most comments one request returns. An article page shows the newest ones; this
// keeps the answer small and fast even for an article with thousands of comments.
const MAX_COMMENTS_PER_ARTICLE = 100;

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
 * POST /api/articles/:id/comments - add a comment. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function addComment(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
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
