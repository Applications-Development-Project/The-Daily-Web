/**
 * controllers/analyticsController.js
 *
 * PLACEHOLDER, created by OS in phase 0 so every route exists from day one.
 * Owner: SM. Replace the function bodies with the real logic, but keep the function
 * names and module.exports: the route files below already call them.
 * If you already wrote your own version of this file on another branch, keep yours
 * when merging (with the same exported names) and drop this placeholder.
 * Until then, API functions answer 501 { success: false, error: "Not implemented yet" }
 * and page functions show the shared error page with status 501.
 *
 * What it will do: the Impact Analytics page, the hourly views of an article with its
 * publish times (for the chart), and resetting an article's statistics.
 *
 * Used by: routes/pageRoutes/analyticsPageRoutes.js, routes/apiRoutes/analyticsApiRoutes.js.
 */

/**
 * GET /editor/analytics - the Impact Analytics page. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function showAnalyticsPage(request, response) {
  response.status(501).render('public/error', { statusCode: 501, message: 'Impact Analytics is not built yet.' });
}

/**
 * GET /api/editor/articles/:id/views?from=&to= - hourly views and publish times. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function getArticleViews(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
}

/**
 * DELETE /api/editor/articles/:id/views - reset an article's statistics. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function resetArticleViews(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
}

module.exports = { showAnalyticsPage, getArticleViews, resetArticleViews };
