/**
 * services/logger.js
 *
 * All server logging: logger.info() for significant events (start, database, logins,
 * article status changes...), logger.warn() for an expected, handled problem (the weather
 * service down) and logger.error() for failures. Every line goes to the console and
 * logs/app.log; errors also go, with their stack trace, to logs/error.log, so failures are
 * easy to find. The logs folder is created at startup and is in .gitignore.
 *
 * Called by: server.js, config/database.js, the middleware, the controllers, the services
 * and scripts/seed.js.
 * Owner: OS.
 */

const fs = require('fs');
const path = require('path');

// From this file's folder, so the logs land in the same place wherever the server is started.
const LOGS_FOLDER = path.join(__dirname, '..', 'logs');
const APP_LOG_PATH = path.join(LOGS_FOLDER, 'app.log');
const ERROR_LOG_PATH = path.join(LOGS_FOLDER, 'error.log');

// Once, at startup; recursive: no error if it already exists.
fs.mkdirSync(LOGS_FOLDER, { recursive: true });

// One stream kept open: lines are written in exactly the order given (separate
// fs.appendFile calls could finish out of order). flags 'a' = append.
const appLogStream = fs.createWriteStream(APP_LOG_PATH, { flags: 'a' });

// Without a listener, a write error (disk full) would stop the whole process.
appLogStream.on('error', (streamError) => {
  console.error(`Could not write to ${APP_LOG_PATH}: ${streamError.message}`);
});

/**
 * Builds one log line with a timestamp and a level.
 *
 * @param {string} level - "INFO", "WARN" or "ERROR".
 * @param {string} message - What happened.
 * @returns {string} For example "[2026-10-05T18:30:00.000Z] INFO Server listening on port 3000".
 */
function formatLogLine(level, message) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] ${level} ${message}`;
}

/**
 * Describes the error given to logError.
 *
 * @param {*} [error]
 * @returns {string|null} The stack trace (file and line), the value as text, or null.
 */
function describeError(error) {
  if (error && error.stack) {
    return error.stack;
  }
  if (error) {
    return String(error);
  }
  return null;
}

/**
 * Adds an entry to error.log synchronously, so an error logged right before the process
 * exits is never lost. A failure to write is reported on the console, never thrown.
 *
 * @param {string} entry - The log line plus the error's description.
 * @returns {void}
 */
function appendToErrorLog(entry) {
  try {
    fs.appendFileSync(ERROR_LOG_PATH, `${entry}\n`);
  } catch (writeError) {
    console.error(`Could not write to ${ERROR_LOG_PATH}: ${writeError.message}`);
  }
}

/**
 * Logs a normal event: console and app.log.
 *
 * @param {string} message - For example "User dana logged in".
 * @returns {void}
 */
function logInfo(message) {
  const line = formatLogLine('INFO', message);
  console.log(line);
  appLogStream.write(`${line}\n`);
}

/**
 * Logs an expected, handled problem: console and app.log, not error.log.
 *
 * @param {string} message - For example "Weather service failed: timeout".
 * @returns {void}
 */
function logWarning(message) {
  const line = formatLogLine('WARN', message);
  console.warn(line);
  appLogStream.write(`${line}
`);
}

/**
 * Logs a failure: console, app.log (one line) and error.log (with the stack trace).
 *
 * @param {string} message - What we were trying to do.
 * @param {Error} [error] - The caught error, if there is one.
 * @returns {void}
 */
function logError(message, error) {
  const line = formatLogLine('ERROR', message);
  const errorDescription = describeError(error);

  // console.error writes to stderr, separate from normal output.
  console.error(line);
  if (errorDescription) {
    console.error(errorDescription);
  }

  appLogStream.write(`${line}\n`);
  appendToErrorLog(errorDescription ? `${line}\n${errorDescription}` : line);
}

// Exported as logger.info, .warn and .error (the contract's names); inside, verb-first names.
module.exports = {
  info: logInfo,
  warn: logWarning,
  error: logError,
};
