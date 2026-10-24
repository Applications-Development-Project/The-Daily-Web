/**
 * middleware/notFoundHandler.js
 *
 * Runs when no route matched (app.js registers it after every router). It creates a 404
 * error and passes it on, so errorHandler formats it like every other error.
 *
 * Used by: app.js (after all routers, before errorHandler).
 * Owner: OS.
 */

/**
 * Turns "no route matched" into a 404 error for errorHandler.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response - Not used; errorHandler replies.
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
function handleNotFound(request, response, next) {
  const error = new Error('The page you are looking for does not exist.');
  error.statusCode = 404;
  next(error);
}

module.exports = handleNotFound;
