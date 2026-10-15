/**
 * services/draftValidation.js
 *
 * The rules for a draft's content: its five fields, their types and lengths, a known
 * category and an http(s) image address. A broken rule throws a 400 error.
 *
 * Its own file because two routes save a draft (the reporter's autosave and the editor's
 * edit) and must follow exactly the same rules. Who may save, and in which status, stays
 * in the controllers.
 *
 * Used by: controllers/reporterController.js, controllers/editorController.js.
 * Owner: EZ.
 */

const Article = require('../models/Article');
const { createHttpError } = require('../utils/httpErrors');

// In the order the form shows them.
const DRAFT_FIELDS = ['title', 'summary', 'category', 'imageUrl', 'body'];

// The same limits as models/Article.js; checked here first for a clear 400 message.
const DRAFT_MAX_LENGTHS = { title: 200, summary: 500, imageUrl: 2000, body: 50000 };

/**
 * Checks that a text is empty or an http(s) address, so a link like
 * "javascript:alert(1)" is never saved as an image address.
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
    // new URL() throws for text that isn't an address: that just means "not valid".
    return false;
  }
}

/**
 * Reads and checks the five draft fields from a request body. It returns a NEW object
 * with only those fields, so anything else (a "status", a "reporter") is dropped.
 * Every field must be a string, so a value like { "$ne": "" } can't reach a query
 * (NoSQL injection). The text isn't trimmed: autosave runs while the reporter types.
 *
 * @param {Object} [requestBody] - request.body (the caller passes request.body || {}).
 * @returns {{title: string, summary: string, category: string, imageUrl: string, body: string}}
 * @throws {Error} With statusCode 400 and a message naming the field.
 */
function readDraftFromRequestBody(requestBody) {
  const draft = {};

  DRAFT_FIELDS.forEach(function (fieldName) {
    const value = requestBody[fieldName];
    if (typeof value !== 'string') {
      throw createHttpError(400, `The field "${fieldName}" must be text.`);
    }
    // category has no length limit; it is checked against the list below.
    const maxLength = DRAFT_MAX_LENGTHS[fieldName];
    if (maxLength !== undefined && value.length > maxLength) {
      throw createHttpError(400, `The field "${fieldName}" can be at most ${maxLength} characters.`);
    }
    draft[fieldName] = value;
  });

  // Empty is allowed while writing; submitting requires a category.
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
  isEmptyOrHttpUrl,
  readDraftFromRequestBody,
};
