/**
 * controllers/weatherController.js
 *
 * PLACEHOLDER, created by OS in phase 0 so every route exists from day one.
 * Owner: SH. Replace the function body with the real logic, but keep the function
 * name and module.exports: routes/apiRoutes/weatherApiRoutes.js already calls it.
 * If you already wrote your own version of this file on another branch, keep yours
 * when merging (with the same exported names) and drop this placeholder.
 * Until then it answers 501 { success: false, error: "Not implemented yet" }.
 *
 * What it will do: return the cached weather from services/weatherService.js
 * (getWeather), so the sidebar widget can load it with fetch.
 *
 * Used by: routes/apiRoutes/weatherApiRoutes.js.
 */

/**
 * GET /api/weather - the cached weather for the sidebar. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function getCurrentWeather(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
}

module.exports = { getCurrentWeather };
