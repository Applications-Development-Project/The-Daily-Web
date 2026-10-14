/**
 * utils/httpErrors.js
 *
 * One small helper, createHttpError(), that builds an Error carrying an HTTP status code.
 * It is how every controller says "stop here and answer this status with this message":
 *
 *   throw createHttpError(404, 'Article not found.');
 *
 * middleware/errorHandler.js then answers with that status and message: JSON
 * { success: false, error } for /api requests, the shared error page for normal pages.
 * This is the team's "Errors from controllers" contract (see the README).
 *
 * Why throwing works without try/catch: we use Express 5, which passes an error thrown
 * inside an async route handler (a rejected promise) to errorHandler by itself. In
 * Express 4 every async controller would need try/catch and next(error).
 *
 * Why only 4xx statuses: errorHandler shows the message of a 4xx error to the user,
 * because it describes the user's own mistake ("Invalid article id."). Anything else is
 * treated as a 500, and its real message stays in the log, because it could reveal
 * internals such as file paths or queries.
 *
 * Before this file existed, four controllers each had their own copy of this function
 * (createClientError, createPageError, createHttpError); one shared copy can't drift apart.
 *
 * Used by: the controllers, services/draftValidation.js, utils/requestValidation.js.
 * Related: middleware/errorHandler.js.
 * Owner: OS.
 */

/**
 * Creates an Error that errorHandler turns into a clean answer with this HTTP status.
 *
 * @param {number} statusCode - A 4xx HTTP status, for example 400, 403, 404, 409 or 429.
 * @param {string} message - A sentence the user can read.
 * @returns {Error} The error, with statusCode set, ready to be thrown or passed to next().
 */
function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = { createHttpError };
