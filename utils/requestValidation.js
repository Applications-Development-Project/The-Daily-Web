/**
 * utils/requestValidation.js
 *
 * Small checks for values that arrive in a request (the URL, the query string), shared by
 * every controller so each rule is written once:
 * - isValidObjectId(value)            is this a well-formed MongoDB id?
 * - escapeRegExp(text)                make search text safe to put inside a RegExp
 * - readSearchText(value, maxLength)  read ?search=
 * - readPageNumber(value)             read ?page=
 *
 * The security reason behind all of them: a value from the request is never trusted.
 * - A query value is not always text. ?page=1&page=2 arrives as an array, and a JSON body
 *   can hold an object such as { "$ne": "" }. Passing such a value into a MongoDB query
 *   could change its meaning (a "NoSQL injection") or crash code that expects text. So
 *   every reader here first checks typeof value === 'string' and answers 400 otherwise.
 * - Search text becomes part of a regular expression. Without escaping, "a.b" would also
 *   match "axb" (the dot means "any character"), "(((" would make the RegExp invalid
 *   (a 500 instead of results), and a crafted pattern could make the search very slow.
 *
 * The checks in the browser (maxlength, required) are only a quick answer for the user;
 * these server-side checks are the real ones, because a request can be sent without our pages.
 *
 * Before this file existed, the same helpers were copied into several controllers; the id
 * check even existed in two versions (a regular expression and mongoose.isValidObjectId).
 *
 * Used by: the controllers (feed, article page, comments, users, reporter, editor, analytics).
 * Related: utils/httpErrors.js (the 400 errors thrown here), middleware/errorHandler.js.
 * Owner: OS.
 */

const { createHttpError } = require('./httpErrors');

// A MongoDB ObjectId written as text is exactly 24 hexadecimal characters.
// Why our own check and not mongoose.isValidObjectId(): its rule changed between
// Mongoose versions (older versions also accepted any 12-character string, such as
// "hello world!"), and this one line states the rule exactly, whatever the version.
const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

/**
 * Checks that a value from the request is a well-formed MongoDB id, BEFORE it is used in
 * a query. Without this check, Mongoose would throw a CastError for "abc"; errorHandler
 * would still answer 400, but checking first lets each controller choose its own clear
 * answer (400 "Invalid article id." for an API, the 404 page for a public page).
 *
 * @param {*} value - Usually request.params.id or a query value.
 * @returns {boolean} true only for a string of exactly 24 hexadecimal characters.
 */
function isValidObjectId(value) {
  return typeof value === 'string' && OBJECT_ID_PATTERN.test(value);
}

/**
 * Puts a backslash before every character that has a special meaning in a regular
 * expression, so the user's text is searched for exactly as typed: "C++" looks for
 * "C++", and "(draft)" for "(draft)". Escaped text is only plain characters, so it
 * also can't build a slow, "catastrophic" pattern (a ReDoS).
 *
 * @param {string} text - What the user typed.
 * @returns {string} The same text with every RegExp special character escaped.
 */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Reads ?search= from the URL. Missing or empty means "no search".
 *
 * A search longer than the field it searches can never match, so it is refused instead
 * of being sent to the database.
 *
 * @param {*} value - request.query.search. Express gives an array if the parameter
 *   appears twice (?search=a&search=b), so the type is checked.
 * @param {number} maxLength - The longest search that makes sense for this list.
 * @returns {string} The trimmed search text, or '' for none.
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
 * Reads ?page= from the URL (pages are numbered from 1). Missing means page 1.
 *
 * @param {*} value - request.query.page.
 * @returns {number} A whole number, 1 or more.
 * @throws {Error} 400 for anything else, like "0", "-2", "1.5", "abc" or a repeated ?page=.
 */
function readPageNumber(value) {
  if (value === undefined) {
    return 1;
  }
  // Digits only, so "1.5", "-2", "1e3" and " 2" are refused instead of being converted
  // by Number() into something the user didn't type.
  if (typeof value !== 'string' || !/^\d+$/.test(value) || Number(value) < 1) {
    throw createHttpError(400, 'Page must be a whole number, 1 or more.');
  }
  return Number(value);
}

module.exports = { isValidObjectId, escapeRegExp, readSearchText, readPageNumber };
