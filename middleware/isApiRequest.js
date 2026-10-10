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
 * Inside a router, Express makes request.path relative to where the router is
 * mounted: in a router mounted at "/api", a request for "/api/users" has
 * request.path "/users". request.baseUrl holds the mount prefix ("/api" there,
 * "" in middleware on the whole app), so baseUrl + path is always the full path,
 * without the query string. requireLogin and requireRole run inside routers,
 * so this matters.
 *
 * @param {import('express').Request} request - The incoming request.
 * @returns {boolean} true for "/api" and anything under "/api/".
 */
function isApiRequest(request) {
  const fullPath = request.baseUrl + request.path;
  return fullPath === '/api' || fullPath.startsWith('/api/');
}

module.exports = isApiRequest;
