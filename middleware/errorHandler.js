/**
 * middleware/errorHandler.js
 *
 * The last middleware in app.js. Every error in the app ends up here: errors passed
 * with next(error), errors thrown in a route, and (Express 5) rejected promises in
 * async controllers. It does three things:
 *   1. Decides the HTTP status and a message a user can read.
 *   2. Logs the error (server errors with their full stack trace).
 *   3. Replies with JSON for /api requests, or the error page for normal pages.
 * Because of this, bad input or a failed database call never crashes the server
 * and never shows the user a raw stack trace.
 *
 * How other files use it: just call next(error). To choose the status yourself,
 * set error.statusCode to a 4xx number, and error.message becomes the message
 * the user sees, for example:
 *   const error = new Error('Article not found');
 *   error.statusCode = 404;
 *   return next(error);
 *
 * Used by: app.js (registered last).
 * Related: middleware/isApiRequest.js, middleware/notFoundHandler.js,
 * views/public/error.ejs, services/logger.js.
 * Owner: OS.
 */

const isApiRequest = require('./isApiRequest');
const logger = require('../services/logger');

// Shown for every unexpected (500) error. We never send the real error message to
// the browser in that case: it can reveal file paths, queries or other internals.
const SERVER_ERROR_MESSAGE = 'Something went wrong on our side. Please try again later.';

// MongoDB's error code for "a unique index already has this value",
// for example a username that is already taken.
const DUPLICATE_KEY_ERROR_CODE = 11000;

/**
 * Turns any error into the status code and message we send back.
 * Each "if" handles one known kind of error; anything we don't recognise is a 500.
 *
 * @param {Error} error - The error that reached the handler.
 * @returns {{statusCode: number, message: string}} What to send to the user.
 */
function getErrorResponse(error) {
  // express.json() couldn't parse the body, for example a missing quote or brace.
  if (error.type === 'entity.parse.failed') {
    return { statusCode: 400, message: 'Invalid JSON in the request body' };
  }

  // The body is larger than the limit set in app.js (1mb).
  if (error.type === 'entity.too.large') {
    return { statusCode: 400, message: 'The request is too large' };
  }

  // Mongoose couldn't convert a value to the type in the schema. The usual case is
  // a malformed id in the URL, for example /articles/abc instead of a 24-character id.
  if (error.name === 'CastError') {
    return { statusCode: 400, message: `Invalid value for ${error.path}` };
  }

  // A schema rule failed (required, maxlength, enum...). Mongoose collects one error
  // per field; we join their messages, which we wrote ourselves in the models.
  if (error.name === 'ValidationError') {
    const fieldMessages = Object.values(error.errors).map((fieldError) => fieldError.message);
    return { statusCode: 400, message: fieldMessages.join('. ') };
  }

  // A unique index refused a duplicate. keyValue holds the field that clashed,
  // for example { username: 'dana' }.
  if (error.code === DUPLICATE_KEY_ERROR_CODE) {
    const fieldName = error.keyValue ? Object.keys(error.keyValue)[0] : 'value';
    return { statusCode: 409, message: `This ${fieldName} already exists` };
  }

  // An error our own code created on purpose, with a 4xx status and a readable message
  // (see the example in the header). We accept only 4xx here: those are the user's
  // mistakes, so their message is safe and useful to show.
  if (Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode < 500) {
    return { statusCode: error.statusCode, message: error.message };
  }

  return { statusCode: 500, message: SERVER_ERROR_MESSAGE };
}

/**
 * Express error-handling middleware. Express recognises it as an error handler
 * because it has four parameters, so "next" must stay in the list even though
 * it is only used in one case.
 *
 * @param {Error} error - The error passed to next(error) or thrown in a route.
 * @param {import('express').Request} request - The request that failed.
 * @param {import('express').Response} response - Used to send the error reply.
 * @param {import('express').NextFunction} next - Express's own error handler.
 * @returns {void}
 */
function handleError(error, request, response, next) {
  const { statusCode, message } = getErrorResponse(error);
  const requestDescription = `${request.method} ${request.originalUrl}`;

  // 500s are our bugs or outages: log everything, including the stack trace.
  // 4xx are the user's mistakes: one short line is enough.
  if (statusCode >= 500) {
    logger.error(`${requestDescription} failed with ${statusCode}`, error);
  } else {
    logger.info(`${requestDescription} answered ${statusCode}: ${message}`);
  }

  // If part of the reply was already sent, we can't change the status any more.
  // Express's built-in handler then closes the connection properly.
  if (response.headersSent) {
    return next(error);
  }

  response.status(statusCode);

  if (isApiRequest(request)) {
    response.json({ success: false, error: message });
    return;
  }

  // The callback form of render lets us notice if the error page itself fails
  // (for example a broken view); then we fall back to plain text instead of crashing.
  response.render('public/error', { statusCode, message }, (renderError, html) => {
    if (renderError) {
      logger.error('Could not render the error page', renderError);
      response.type('text/plain').send(message);
      return;
    }
    response.send(html);
  });
}

module.exports = handleError;
