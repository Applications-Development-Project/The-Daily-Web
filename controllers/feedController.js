/**
 * controllers/feedController.js
 *
 * PLACEHOLDER, created by OS in phase 0 so every route exists from day one.
 * Owner: SH. Replace the function bodies with the real logic, but keep the function
 * names and module.exports: the route files below already call them.
 * If you already wrote your own version of this file on another branch, keep yours
 * when merging (with the same exported names) and drop this placeholder.
 * Until then, API functions answer 501 { success: false, error: "Not implemented yet" }
 * and page functions show the shared error page with status 501.
 *
 * What it will do: the home page feed (first 20 live articles rendered on the server),
 * the feed API used by infinite scroll, search, filters and sorting, and resetting
 * this device's "viewed" marks.
 *
 * Used by: routes/pageRoutes/feedPageRoutes.js, routes/apiRoutes/feedApiRoutes.js.
 */

/**
 * GET / - the feed page. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function showFeedPage(request, response) {
  response.status(501).render('public/error', { statusCode: 501, message: 'The news feed is not built yet.' });
}

/**
 * GET /api/articles?search=&category=&viewed=&sort=&page= - 20 live articles. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function listFeedArticles(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
}

/**
 * DELETE /api/articles/viewed - forget which articles this device has seen. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function resetViewedMarks(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
}

module.exports = { showFeedPage, listFeedArticles, resetViewedMarks };
