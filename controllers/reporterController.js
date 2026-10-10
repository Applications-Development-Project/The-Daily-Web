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
 */

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
 * GET /api/reporter/articles - the logged-in reporter's articles. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function listMyArticles(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
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
