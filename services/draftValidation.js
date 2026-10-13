/**
 * services/draftValidation.js
 *
 * The rules for the content of an article draft: which five fields a draft has, how long
 * each may be, that every field is text, that the category is a known one and that the
 * image address is empty or an http(s) link. It also holds createHttpError, the small helper
 * that builds an error carrying an HTTP status, because these rules throw such errors.
 *
 * Why this is its own file and not part of a controller: two different routes save a draft.
 * The reporter's autosave (PATCH /api/reporter/articles/:id/draft) and the editor's edit of a
 * pending article (PATCH /api/editor/articles/:id/draft) must follow EXACTLY the same rules
 * (types, lengths, category, http(s) image URL). If each controller kept its own copy, a rule
 * changed in one place could silently stay old in the other. With one copy, they can't drift
 * apart. Only the rules about the CONTENT live here; who may save, which status allows it
 * and whether fields may be empty at submit time stay in the controllers, because they
 * differ between the reporter and the editor.
 *
 * The code was moved here unchanged from controllers/reporterController.js (a pure refactor,
 * no behavior change).
 *
 * Used by: controllers/reporterController.js and, soon, controllers/editorController.js (SM).
 * Related: models/Article.js (the category list and the model's own length limits),
 * middleware/errorHandler.js (turns the errors created here into clean answers).
 * Owner: EZ.
 */

const Article = require('../models/Article');

// The five fields of a draft (the "content object" in the plan), in the order the form shows them.
const DRAFT_FIELDS = ['title', 'summary', 'category', 'imageUrl', 'body'];

// Maximum lengths, the same numbers as the limits in models/Article.js. The controller
// checks first so the reporter gets a clear 400 message; the model's own limits stay as a
// second safety net for any other way of saving.
const DRAFT_MAX_LENGTHS = { title: 200, summary: 500, imageUrl: 2000, body: 50000 };

/**
 * Creates an Error that errorHandler turns into a clean answer with this HTTP status
 * (JSON for /api requests, the shared error page for pages). Only 4xx statuses are
 * shown to the user with their message; see middleware/errorHandler.js.
 *
 * @param {number} statusCode - A 4xx HTTP status, for example 404.
 * @param {string} message - A sentence the user can read.
 * @returns {Error} The error, with statusCode set, ready to be thrown.
 */
function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Checks that a text is empty or a web address starting with http:// or https://.
 * Images are stored as links, and a link such as "javascript:alert(1)" must never be
 * saved, because the public page will later use it as an image address.
 * The URL class does the parsing for us: it throws on text that is not an address at all,
 * and tells us the protocol (the part before "//") of the ones that are.
 *
 * @param {string} imageUrl - The text to check.
 * @returns {boolean} true if it is empty or a valid http(s) address.
 */
function isEmptyOrHttpUrl(imageUrl) {
  if (imageUrl === '') {
    return true;
  }
  try {
    const protocol = new URL(imageUrl).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch (parseError) {
    // new URL() throws when the text is not an address at all (for example "not a url"). That is
    // not a program error: it is exactly the answer we want, "this is not a valid address".
    return false;
  }
}

/**
 * Reads the five draft fields out of a request body and checks every one of them.
 * It returns a NEW object that contains only the five known fields, so anything else the
 * browser sent (a "status", a "reporter", a "published") is dropped here and can never
 * reach the database.
 *
 * Why every field must be a string: a JSON body can hold objects, for example
 * { "title": { "$ne": "" } }. Passing such a value on would let the sender inject
 * MongoDB operators (a NoSQL injection). Checking typeof removes that whole risk.
 * We do NOT trim the text: this runs on every autosave while the reporter is typing, and
 * trimming would delete the space they just typed at the end of a word.
 *
 * @param {Object} [requestBody] - request.body. Express 5 leaves it undefined when the
 *   request has no body, so the caller passes request.body || {}.
 * @returns {{title: string, summary: string, category: string, imageUrl: string, body: string}}
 *   The checked draft.
 * @throws {Error} With statusCode 400 and a message that names the problem field.
 */
function readDraftFromRequestBody(requestBody) {
  const draft = {};

  DRAFT_FIELDS.forEach(function (fieldName) {
    const value = requestBody[fieldName];
    if (typeof value !== 'string') {
      throw createHttpError(400, `The field "${fieldName}" must be text.`);
    }
    // Only fields that have a limit are in DRAFT_MAX_LENGTHS (category is checked below).
    const maxLength = DRAFT_MAX_LENGTHS[fieldName];
    if (maxLength !== undefined && value.length > maxLength) {
      throw createHttpError(400, `The field "${fieldName}" can be at most ${maxLength} characters.`);
    }
    draft[fieldName] = value;
  });

  // Empty is allowed while writing; the server requires a real category only when the
  // article is submitted for approval (see submitArticleForApproval).
  if (draft.category !== '' && !Article.CATEGORIES.includes(draft.category)) {
    throw createHttpError(400, 'The field "category" must be empty or one of the known categories.');
  }

  if (!isEmptyOrHttpUrl(draft.imageUrl)) {
    throw createHttpError(400, 'The field "imageUrl" must be empty or a web address starting with http:// or https://.');
  }

  return draft;
}

module.exports = {
  DRAFT_FIELDS,
  DRAFT_MAX_LENGTHS,
  createHttpError,
  isEmptyOrHttpUrl,
  readDraftFromRequestBody,
};
