/**
 * utils/httpErrors.js
 *
 * createHttpError() builds an Error with an HTTP status, the way every controller says
 * "stop and answer this": throw createHttpError(404, 'Article not found.');
 * errorHandler answers with that status and message. In Express 5 a thrown error in an
 * async controller reaches errorHandler by itself, so no try/catch is needed.
 * Only a 4xx message is shown to the user; anything else becomes a generic 500.
 *
 * Used by: the controllers, services/draftValidation.js, utils/requestValidation.js.
 * Owner: OS.
 */

/**
 * Creates an Error that errorHandler turns into a clean answer with this status.
 *
 * @param {number} statusCode - A 4xx status, for example 400, 403, 404, 409 or 429.
 * @param {string} message - A sentence the user can read.
 * @returns {Error} The error with statusCode set, ready to throw or pass to next().
 */
function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = { createHttpError };
