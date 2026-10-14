/**
 * controllers/commentController.js
 *
 * Comments on articles (full CRUD on the Comment model):
 * - On the article page, for everyone: list an article's comments and add a new one
 *   (guests are limited to 3 per minute by middleware/commentRateLimiter.js, which runs
 *   before addComment).
 * - For the editor: the comment moderation page and API (search, edit, delete).
 *   The page is views/editor/comments.ejs; public/js/editor/comments.js runs it.
 *
 * Every comment sent to the browser has the shape { id, authorName, text, createdAt }.
 * deviceId is never sent: it identifies a reader's browser and is only for the server.
 *
 * Used by: routes/pageRoutes/commentPageRoutes.js, routes/apiRoutes/commentApiRoutes.js.
 * Related: models/Comment.js, models/Article.js, public/js/public/articleComments.js,
 * views/editor/comments.ejs, public/js/editor/comments.js.
 * Owner: OS.
 */

const Comment = require('../models/Comment');
const Article = require('../models/Article');
const logger = require('../services/logger');
const { createHttpError } = require('../utils/httpErrors');
const { isValidObjectId, escapeRegExp, readSearchText, readPageNumber } = require('../utils/requestValidation');

// The most comments one request returns. An article page shows the newest ones; this
// keeps the answer small and fast even for an article with thousands of comments.
const MAX_COMMENTS_PER_ARTICLE = 100;

// Length limits from the work plan, the same as in models/Comment.js. The model
// checks them again as a safety net; here we give the reader a friendly message.
const MAX_AUTHOR_NAME_LENGTH = 50;
const MAX_COMMENT_TEXT_LENGTH = 1000;

// The moderation list is shown 20 at a time, like every other list in the project.
const COMMENTS_PER_PAGE = 20;

// A search longer than a whole comment can't match anything.
const MAX_SEARCH_LENGTH = 100;

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
 * The moderation shape of a comment: the public shape plus the article it belongs to,
 * so the editor can see where the comment was posted and open that article.
 *
 * The article title comes from the published version (what readers saw next to the
 * comment). If the article has no published version any more, we fall back to its
 * working copy's title. article is null if the article was deleted, which normally
 * can't happen because deleting an article also deletes its comments.
 *
 * @param {Object} comment - A lean comment whose article field was populated.
 * @returns {{id: string, authorName: string, text: string, createdAt: Date,
 *   article: ({id: string, title: string}|null)}}
 */
function toModerationCommentResponse(comment) {
  const response = toCommentResponse(comment);
  response.article = null;

  if (comment.article) {
    const article = comment.article;
    let title = '(untitled)';
    if (article.published && article.published.title) {
      title = article.published.title;
    } else if (article.draft && article.draft.title) {
      title = article.draft.title;
    }
    response.article = { id: article._id.toString(), title: title };
  }

  return response;
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
  if (!isValidObjectId(articleId)) {
    throw createHttpError(400, 'Invalid article id.');
  }

  // We only need to know that it exists, so we load just its _id.
  const article = await Article.findOne({ _id: articleId, published: { $ne: null } }).select('_id').lean();
  if (!article) {
    throw createHttpError(404, 'Article not found.');
  }
  return article;
}

/**
 * Checks a comment's text. Used both for a new comment and for an editor's edit, so
 * the two can never accept different text.
 *
 * It must be a string: a number would otherwise be saved as text, and an object such
 * as { "$gt": "" } has no business in a comment. Spaces around it are removed first,
 * so text made only of spaces counts as empty.
 *
 * @param {*} value - body.text.
 * @returns {string} The trimmed text.
 * @throws {Error} 400 if it is missing, blank or too long.
 */
function readCommentText(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text === '') {
    throw createHttpError(400, 'Please write a comment.');
  }
  if (text.length > MAX_COMMENT_TEXT_LENGTH) {
    throw createHttpError(400, `A comment can be at most ${MAX_COMMENT_TEXT_LENGTH.toLocaleString('en-US')} characters.`);
  }
  return text;
}

/**
 * Reads and checks the name and text of a new comment from the request body.
 * The name follows the same rules as the text: a string, trimmed, not blank.
 *
 * @param {Object|undefined} body - req.body (undefined in Express 5 when there is no body).
 * @returns {{authorName: string, text: string}} The cleaned values.
 * @throws {Error} 400 with a message that says what to fix.
 */
function readNewCommentFields(body) {
  const fields = body || {};
  const authorName = typeof fields.authorName === 'string' ? fields.authorName.trim() : '';

  if (authorName === '') {
    throw createHttpError(400, 'Please enter your name.');
  }
  if (authorName.length > MAX_AUTHOR_NAME_LENGTH) {
    throw createHttpError(400, `Your name can be at most ${MAX_AUTHOR_NAME_LENGTH} characters.`);
  }

  return { authorName: authorName, text: readCommentText(fields.text) };
}

/**
 * Loads the comment named in the URL, for an edit or delete.
 *
 * @param {string} commentId - request.params.id.
 * @returns {Promise<import('mongoose').Document>} The comment document (can be changed and saved).
 * @throws {Error} 400 if the id is malformed, 404 if there is no such comment.
 */
async function findCommentById(commentId) {
  if (!isValidObjectId(commentId)) {
    throw createHttpError(400, 'Invalid comment id.');
  }
  const comment = await Comment.findById(commentId);
  if (!comment) {
    throw createHttpError(404, 'Comment not found.');
  }
  return comment;
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
 * public/js/public/articleComments.js uses textContent and EJS uses the escaping <%= %> tag.
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
 * GET /editor/comments - the comment moderation page (editor only).
 *
 * It sends only the page frame, with no comments in it. The browser script
 * (public/js/editor/comments.js) loads them from GET /api/comments, so the rows are
 * built in one place only and the first page works exactly like every later page.
 * This page doesn't need to be found by search engines (it is behind a login), so
 * unlike the article page there is no reason to render the list on the server.
 *
 * @param {import('express').Request} request - The page request (editor only).
 * @param {import('express').Response} response - Renders views/editor/comments.ejs.
 * @returns {void}
 */
function showCommentModerationPage(request, response) {
  response.render('editor/comments', { title: 'Comments - The Web Daily' });
}

/**
 * GET /api/comments?search=&page= - every comment in the system, newest first,
 * 20 per page. With a search, only comments whose text or author name contains it
 * (ignoring capital letters). Editor only.
 * Answers 200 { success: true, data: { comments, page, totalPages, totalComments } };
 * each comment also has article: { id, title }.
 *
 * populate() replaces each comment's article id with the article itself, loading only
 * the two titles we need, so the whole page takes one query for the comments and one
 * for their articles, not one query per comment.
 *
 * @param {import('express').Request} request - request.query.search and .page.
 * @param {import('express').Response} response - The JSON answer.
 * @returns {Promise<void>}
 * @throws {Error} 400 for an invalid search or page (passed on to errorHandler).
 */
async function searchComments(request, response) {
  const searchText = readSearchText(request.query.search, MAX_SEARCH_LENGTH);
  const page = readPageNumber(request.query.page);

  // An empty filter {} matches every comment. With a search, $or matches either field.
  // We build the RegExp ourselves from a checked string, so the filter can only ever be
  // "contains this text": a value like ?search[$ne]=x never becomes a MongoDB operator
  // (Express 5's default query parser doesn't turn [..] into objects, and
  // readSearchText refuses anything that isn't a string anyway).
  // Why a RegExp and not a MongoDB text index: a text index matches whole words only,
  // so "edit" would not find "edited", and the editor expects "contains" like the
  // users search. The cost is that a "contains" search can't use an index and reads
  // every comment; that is fast enough for the thousands of comments in this project.
  let filter = {};
  if (searchText !== '') {
    const searchPattern = new RegExp(escapeRegExp(searchText), 'i');
    filter = { $or: [{ text: searchPattern }, { authorName: searchPattern }] };
  }

  // countDocuments and find run at the same time, so the page waits for one round
  // trip instead of two. _id breaks ties between comments from the same millisecond,
  // so paging never shows a comment twice or skips one.
  // skip() is simple page numbering: page 3 skips the first 40 comments. MongoDB still
  // walks past the skipped ones, but with 20 per page an editor never goes deep enough
  // for that to matter.
  // select() loads only the fields toModerationCommentResponse uses, so deviceId never
  // even leaves the database. lean() returns plain objects instead of full Mongoose
  // documents, which is faster because we only read them.
  const [totalComments, comments] = await Promise.all([
    Comment.countDocuments(filter),
    Comment.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * COMMENTS_PER_PAGE)
      .limit(COMMENTS_PER_PAGE)
      .select('article authorName text createdAt')
      .populate('article', 'published.title draft.title')
      .lean(),
  ]);

  response.json({
    success: true,
    data: {
      comments: comments.map(toModerationCommentResponse),
      page: page,
      totalPages: Math.max(1, Math.ceil(totalComments / COMMENTS_PER_PAGE)),
      totalComments: totalComments,
    },
  });
}

/**
 * PATCH /api/comments/:id - body { text }. The editor corrects a comment's text,
 * for example to remove an insult while keeping the rest. Editor only.
 * Only the text can change: the author's name, the article and the device stay as
 * they were, so the comment still shows who wrote it and where.
 * Answers 200 { success: true, data: <the updated comment> }.
 *
 * The text is checked before the comment is loaded, so a bad request never touches
 * the database. save() runs the model's validators again as a safety net.
 *
 * @param {import('express').Request} request - request.params.id and request.body.text.
 * @param {import('express').Response} response - The JSON answer.
 * @returns {Promise<void>}
 * @throws {Error} 400 for bad text or id, 404 if the comment doesn't exist.
 */
async function updateComment(request, response) {
  // In Express 5 request.body is undefined when the request has no body.
  const body = request.body || {};
  const text = readCommentText(body.text);

  // Why findById + save() and not findByIdAndUpdate():
  // - findByIdAndUpdate skips the model's validators (maxlength, required) unless we
  //   remember to pass { runValidators: true }; save() always runs them.
  // - Loading the comment first lets findCommentById answer a clear 404 when it
  //   doesn't exist, the same way the delete route does.
  // - Only the one field we assign is changed. Nothing from the request body is passed
  //   to the database as it is, so an extra field like authorName or deviceId in the
  //   body is simply ignored.
  // The cost is two database calls instead of one, which doesn't matter for an
  // editor's occasional edit.
  const comment = await findCommentById(request.params.id);
  comment.text = text;
  await comment.save();

  logger.info(`Editor ${request.session.user.id} edited comment ${comment._id}`);
  response.json({ success: true, data: toCommentResponse(comment) });
}

/**
 * DELETE /api/comments/:id - removes a comment for good. Editor only. The page asks
 * for confirmation first; the server can't know whether it did, so this is final.
 * Answers 200 { success: true, data: { id } }, so the page knows which row to remove.
 *
 * @param {import('express').Request} request - request.params.id is the comment id.
 * @param {import('express').Response} response - The JSON answer.
 * @returns {Promise<void>}
 * @throws {Error} 400 if the id is malformed, 404 if the comment doesn't exist.
 */
async function deleteComment(request, response) {
  // We load the comment first (instead of a single findByIdAndDelete) so that edit and
  // delete share findCommentById: the same 400 for a bad id and 404 for a missing one.
  // Calling deleteOne() on the loaded document deletes exactly that one comment by its
  // _id, and we still have its article id for the log line afterwards.
  const comment = await findCommentById(request.params.id);
  await comment.deleteOne();

  logger.info(`Editor ${request.session.user.id} deleted comment ${comment._id} on article ${comment.article}`);
  response.json({ success: true, data: { id: comment._id.toString() } });
}

module.exports = {
  listArticleComments,
  addComment,
  showCommentModerationPage,
  searchComments,
  updateComment,
  deleteComment,
};
