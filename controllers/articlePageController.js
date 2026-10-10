/**
 * controllers/articlePageController.js
 *
 * PLACEHOLDER, created by OS in phase 0 so every route exists from day one.
 * Owner: SH. Replace the function body with the real logic, but keep the function
 * name and module.exports: routes/pageRoutes/articlePageRoutes.js already calls it.
 * If you already wrote your own version of this file on another branch, keep yours
 * when merging (with the same exported names) and drop this placeholder.
 * Until then the page shows the shared error page with status 501.
 *
 * What it will do: render the full article from "published" on the server (so the
 * whole text is in the page source for search engines), with the first comments,
 * call recordView(article._id, req.deviceId), and show the 404 error page for an id
 * that is invalid, missing or not live.
 *
 * Used by: routes/pageRoutes/articlePageRoutes.js.
 */

/**
 * GET /articles/:id - the full article page. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function showArticlePage(request, response) {
  response.status(501).render('public/error', { statusCode: 501, message: 'The article page is not built yet.' });
}

module.exports = { showArticlePage };
