/**
 * controllers/editorController.js
 *
 * PLACEHOLDER, created by OS in phase 0 so every route exists from day one.
 * Owner: SM. Replace the function bodies with the real logic, but keep the function
 * names and module.exports: the route files below already call them.
 * If you already wrote your own version of this file on another branch, keep yours
 * when merging (with the same exported names) and drop this placeholder.
 * Until then, API functions answer 501 { success: false, error: "Not implemented yet" }
 * and page functions show the shared error page with status 501.
 *
 * What it will do: the editor's dashboard of all articles and the review page,
 * editing a submitted draft, approving (draft copied into published), returning with
 * a note, and deleting an article with its comments and statistics.
 *
 * Used by: routes/pageRoutes/editorPageRoutes.js, routes/apiRoutes/editorApiRoutes.js.
 */

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
 * GET /api/editor/articles?status=&search=&page= - all articles, 20 per page. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function listAllArticles(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
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
