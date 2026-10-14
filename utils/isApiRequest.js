/**
 * utils/isApiRequest.js
 *
 * Tells whether a request is for the JSON API (/api/...) or for a normal page.
 * The answer decides how we reply to an error: an API call gets JSON
 * ({ success: false, error }), which the browser's fetch code can read, while
 * a page gets the HTML error page (or a redirect to /login), which a person can read.
 *
 * Not a middleware itself (it never calls next), so it lives in utils/ with the other
 * small helpers, not in middleware/.
 *
 * Used by: middleware/errorHandler.js (JSON or error page), middleware/requireLogin.js
 * (401 JSON or a redirect to /login; requireRole.js uses it through requireLogin).
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
 * so this matters: a first version used request.path alone, and testing every route
 * as a guest showed that /api calls got a redirect to /login instead of 401 JSON.
 *
 * @param {import('express').Request} request - The incoming request.
 * @returns {boolean} true for "/api" and anything under "/api/".
 */
function isApiRequest(request) {
  const fullPath = request.baseUrl + request.path;
  return fullPath === '/api' || fullPath.startsWith('/api/');
}

module.exports = isApiRequest;
