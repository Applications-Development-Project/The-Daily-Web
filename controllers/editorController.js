/**
 * controllers/editorController.js
 *
 * Everything the editor does with articles: the dashboard of all articles and the
 * review page, editing a submitted draft, approving (draft copied into published),
 * returning with a note, and deleting an article with its comments and statistics.
 *
 * Every route that reaches these functions is protected with requireRole('editor')
 * in the route files, so here request.session.user is always a logged-in editor.
 *
 * Built step by step from OS's phase 0 placeholders: functions still marked
 * PLACEHOLDER answer 501 { success: false, error: "Not implemented yet" } (APIs)
 * or show the error page with status 501 (pages). The function names must stay
 * the same, because the route files call them.
 *
 * Used by: routes/pageRoutes/editorPageRoutes.js, routes/apiRoutes/editorApiRoutes.js.
 * Related: models/Article.js, services/articleWorkflow.js (STATUS, canTransition).
 * Owner: SM.
 */

const mongoose = require('mongoose');
const Article = require('../models/Article');
const Comment = require('../models/Comment');
const ArticleViewStats = require('../models/ArticleViewStats');
const DeviceArticleView = require('../models/DeviceArticleView');
const { STATUS, STATUS_LABELS, canTransition } = require('../services/articleWorkflow');
const logger = require('../services/logger');

// The dashboard shows 20 articles per page ("Shared contracts").
const ARTICLES_PER_PAGE = 20;
// Titles are at most 200 characters, so a longer search can never match anything.
const MAX_SEARCH_LENGTH = 200;
// An article can't go live with any of these empty (the image is optional).
const REQUIRED_CONTENT_FIELDS = ['title', 'summary', 'body', 'category'];
// Same limit as Article.editorNote in the model.
const MAX_EDITOR_NOTE_LENGTH = 2000;

/**
 * Sends an error answer in the shape every API uses: { success: false, error }.
 *
 * @param {import('express').Response} response - The response to send.
 * @param {number} statusCode - 400, 404, 409...
 * @param {string} message - A message the editor can read.
 * @returns {void}
 */
function sendError(response, statusCode, message) {
  response.status(statusCode).json({ success: false, error: message });
}

/**
 * Loads the article named in the URL (/:id), or answers the request itself if it can't:
 * 400 for an id that isn't a valid MongoDB id, 404 if no such article exists.
 * Checking the format first gives a clear message instead of a database CastError.
 *
 * @param {import('express').Request} request - request.params.id is the article id.
 * @param {import('express').Response} response - Used only to send the 400 or 404.
 * @returns {Promise<Object|null>} The article document, or null if an error was sent.
 */
async function findArticleFromUrl(request, response) {
  if (!mongoose.isValidObjectId(request.params.id)) {
    sendError(response, 400, 'Invalid article id');
    return null;
  }
  const article = await Article.findById(request.params.id);
  if (!article) {
    sendError(response, 404, 'Article not found');
    return null;
  }
  return article;
}

/**
 * Reads one text value from the query string.
 * A value can arrive as an array (?status=a&status=b), which we treat as invalid
 * instead of guessing which one was meant.
 *
 * @param {*} value - request.query.something.
 * @returns {string|null} The trimmed text ('' if it was not sent), or null if it isn't text.
 */
function readQueryText(value) {
  if (value === undefined) {
    return '';
  }
  if (typeof value !== 'string') {
    return null;
  }
  return value.trim();
}

/**
 * Makes user text safe to put inside a regular expression, so a search for "C++"
 * or "(draft)" looks for those exact characters instead of breaking the regex or
 * changing its meaning.
 *
 * @param {string} text - What the user typed.
 * @returns {string} The same text with every regex special character escaped.
 */
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks the dashboard's query string: ?status=&search=&page=
 *
 * @param {Object} query - request.query.
 * @returns {{error: string}|{status: string, search: string, page: number}}
 *   Either a message for a 400 answer, or the clean values ('' means "no filter").
 */
function readArticleListQuery(query) {
  const status = readQueryText(query.status);
  const search = readQueryText(query.search);
  const pageText = readQueryText(query.page);

  if (status === null || search === null || pageText === null) {
    return { error: 'Each of status, search and page can be given only once' };
  }
  if (status !== '' && !Object.values(STATUS).includes(status)) {
    return { error: `Unknown status "${status}". Use one of: ${Object.values(STATUS).join(', ')}` };
  }
  if (search.length > MAX_SEARCH_LENGTH) {
    return { error: `Search can be at most ${MAX_SEARCH_LENGTH} characters` };
  }
  // Only digits, so "2.5", "-1", "abc" and "1e3" are all rejected.
  if (pageText !== '' && !/^\d+$/.test(pageText)) {
    return { error: 'Page must be a whole number, 1 or more' };
  }
  const page = pageText === '' ? 1 : Number(pageText);
  if (page < 1) {
    return { error: 'Page must be a whole number, 1 or more' };
  }

  return { status: status, search: search, page: page };
}

/**
 * Turns an article from the database into one dashboard row, with only what the
 * table shows.
 *
 * The title is the working copy's (draft) title, because that is what the editor
 * reviews; an article whose draft has no title yet falls back to the live title.
 *
 * @param {Object} article - A lean article with reporter populated.
 * @returns {{id: string, title: string, reporterName: string, status: string,
 *   statusLabel: string, isLive: boolean, updatedAt: Date}}
 */
function toArticleRow(article) {
  const liveTitle = article.published ? article.published.title : '';
  return {
    id: article._id.toString(),
    title: article.draft.title || liveTitle || '(untitled)',
    // reporter is null if the user was deleted; the user rules prevent that, but the
    // dashboard must still work if it ever happens.
    reporterName: article.reporter ? article.reporter.displayName : 'Unknown reporter',
    status: article.status,
    statusLabel: STATUS_LABELS[article.status],
    // Live means readers can see it, whatever the status of the working copy.
    isLive: Boolean(article.published),
    updatedAt: article.updatedAt,
  };
}

/**
 * GET /editor - the editor dashboard. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function showEditorDashboard(request, response) {
  response.status(501).render('public/error', { statusCode: 501, message: 'The editor dashboard is not built yet.' });
}

/**
 * GET /editor/articles/:id - review one article. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function showArticleReview(request, response) {
  response.status(501).render('public/error', { statusCode: 501, message: 'The article review page is not built yet.' });
}

/**
 * GET /api/editor/articles?status=&search=&page= - every article in the system,
 * newest change first, 20 per page, for the editor dashboard.
 *
 * - status: one of draft, pending, published, returned; empty means all.
 * - search: part of the title, any capitals; matches the working title or the live title.
 * - page: 1 or more; empty means 1.
 *
 * Answers 200 { success: true, data: { articles, page, totalPages, totalArticles } },
 * or 400 with a message if a parameter is invalid. Database errors go to errorHandler
 * (Express 5 passes a rejected promise from an async controller on by itself).
 *
 * @param {import('express').Request} request - The query string holds the filters.
 * @param {import('express').Response} response - The JSON answer.
 * @returns {Promise<void>}
 */
async function listAllArticles(request, response) {
  const listQuery = readArticleListQuery(request.query);
  if (listQuery.error) {
    response.status(400).json({ success: false, error: listQuery.error });
    return;
  }

  const filter = {};
  if (listQuery.status !== '') {
    filter.status = listQuery.status;
  }
  if (listQuery.search !== '') {
    // 'i' = ignore capitals. We search both titles, so a live article whose
    // working copy was renamed can be found by either name.
    const titlePattern = new RegExp(escapeRegex(listQuery.search), 'i');
    filter.$or = [{ 'draft.title': titlePattern }, { 'published.title': titlePattern }];
  }

  // The page of articles and the total count are two independent queries, so we
  // send both at once and wait for both, instead of one after the other.
  // _id is the tie-breaker: articles with the same updatedAt keep a fixed order,
  // so moving between pages never repeats or skips one.
  const [articles, totalArticles] = await Promise.all([
    Article.find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .skip((listQuery.page - 1) * ARTICLES_PER_PAGE)
      .limit(ARTICLES_PER_PAGE)
      .select({ status: 1, 'draft.title': 1, 'published.title': 1, reporter: 1, updatedAt: 1 })
      .populate('reporter', 'displayName')
      .lean(),
    Article.countDocuments(filter),
  ]);

  response.json({
    success: true,
    data: {
      articles: articles.map(toArticleRow),
      page: listQuery.page,
      // At least 1, so an empty result still reads "page 1 of 1".
      totalPages: Math.max(1, Math.ceil(totalArticles / ARTICLES_PER_PAGE)),
      totalArticles: totalArticles,
    },
  });
}

/**
 * PATCH /api/editor/articles/:id/draft - the editor edits a submitted draft. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function editArticleDraft(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
}

/**
 * POST /api/editor/articles/:id/approve - publishes the article: its working copy
 * (draft) becomes the version readers see (published).
 *
 * For an update to a live article this is the moment readers switch from the old
 * version to the new one; until now they kept seeing the last approved version.
 * Every approval is recorded in publishHistory, which the analytics chart marks.
 *
 * Answers 200 { success: true, data: { id, status, lastPublishedAt } },
 * 400 for a malformed id, 404 if the article doesn't exist, and 409 if its status
 * doesn't allow publishing or a required field is empty.
 *
 * @param {import('express').Request} request - params.id; session.user is the editor.
 * @param {import('express').Response} response - The JSON answer.
 * @returns {Promise<void>}
 */
async function approveArticle(request, response) {
  const article = await findArticleFromUrl(request, response);
  if (!article) {
    return;
  }

  // The status rules live in articleWorkflow.js (only pending -> published, only
  // by an editor). The role comes from the server-side session, never the browser.
  if (!canTransition(article.status, STATUS.PUBLISHED, request.session.user.role)) {
    sendError(response, 409, `An article that is "${STATUS_LABELS[article.status]}" can't be published`);
    return;
  }

  // The editor may have edited the draft after it was submitted, so we check again
  // that nothing readers need is missing.
  const missingFields = REQUIRED_CONTENT_FIELDS.filter((field) => !(article.draft[field] || '').trim());
  if (missingFields.length > 0) {
    sendError(response, 409, `The article can't be published without: ${missingFields.join(', ')}`);
    return;
  }

  // One "now" for all three dates, so lastPublishedAt and the new publishHistory
  // entry are exactly the same moment (the chart marker and the feed date agree).
  const now = new Date();

  // toObject() makes a separate plain copy of the draft. Later edits to the draft
  // then can't change what readers see until the next approval.
  article.published = article.draft.toObject();
  article.status = STATUS.PUBLISHED;
  article.editorNote = '';
  if (!article.firstPublishedAt) {
    article.firstPublishedAt = now;
  }
  article.lastPublishedAt = now;
  article.publishHistory.push({ publishedAt: now, editor: request.session.user.id });

  // save() runs the model's validation (lengths, category) before writing.
  await article.save();

  logger.info(`Article ${article._id} approved and published by editor "${request.session.user.displayName}"`);
  response.json({
    success: true,
    data: { id: article._id.toString(), status: article.status, lastPublishedAt: article.lastPublishedAt },
  });
}

/**
 * POST /api/editor/articles/:id/return - body { note }. Sends the article back to its
 * reporter for corrections, with a note saying what to fix.
 *
 * Only the working copy changes status. If the article is live, its published
 * version stays exactly as it is, so readers keep seeing the last approved version.
 *
 * Answers 200 { success: true, data: { id, status, editorNote } },
 * 400 if the note is missing, empty or too long (or the id is malformed),
 * 404 if the article doesn't exist, and 409 if its status doesn't allow returning.
 *
 * @param {import('express').Request} request - params.id, body.note; session.user is the editor.
 * @param {import('express').Response} response - The JSON answer.
 * @returns {Promise<void>}
 */
async function returnArticleToReporter(request, response) {
  // In Express 5, request.body is undefined when the request has no body at all,
  // so we fall back to an empty object instead of crashing on undefined.note.
  const body = request.body || {};
  const note = typeof body.note === 'string' ? body.note.trim() : '';

  // The note is checked before the database is touched: without it there is
  // nothing to do (the requirements say a return always comes with a note).
  if (note === '') {
    sendError(response, 400, 'Please write a note telling the reporter what to fix');
    return;
  }
  if (note.length > MAX_EDITOR_NOTE_LENGTH) {
    sendError(response, 400, `The note can be at most ${MAX_EDITOR_NOTE_LENGTH} characters`);
    return;
  }

  const article = await findArticleFromUrl(request, response);
  if (!article) {
    return;
  }

  if (!canTransition(article.status, STATUS.RETURNED, request.session.user.role)) {
    sendError(response, 409, `An article that is "${STATUS_LABELS[article.status]}" can't be returned`);
    return;
  }

  // published is deliberately not touched.
  article.status = STATUS.RETURNED;
  article.editorNote = note;
  await article.save();

  logger.info(`Article ${article._id} returned to its reporter by editor "${request.session.user.displayName}"`);
  response.json({
    success: true,
    data: { id: article._id.toString(), status: article.status, editorNote: article.editorNote },
  });
}

/**
 * DELETE /api/editor/articles/:id - deletes an article together with everything
 * that belongs to it: its comments, its hourly view statistics and the devices'
 * "viewed" marks. Without this, those documents would stay in the database forever,
 * pointing to an article that no longer exists. The browser asks the editor to
 * confirm before calling this.
 *
 * Order matters because our MongoDB is a single server, which has no transactions
 * (all-or-nothing writes need a replica set). We delete the article FIRST: if a
 * later step failed, what is left are only leftovers nobody can see (the article
 * page and chart answer 404 without the article). The other order could fail
 * halfway and leave a live article whose comments and statistics are gone.
 *
 * Any status can be deleted: the requirements let the editor delete content
 * "as needed", so this is not a status change and canTransition isn't asked.
 *
 * Answers 200 { success: true, data: { id, deletedComments, deletedViewStats,
 * deletedDeviceViews } }, 400 for a malformed id, 404 if the article doesn't exist.
 *
 * @param {import('express').Request} request - params.id; session.user is the editor.
 * @param {import('express').Response} response - The JSON answer.
 * @returns {Promise<void>}
 */
async function deleteArticle(request, response) {
  const article = await findArticleFromUrl(request, response);
  if (!article) {
    return;
  }

  await article.deleteOne();

  // The three related deletes don't depend on each other, so they run at the same time.
  const [commentsResult, viewStatsResult, deviceViewsResult] = await Promise.all([
    Comment.deleteMany({ article: article._id }),
    ArticleViewStats.deleteMany({ article: article._id }),
    DeviceArticleView.deleteMany({ article: article._id }),
  ]);

  logger.info(
    `Article ${article._id} deleted by editor "${request.session.user.displayName}" ` +
    `(${commentsResult.deletedCount} comments, ${viewStatsResult.deletedCount} view counters, ` +
    `${deviceViewsResult.deletedCount} device marks)`
  );
  response.json({
    success: true,
    data: {
      id: article._id.toString(),
      deletedComments: commentsResult.deletedCount,
      deletedViewStats: viewStatsResult.deletedCount,
      deletedDeviceViews: deviceViewsResult.deletedCount,
    },
  });
}

module.exports = {
  showEditorDashboard,
  showArticleReview,
  listAllArticles,
  editArticleDraft,
  approveArticle,
  returnArticleToReporter,
  deleteArticle,
};
