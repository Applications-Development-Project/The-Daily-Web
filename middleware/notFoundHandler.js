/**
 * middleware/notFoundHandler.js
 *
 * Runs when no route matched the request, because app.js registers it after
 * every router. It doesn't reply itself: it creates a 404 error and passes it on,
 * so errorHandler.js formats it exactly like every other error (JSON for /api,
 * the shared error page otherwise) and there is only one place that sends errors.
 *
 * Used by: app.js (after all routers, before errorHandler).
 * Related: middleware/errorHandler.js, views/public/error.ejs.
 * Owner: OS.
 */

/**
 * Turns "no route matched" into a 404 error for errorHandler.
 *
 * @param {import('express').Request} request - The request no route answered.
 * @param {import('express').Response} response - Not used; errorHandler replies.
 * @param {import('express').NextFunction} next - Passes the 404 error on.
 * @returns {void}
 */
function handleNotFound(request, response, next) {
  const error = new Error('The page you are looking for does not exist.');
  error.statusCode = 404;
  next(error);
}

module.exports = handleNotFound;
