/**
 * middleware/errorHandler.js
 *
 * The last middleware: every error ends up here (next(error), a thrown error, or in
 * Express 5 a rejected promise). It picks the status and a readable message, logs the
 * error, and answers with JSON for /api or the error page otherwise. So bad input or a
 * failed database call never crashes the server or shows a stack trace.
 *
 * To choose the status yourself, create the error with statusCode set to a 4xx number
 * (utils/httpErrors.js); its message is what the user sees.
 *
 * Used by: app.js (registered last).
 * Owner: OS.
 */

const isApiRequest = require('../utils/isApiRequest');
const logger = require('../services/logger');

// For every 500: the real message could reveal file paths or queries.
const SERVER_ERROR_MESSAGE = 'Something went wrong on our side. Please try again later.';

// MongoDB's code for "a unique index already has this value" (a taken username).
const DUPLICATE_KEY_ERROR_CODE = 11000;

/**
 * Turns any error into the status and message we send. Each "if" is one known kind of
 * error; anything else is a 500.
 *
 * @param {Error} error
 * @returns {{statusCode: number, message: string}}
 */
function getErrorResponse(error) {
  // express.json() couldn't parse the body.
  if (error.type === 'entity.parse.failed') {
    return { statusCode: 400, message: 'Invalid JSON in the request body' };
  }

  // Larger than the 1mb limit in app.js.
  if (error.type === 'entity.too.large') {
    return { statusCode: 400, message: 'The request is too large' };
  }

  // Mongoose couldn't convert a value, usually a malformed id.
  if (error.name === 'CastError') {
    return { statusCode: 400, message: `Invalid value for ${error.path}` };
  }

  // A schema rule failed; the messages are the ones we wrote in the models.
  if (error.name === 'ValidationError') {
    const fieldMessages = Object.values(error.errors).map((fieldError) => fieldError.message);
    return { statusCode: 400, message: fieldMessages.join('. ') };
  }

  // A unique index refused a duplicate; keyValue is for example { username: 'dana' }.
  if (error.code === DUPLICATE_KEY_ERROR_CODE) {
    const fieldName = error.keyValue ? Object.keys(error.keyValue)[0] : 'value';
    return { statusCode: 409, message: `This ${fieldName} already exists` };
  }

  // A broken "%" in a route parameter (/articles/%E0%A4%A): Express marks it 400 before
  // any controller runs. Checking status 400 keeps a URIError from our own bug a 500.
  if (error instanceof URIError && error.status === 400) {
    return { statusCode: 400, message: 'The address contains invalid characters.' };
  }

  // A 4xx from our code (statusCode) or from Express (status): the user's mistake, so the
  // message is safe to show.
  const clientStatus = error.statusCode || error.status;
  if (Number.isInteger(clientStatus) && clientStatus >= 400 && clientStatus < 500) {
    return { statusCode: clientStatus, message: error.message };
  }

  return { statusCode: 500, message: SERVER_ERROR_MESSAGE };
}

/**
 * The error-handling middleware. Express recognises it by its four parameters, so "next"
 * must stay even though it is rarely used.
 *
 * @param {Error} error
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @param {import('express').NextFunction} next - Express's own handler.
 * @returns {void}
 */
function handleError(error, request, response, next) {
  const { statusCode, message } = getErrorResponse(error);
  const requestDescription = `${request.method} ${request.originalUrl}`;

  // A 500 is our bug or an outage: log the stack trace. A 4xx: one short line.
  if (statusCode >= 500) {
    logger.error(`${requestDescription} failed with ${statusCode}`, error);
  } else {
    logger.info(`${requestDescription} answered ${statusCode}: ${message}`);
  }

  // Part of the reply was already sent: Express's own handler closes the connection.
  if (response.headersSent) {
    return next(error);
  }

  response.status(statusCode);

  if (isApiRequest(request)) {
    response.json({ success: false, error: message });
    return;
  }

  // The callback notices if the error page itself fails, and falls back to plain text.
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
