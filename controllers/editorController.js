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

const Article = require('../models/Article');
const { STATUS, STATUS_LABELS } = require('../services/articleWorkflow');

// The dashboard shows 20 articles per page ("Shared contracts").
const ARTICLES_PER_PAGE = 20;
// Titles are at most 200 characters, so a longer search can never match anything.
const MAX_SEARCH_LENGTH = 200;

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
 * POST /api/editor/articles/:id/approve - publish the draft. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function approveArticle(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
}

/**
 * POST /api/editor/articles/:id/return - return to the reporter with a note. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function returnArticleToReporter(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
}

/**
 * DELETE /api/editor/articles/:id - delete an article and its related data. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function deleteArticle(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
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
