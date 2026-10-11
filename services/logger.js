/**
 * services/logger.js
 *
 * One place for all server logging. Every file calls logger.info() for important
 * operational events (server start, database connection, logins, article status
 * changes) and logger.error() for failures, instead of calling console.log directly.
 * Because everyone goes through these two functions, where the logs go is decided
 * here only, and no caller had to change when the log files were added.
 *
 * Requirement covered: "keep logs of errors and significant operational events".
 * Events logged: server start; database connected and connection lost; login success,
 * login failure and logout; users created, updated or deleted; new, edited and deleted
 * comments; the comment limit being reached; articles submitted, approved, returned or
 * deleted (EZ's and SM's controllers); every 4xx error as one line
 * (errorHandler) and every 500 with its full stack trace.
 *
 * Where each line goes:
 * - the console, as before, so whoever runs "npm run dev" sees what happens;
 * - logs/app.log: every line, INFO and ERROR, so the whole story of the server can be
 *   read in order in one file;
 * - logs/error.log: only errors, each with its stack trace, so failures are easy to find
 *   without scrolling through thousands of normal events.
 * The logs folder is created when the server starts if it doesn't exist. It is in
 * .gitignore: log files are output of the running program, not source code.
 *
 * Called by: server.js, config/database.js, the middleware, the controllers,
 * services/viewTracker.js and scripts/seed.js.
 * Owner: OS.
 */

const fs = require('fs');
const path = require('path');

// The logs folder at the top of the project. Built from __dirname (this file's folder)
// rather than the current working directory, so the logs land in the same place
// whether the server is started from the project folder or from somewhere else.
const LOGS_FOLDER = path.join(__dirname, '..', 'logs');
const APP_LOG_PATH = path.join(LOGS_FOLDER, 'app.log');
const ERROR_LOG_PATH = path.join(LOGS_FOLDER, 'error.log');

// Created once, when this file is first loaded at startup. recursive: true also means
// "no error if the folder already exists". Doing it synchronously here is fine: it
// happens once, before the server accepts any request.
fs.mkdirSync(LOGS_FOLDER, { recursive: true });

// app.log is written through one write stream that stays open, instead of calling
// fs.appendFile for every line. Each fs.appendFile call opens the file, writes and closes
// it on its own, so two calls made quickly one after the other can finish in either
// order, and lines could end up out of order. A stream writes its lines in exactly the
// order they were given, and opening the file once is cheaper for a busy server.
// flags: 'a' means "append": new lines go at the end and old logs are kept.
const appLogStream = fs.createWriteStream(APP_LOG_PATH, { flags: 'a' });

// A stream that can't write (for example the disk is full or the file is read-only)
// emits an "error" event, and Node stops the whole process if nobody listens for it.
// Logging must never bring the server down, so we report it on the console and go on.
appLogStream.on('error', (streamError) => {
  console.error(`Could not write to ${APP_LOG_PATH}: ${streamError.message}`);
});

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
 * Describes the error passed to logError, for the console and error.log.
 *
 * @param {*} [error] - The caught error, if there is one.
 * @returns {string|null} The stack trace (it starts with the error's message and shows
 *   the file and line where the problem started), the value as text if it isn't a
 *   real Error, or null if no error was given.
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
 * Adds an error entry to error.log.
 *
 * Unlike app.log, this file is written synchronously (appendFileSync): the line is on
 * the disk before the function returns. Errors are rare, so the short wait costs
 * nothing, and an error logged right before the process stops (server.js calls
 * process.exit(1) when MongoDB can't be reached) is never lost, which an
 * asynchronous write still waiting in a queue could be.
 * If the file can't be written we say so on the console instead of throwing, because
 * a failure to log must never cause a new failure in the request being handled.
 *
 * @param {string} entry - The log line, plus the error's description on the next lines.
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
 * Logs a normal operational event: to the console and app.log.
 *
 * @param {string} message - What happened, for example "User dana logged in".
 * @returns {void}
 */
function logInfo(message) {
  const line = formatLogLine('INFO', message);
  console.log(line);
  appLogStream.write(`${line}\n`);
}

/**
 * Logs a failure: to the console, app.log (one line, so the timeline there is
 * complete) and error.log (the line plus the stack trace). When an Error object is
 * given we include its stack trace, because the stack shows the exact file and line
 * where the problem started.
 *
 * @param {string} message - What we were trying to do, for example "Could not save comment".
 * @param {Error} [error] - The caught error, if there is one.
 * @returns {void}
 */
function logError(message, error) {
  const line = formatLogLine('ERROR', message);
  const errorDescription = describeError(error);

  // console.error writes to the error stream (stderr) instead of normal output, so
  // errors can be watched or saved separately from ordinary events.
  console.error(line);
  if (errorDescription) {
    console.error(errorDescription);
  }

  appLogStream.write(`${line}\n`);
  appendToErrorLog(errorDescription ? `${line}\n${errorDescription}` : line);
}

// Exported as logger.info and logger.error, the names fixed in "Shared contracts".
// Inside this file the functions have verb-first names (logInfo, logError), as the
// naming convention asks. It also means logError's parameter can be called "error"
// without hiding a function that is itself called "error".
module.exports = {
  info: logInfo,
  error: logError,
};
