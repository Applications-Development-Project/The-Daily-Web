/**
 * services/logger.js
 *
 * One place for all server logging. Every file calls logger.info() for important
 * operational events (server start, database connection, logins, article status
 * changes) and logger.error() for failures, instead of calling console.log directly.
 * Because everyone goes through these two functions, we can change where logs go
 * without touching any caller.
 *
 * Phase 0 version: writes to the console only. In phase 2 OS adds log files
 * (logs/app.log and logs/error.log). The function names and parameters stay the
 * same, so no caller has to change.
 *
 * Called by: server.js, config/database.js, middleware/errorHandler.js and the controllers.
 * Owner: OS.
 */

/**
 * Builds one log line with a timestamp and a level, so every line has the same shape
 * and lines can be sorted and searched by time.
 *
 * @param {string} level - "INFO" or "ERROR".
 * @param {string} message - What happened.
 * @returns {string} For example "[2026-10-05T18:30:00.000Z] INFO Server listening on port 3000".
 */
function formatLogLine(level, message) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] ${level} ${message}`;
}

/**
 * Logs a normal operational event.
 *
 * @param {string} message - What happened, for example "User dana logged in".
 * @returns {void}
 */
function logInfo(message) {
  console.log(formatLogLine('INFO', message));
}

/**
 * Logs a failure. When an Error object is given we also print its stack trace,
 * because the stack shows the exact file and line where the problem started.
 *
 * @param {string} message - What we were trying to do, for example "Could not save comment".
 * @param {Error} [error] - The caught error, if there is one.
 * @returns {void}
 */
function logError(message, error) {
  console.error(formatLogLine('ERROR', message));
  if (error && error.stack) {
    console.error(error.stack);
  } else if (error) {
    console.error(String(error));
  }
}

// Exported as logger.info and logger.error, the names fixed in "Shared contracts".
module.exports = {
  info: logInfo,
  error: logError,
};
