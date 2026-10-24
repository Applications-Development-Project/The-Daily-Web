/**
 * controllers/commentController.js
 *
 * Comments (full CRUD on Comment): an article's comments and adding one (for everyone;
 * guests are limited by commentRateLimiter first), and the editor's moderation page and
 * API (search, edit, delete). A comment sent to the browser is { id, authorName, text,
 * createdAt }; deviceId never leaves the server.
 *
 * Used by: routes/pageRoutes/commentPageRoutes.js, routes/apiRoutes/commentApiRoutes.js.
 * Owner: OS.
 */

const Comment = require('../models/Comment');
const Article = require('../models/Article');
const logger = require('../services/logger');
const { createHttpError } = require('../utils/httpErrors');
const { isValidObjectId, escapeRegExp, readSearchText, readPageNumber } = require('../utils/requestValidation');

// The same limits as models/Comment.js, checked here for a friendlier message.
const MAX_AUTHOR_NAME_LENGTH = 50;
const MAX_COMMENT_TEXT_LENGTH = 1000;

const COMMENTS_PER_PAGE = 20;

const MAX_SEARCH_LENGTH = 100;

/**
 * Turns a comment into the shape sent to the browser. Picking fields one by one means
 * nothing else (like deviceId) leaks out.
 *
 * @param {Object} comment - A document or a lean object.
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
 * The moderation shape: the public shape plus its article { id, title } (the published
 * title, else the working title), or null if the article no longer exists.
 *
 * @param {Object} comment - A lean comment with article populated.
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
 * Finds a live article (published not null): readers can't see or comment on drafts.
 *
 * @param {string} articleId - The :id from the URL.
 * @returns {Promise<Object>} The article (only its _id).
 * @throws {Error} 400 for a malformed id, 404 if there is no live article with it.
 */
async function findLiveArticle(articleId) {
  if (!isValidObjectId(articleId)) {
    throw createHttpError(400, 'Invalid article id.');
  }

  const article = await Article.findOne({ _id: articleId, published: { $ne: null } }).select('_id').lean();
  if (!article) {
    throw createHttpError(404, 'Article not found.');
  }
  return article;
}

/**
 * Checks a comment's text, for a new comment and an editor's edit alike. It must be a
 * string (an object like { "$gt": "" } doesn't belong in a comment); spaces only = empty.
 *
 * @param {*} value - body.text.
 * @returns {string} The trimmed text.
 * @throws {Error} 400 if missing, blank or too long.
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
 * Reads and checks a new comment's name and text.
 *
 * @param {Object|undefined} body - req.body (undefined in Express 5 when there is no body).
 * @returns {{authorName: string, text: string}}
 * @throws {Error} 400 with a message saying what to fix.
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
 * Loads the comment named in the URL.
 *
 * @param {string} commentId - request.params.id.
 * @returns {Promise<import('mongoose').Document>}
 * @throws {Error} 400 for a malformed id, 404 if there is no such comment.
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
 * GET /api/articles/:id/comments - the newest comments (as many as the article page
 * shows), from the { article, createdAt } index. Open to everyone.
 * Answers 200 { success: true, data: { comments } }.
 *
 * @param {import('express').Request} request - params.id is the article.
 * @param {import('express').Response} response
 * @returns {Promise<void>}
 * @throws {Error} 400 or 404 from findLiveArticle.
 */
async function listArticleComments(request, response) {
  const article = await findLiveArticle(request.params.id);

  // _id breaks ties between comments from the same millisecond.
  const comments = await Comment.find({ article: article._id })
    .sort({ createdAt: -1, _id: -1 })
    .limit(Comment.MAX_SHOWN_PER_ARTICLE)
    .select('authorName text createdAt')
    .lean();

  response.json({ success: true, data: { comments: comments.map(toCommentResponse) } });
}

/**
 * POST /api/articles/:id/comments - body { authorName, text }. Answers 201 with the new
 * comment, so the page adds it without reloading the list. The article comes from the
 * URL and the device from the cookie, never the body. Text is saved as typed and made
 * safe when shown (textContent, <%= %>).
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
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
 * GET /editor/comments - the moderation page, sent empty; public/js/editor/comments.js
 * loads the rows (it is behind a login, so search engines don't need them in the HTML).
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response - Renders views/editor/comments.ejs.
 * @returns {void}
 */
function showCommentModerationPage(request, response) {
  response.render('editor/comments', { title: 'Comments - The Daily Web' });
}

/**
 * GET /api/comments?search=&page= - all comments, newest first, 20 per page; a search
 * matches the text or the author (any capitals). populate loads only the article titles,
 * in one extra query for the whole page.
 * Answers 200 { success: true, data: { comments, page, totalPages, totalComments } }.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {Promise<void>}
 * @throws {Error} 400 for an invalid search or page.
 */
async function searchComments(request, response) {
  const searchText = readSearchText(request.query.search, MAX_SEARCH_LENGTH);
  const page = readPageNumber(request.query.page);

  // A RegExp built from a checked string can only mean "contains this text". Not a text
  // index: it matches whole words only ("edit" wouldn't find "edited").
  let filter = {};
  if (searchText !== '') {
    const searchPattern = new RegExp(escapeRegExp(searchText), 'i');
    filter = { $or: [{ text: searchPattern }, { authorName: searchPattern }] };
  }

  // Both queries at the same time; _id breaks ties, so paging never repeats or skips.
  // select keeps deviceId in the database.
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
 * PATCH /api/comments/:id - body { text }. The editor corrects a comment's text; the
 * author, article and device stay. Answers 200 with the updated comment.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {Promise<void>}
 * @throws {Error} 400 for bad text or id, 404 if the comment doesn't exist.
 */
async function updateComment(request, response) {
  const body = request.body || {};
  const text = readCommentText(body.text);

  // findById + save(), not findByIdAndUpdate: save() always runs the validators, a missing
  // comment gets a clear 404, and only the text is assigned (other body fields are ignored).
  const comment = await findCommentById(request.params.id);
  comment.text = text;
  await comment.save();

  logger.info(`Editor ${request.session.user.id} edited comment ${comment._id}`);
  response.json({ success: true, data: toCommentResponse(comment) });
}

/**
 * DELETE /api/comments/:id - removes a comment for good (the page asks first).
 * Answers 200 { success: true, data: { id } }.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {Promise<void>}
 * @throws {Error} 400 for a malformed id, 404 if the comment doesn't exist.
 */
async function deleteComment(request, response) {
  // Loaded first, so edit and delete share the same 400/404 answers.
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
