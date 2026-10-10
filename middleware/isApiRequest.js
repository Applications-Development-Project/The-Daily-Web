/**
 * middleware/isApiRequest.js
 *
 * Tells whether a request is for the JSON API (/api/...) or for a normal page.
 * The answer decides how we reply to an error: an API call gets JSON
 * ({ success: false, error }), which the browser's fetch code can read, while
 * a page gets the HTML error page (or a redirect to /login), which a person can read.
 *
 * Not a middleware itself; a small helper used by the middleware in this folder.
 *
 * Used by: middleware/errorHandler.js, and middleware/requireLogin.js and
 * requireRole.js (401/403 replies).
 * Owner: OS.
 */

/**
 * Checks whether the request is for the JSON API.
 *
 * request.path is the full path without the query string (for example
 * "/api/articles" for "/api/articles?page=2"), because this helper runs in
 * middleware mounted on the whole app, not inside a router.
 *
 * @param {import('express').Request} request - The incoming request.
 * @returns {boolean} true for "/api" and anything under "/api/".
 */
function isApiRequest(request) {
  return request.path === '/api' || request.path.startsWith('/api/');
}

module.exports = isApiRequest;
