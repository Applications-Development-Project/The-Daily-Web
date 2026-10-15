/**
 * utils/isApiRequest.js
 *
 * Tells whether a request is for the JSON API (/api/...) or a page, which decides how an
 * error is answered: JSON for fetch code, or an HTML page (or a redirect) for a person.
 *
 * Used by: middleware/errorHandler.js, middleware/requireLogin.js.
 * Owner: OS.
 */

/**
 * Inside a router mounted at "/api", request.path is relative ("/users"), so the full
 * path is baseUrl + path. (Using request.path alone once made /api calls get a redirect
 * to /login instead of 401 JSON.)
 *
 * @param {import('express').Request} request
 * @returns {boolean} true for "/api" and anything under "/api/".
 */
function isApiRequest(request) {
  const fullPath = request.baseUrl + request.path;
  return fullPath === '/api' || fullPath.startsWith('/api/');
}

module.exports = isApiRequest;
