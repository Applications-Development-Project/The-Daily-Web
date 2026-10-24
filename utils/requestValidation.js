/**
 * utils/requestValidation.js
 *
 * Checks for values from a request, shared by every controller so each rule is written
 * once. A request value is never trusted: ?page=1&page=2 arrives as an array and a JSON
 * body can hold { "$ne": "" }, which inside a MongoDB query would be a NoSQL injection,
 * so every reader checks for a string first. Search text is escaped before it becomes a
 * RegExp. The browser's checks are only a quick answer; these are the real ones.
 *
 * Used by: the controllers.
 * Owner: OS.
 */

const { createHttpError } = require('./httpErrors');

// A MongoDB id as text: exactly 24 hexadecimal characters. Our own rule, because
// mongoose.isValidObjectId's rule changed between versions (older ones accepted any
// 12-character string).
const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

/**
 * Checks that a value is a well-formed MongoDB id before it reaches a query, so each
 * controller can answer clearly (400 in an API, the 404 page for a public page).
 *
 * @param {*} value - Usually request.params.id.
 * @returns {boolean} true only for a string of exactly 24 hexadecimal characters.
 */
function isValidObjectId(value) {
  return typeof value === 'string' && OBJECT_ID_PATTERN.test(value);
}

/**
 * Escapes every RegExp special character, so text is searched exactly as typed ("C++",
 * "(draft)") and can't build a slow pattern (ReDoS) or an invalid one.
 *
 * @param {string} text - What the user typed.
 * @returns {string}
 */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Reads ?search=. Missing means no search; longer than the searched field can't match.
 *
 * @param {*} value - request.query.search (an array if repeated).
 * @param {number} maxLength - The longest search that makes sense here.
 * @returns {string} The trimmed text, or '' for none.
 * @throws {Error} 400 if it isn't a single text value or is too long.
 */
function readSearchText(value, maxLength) {
  if (value === undefined) {
    return '';
  }
  if (typeof value !== 'string' || value.length > maxLength) {
    throw createHttpError(400, 'Invalid search.');
  }
  return value.trim();
}

/**
 * Reads ?page= (from 1). Missing means page 1.
 *
 * @param {*} value - request.query.page.
 * @returns {number} A whole number, 1 or more.
 * @throws {Error} 400 for "0", "-2", "1.5", "abc" or a repeated ?page=.
 */
function readPageNumber(value) {
  if (value === undefined) {
    return 1;
  }
  // Digits only, so Number() never turns "1e3" or " 2" into something the user didn't type.
  if (typeof value !== 'string' || !/^\d+$/.test(value) || Number(value) < 1) {
    throw createHttpError(400, 'Page must be a whole number, 1 or more.');
  }
  return Number(value);
}

module.exports = { isValidObjectId, escapeRegExp, readSearchText, readPageNumber };
