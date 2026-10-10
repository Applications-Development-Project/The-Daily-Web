/**
 * controllers/reporterController.js
 *
 * PLACEHOLDER, created by OS in phase 0 so every route exists from day one.
 * Owner: EZ. Replace the function bodies with the real logic, but keep the function
 * names and module.exports: the route files below already call them.
 * If you already wrote your own version of this file on another branch, keep yours
 * when merging (with the same exported names) and drop this placeholder.
 * Until then, API functions answer 501 { success: false, error: "Not implemented yet" }
 * and page functions show the shared error page with status 501.
 *
 * What it will do: the reporter's dashboard and article editor pages, listing and
 * creating the reporter's own articles, autosaving the draft, and submitting an
 * article for approval (checked with canTransition from services/articleWorkflow.js).
 *
 * Used by: routes/pageRoutes/reporterPageRoutes.js, routes/apiRoutes/reporterApiRoutes.js.
 * Related: models/Article.js, services/articleWorkflow.js (STATUS, STATUS_LABELS).
 */

const Article = require('../models/Article');
const { STATUS, STATUS_LABELS } = require('../services/articleWorkflow');

/**
 * GET /reporter - the reporter's dashboard. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function showReporterDashboard(request, response) {
  response.status(501).render('public/error', { statusCode: 501, message: 'The reporter dashboard is not built yet.' });
}

/**
 * GET /reporter/articles/:id/edit - the article editor page. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function showArticleEditor(request, response) {
  response.status(501).render('public/error', { statusCode: 501, message: 'The article editor is not built yet.' });
}

/**
 * GET /api/reporter/articles - the logged-in reporter's own articles, newest update
 * first, each with its status label.
 *
 * The reporter id comes from the server-side session, never from the request, so a
 * reporter can't ask for someone else's list. Each item describes the WORKING copy
 * (draft), because that is what the reporter is editing; "isLive" says whether readers
 * can see an approved version, so the dashboard can show a "Live version online" badge
 * (an article that is live and back in "draft" is still online with its old text).
 * The editor's note is sent only for returned articles, where it is relevant.
 * No try/catch: in Express 5 an error thrown here reaches errorHandler by itself.
 *
 * @param {import('express').Request} request - request.session.user is the reporter.
 * @param {import('express').Response} response - Answers { success: true, data: { articles } }.
 * @returns {Promise<void>}
 */
async function listMyArticles(request, response) {
  const articles = await Article.find({ reporter: request.session.user.id })
    // Uses the { reporter: 1, updatedAt: -1 } index, so this stays fast with many articles.
    .sort({ updatedAt: -1 })
    // Only the fields the dashboard shows; the long body is never loaded.
    .select('status draft.title draft.summary draft.category published editorNote updatedAt')
    // lean() returns plain objects instead of full Mongoose documents: faster, read-only.
    .lean();

  const items = articles.map((article) => ({
    id: article._id.toString(),
    title: article.draft.title,
    summary: article.draft.summary,
    category: article.draft.category,
    status: article.status,
    statusLabel: STATUS_LABELS[article.status],
    // published is null until an editor approves the article for the first time.
    isLive: article.published !== null && article.published !== undefined,
    editorNote: article.status === STATUS.RETURNED ? article.editorNote : '',
    updatedAt: article.updatedAt,
  }));

  response.json({ success: true, data: { articles: items } });
}

/**
 * POST /api/reporter/articles - create a new draft article. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function createArticle(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
}

/**
 * PATCH /api/reporter/articles/:id/draft - autosave the draft. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function autosaveDraft(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
}

/**
 * POST /api/reporter/articles/:id/submit - send the article to the editor. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function submitArticleForApproval(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
}

module.exports = {
  showReporterDashboard,
  showArticleEditor,
  listMyArticles,
  createArticle,
  autosaveDraft,
  submitArticleForApproval,
};
