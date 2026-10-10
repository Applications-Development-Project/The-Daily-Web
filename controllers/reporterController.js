/**
 * controllers/reporterController.js
 *
 * PLACEHOLDER, created by OS in phase 0 so every route exists from day one.
 * Owner: EZ. Replace the function bodies with the real logic, but keep the function
 * names and module.exports: the route files below already call them.
 * If you already wrote your own version of this file on another branch, keep yours
 * when merging (with the same exported names) and drop this placeholder.
 * Until then, API functions answer 501 { success: false, error: "Not implemented yet" }
 * and page functions show the shared error page with status 501.
 *
 * What it will do: the reporter's dashboard and article editor pages, listing and
 * creating the reporter's own articles, autosaving the draft, and submitting an
 * article for approval (checked with canTransition from services/articleWorkflow.js).
 *
 * Used by: routes/pageRoutes/reporterPageRoutes.js, routes/apiRoutes/reporterApiRoutes.js.
 * Related: models/Article.js, services/articleWorkflow.js (STATUS, STATUS_LABELS).
 */

const Article = require('../models/Article');
const { STATUS, STATUS_LABELS, canTransition } = require('../services/articleWorkflow');
const logger = require('../services/logger');

// An article id from the URL must be exactly 24 hexadecimal characters. We check the
// shape ourselves ("Checking ids from the URL" in the plan) because
// mongoose.isValidObjectId() also accepts any 12-character string.
const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

// The statuses in which a reporter may open and change the working copy (the draft):
// "In preparation", "Returned for corrections", and "Published" (editing a live
// article is allowed by the requirements; the new version goes through approval again).
// "pending" is missing on purpose: while the editor reviews it, it is read-only.
const EDITABLE_STATUSES = [STATUS.DRAFT, STATUS.RETURNED, STATUS.PUBLISHED];

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
  // article is submitted for approval (a later commit).
  if (draft.category !== '' && !Article.CATEGORIES.includes(draft.category)) {
    throw createHttpError(400, 'The field "category" must be empty or one of the known categories.');
  }

  if (!isEmptyOrHttpUrl(draft.imageUrl)) {
    throw createHttpError(400, 'The field "imageUrl" must be empty or a web address starting with http:// or https://.');
  }

  return draft;
}

/**
 * Loads the article with this id, but only if it exists AND belongs to this reporter.
 * Every reporter route that works on one article (the edit page now, autosave and
 * submit later) starts with this function, so the checks are written once and can't
 * be forgotten in one of them.
 *
 * The checks run in this order, each with its own status so the caller knows what went wrong:
 *   400 - the id in the URL is not a valid id (so we never ask the database a nonsense question)
 *   404 - no article has this id
 *   403 - the article exists but belongs to another reporter
 * Requirement served: "a reporter can edit only the articles that belong to them", checked
 * on the server, because hiding the Edit button in the browser is not a permission check.
 *
 * @param {string} articleId - The id from the URL (request.params.id).
 * @param {string} reporterId - The logged-in reporter's id, always from the session.
 * @returns {Promise<import('mongoose').Document>} The full article document.
 * @throws {Error} With statusCode 400, 404 or 403 (see above). Database errors pass through.
 */
async function findOwnedArticle(articleId, reporterId) {
  if (!OBJECT_ID_PATTERN.test(articleId)) {
    throw createHttpError(400, 'Invalid article id.');
  }

  const article = await Article.findById(articleId);
  if (!article) {
    throw createHttpError(404, 'Article not found.');
  }

  // article.reporter is an ObjectId object and reporterId is a string, so we convert
  // before comparing. Comparing the two directly with !== would always be "different".
  if (article.reporter.toString() !== reporterId) {
    throw createHttpError(403, 'You can only open your own articles.');
  }

  return article;
}

/**
 * GET /reporter - the reporter's dashboard page: a list of their own articles with
 * status labels. The list is rendered on the server (EJS), so the page arrives complete.
 *
 * Only reporters reach this function (requireRole('reporter') in the route file),
 * and the list is filtered by the session's user id, so it only ever shows their own articles.
 * The view is views/reporter/dashboard.ejs.
 *
 * @param {import('express').Request} request - request.session.user is the reporter.
 * @param {import('express').Response} response - Renders 'reporter/dashboard'.
 * @returns {Promise<void>}
 */
async function showReporterDashboard(request, response) {
  const articles = await findReporterArticles(request.session.user.id);

  response.render('reporter/dashboard', {
    title: 'My articles - The Web Daily',
    articles,
    // The view compares item.status with these names instead of typing 'draft' etc.
    STATUS,
  });
}

/**
 * GET /reporter/articles/:id/edit - the article editor page: a form filled with the
 * article's draft. The autosave script (a later commit) saves what the reporter types.
 *
 * Requirement served: "when the reporter returns to editing, they get the latest version
 * they worked on". The form is filled from the draft stored on the SERVER, never from
 * the browser's own storage, so closing the browser, refreshing, or moving to another
 * computer never loses work.
 *
 * Errors, all passed to errorHandler (which shows the shared error page):
 *   400 / 404 / 403 - from findOwnedArticle (bad id, no such article, not your article)
 *   409 - the article is "pending": it is waiting for the editor, so it is read-only.
 *         409 means "not allowed in the article's current status".
 * No try/catch: in Express 5 a thrown error in an async handler reaches errorHandler.
 *
 * @param {import('express').Request} request - request.params.id is the article id,
 *   request.session.user is the reporter.
 * @param {import('express').Response} response - Renders 'reporter/articleEditor'.
 * @returns {Promise<void>}
 * @throws {Error} With statusCode 400, 403, 404 or 409 (see above).
 */
async function showArticleEditor(request, response) {
  const article = await findOwnedArticle(request.params.id, request.session.user.id);

  if (!EDITABLE_STATUSES.includes(article.status)) {
    throw createHttpError(409, 'This article is waiting for the editor and cannot be edited right now.');
  }

  response.render('reporter/articleEditor', {
    title: 'Edit article - The Web Daily',
    // A plain object with only what the view needs, instead of the whole Mongoose
    // document: the view can't accidentally depend on (or print) any other field.
    article: {
      id: article._id.toString(),
      statusLabel: STATUS_LABELS[article.status],
      // published is null until an editor approves the article for the first time.
      // If it is not null, readers can see an approved version while this one is edited.
      isLive: article.published !== null && article.published !== undefined,
      // Only a returned article has a note that matters to the reporter.
      editorNote: article.status === STATUS.RETURNED ? article.editorNote : '',
      draft: {
        title: article.draft.title,
        summary: article.draft.summary,
        category: article.draft.category,
        imageUrl: article.draft.imageUrl,
        body: article.draft.body,
      },
    },
    // The fixed category list from the model, so the select can't offer a category
    // the model would reject.
    categories: Article.CATEGORIES,
  });
}

/**
 * Loads one reporter's articles as plain objects for the dashboard, newest update first.
 * Shared by the dashboard page and the JSON API, so the rules live in one place.
 *
 * Each item describes the WORKING copy (draft), because that is what the reporter is
 * editing; "isLive" says whether readers can see an approved version, so the dashboard
 * can show a "Live version online" badge (an article that is live and back in "draft"
 * is still online with its old text). The editor's note is included only for returned
 * articles, where it is relevant.
 *
 * @param {string} reporterId - The reporter's user id, always taken from the session.
 * @returns {Promise<Object[]>} Items { id, title, summary, category, status, statusLabel,
 *   isLive, editorNote, updatedAt }.
 */
async function findReporterArticles(reporterId) {
  const articles = await Article.find({ reporter: reporterId })
    // Uses the { reporter: 1, updatedAt: -1 } index, so this stays fast with many articles.
    .sort({ updatedAt: -1 })
    // Only the fields the dashboard shows; the long bodies are never loaded.
    // published.title is enough to tell "live" (an object) from "never approved" (null).
    .select('status draft.title draft.summary draft.category published.title editorNote updatedAt')
    // lean() returns plain objects instead of full Mongoose documents: faster, read-only.
    .lean();

  return articles.map((article) => ({
    id: article._id.toString(),
    title: article.draft.title,
    summary: article.draft.summary,
    category: article.draft.category,
    status: article.status,
    statusLabel: STATUS_LABELS[article.status],
    // published is null until an editor approves the article for the first time.
    isLive: article.published !== null && article.published !== undefined,
    editorNote: article.status === STATUS.RETURNED ? article.editorNote : '',
    updatedAt: article.updatedAt,
  }));
}

/**
 * GET /api/reporter/articles - the logged-in reporter's own articles as JSON.
 * The reporter id comes from the server-side session, never from the request, so a
 * reporter can't ask for someone else's list.
 * No try/catch: in Express 5 an error thrown here reaches errorHandler by itself.
 *
 * @param {import('express').Request} request - request.session.user is the reporter.
 * @param {import('express').Response} response - Answers { success: true, data: { articles } }.
 * @returns {Promise<void>}
 */
async function listMyArticles(request, response) {
  const articles = await findReporterArticles(request.session.user.id);
  response.json({ success: true, data: { articles } });
}

/**
 * POST /api/reporter/articles - create a new, empty article for the logged-in reporter.
 *
 * Requirements served: "a new article is created in the 'In preparation' state" and
 * "a reporter can create articles". The browser calls this when the reporter clicks
 * "New article", then opens the edit page for the returned id, where the autosave
 * fills in the content. So no content is sent here: the article starts empty.
 *
 * Why this function never reads request.body: the only values that matter (who the
 * reporter is, the status, the published copy) must be decided by the server. If we
 * accepted them from the body, a reporter could send { reporter: <someone else's id> }
 * or { status: 'published' } and publish in another person's name. Anything the
 * browser sends is simply ignored.
 *
 * Why no try/catch: in Express 5 an error thrown inside an async route handler (for
 * example the database being down) is passed to errorHandler automatically, which
 * logs it and answers with a clean 500 instead of crashing the server.
 *
 * @param {import('express').Request} request - request.session.user is the reporter
 *   (requireRole('reporter') in the route file has already checked that).
 * @param {import('express').Response} response - Answers 201 { success: true, data: { id } }.
 * @returns {Promise<void>}
 * @throws {Error} Database errors; they reach errorHandler and become a 500.
 */
async function createArticle(request, response) {
  const article = await Article.create({
    // The owner comes from the server-side session, never from the request: this is
    // what later lets every other route check "is this article yours?".
    reporter: request.session.user.id,
    // Every new article starts as "In preparation". STATUS.DRAFT instead of 'draft'
    // so a typo can't silently create an article with a status that doesn't exist.
    status: STATUS.DRAFT,
    // null means "never approved", so the public site (which only reads `published`)
    // can't show this article until an editor approves it.
    published: null,
    // `draft` is left out on purpose: the model gives every new article an empty
    // content object (all fields ''), which is valid, so the reporter can start typing
    // right away and autosave fills it in.
  });

  // 201 Created (not 200) because a new resource now exists. Only the id is returned:
  // the browser needs nothing else to open /reporter/articles/<id>/edit.
  // article._id is an ObjectId object, so it is converted to a plain string for JSON.
  response.status(201).json({ success: true, data: { id: article._id.toString() } });
}

/**
 * PATCH /api/reporter/articles/:id/draft - autosave: replaces the article's whole draft
 * with the five fields in the request body. The browser calls it a couple of seconds
 * after the reporter stops typing (public/js/reporterEditor.js, a later commit).
 *
 * Requirements served (in our own words):
 *   - Continuity: the reporter's work is saved all the time without pressing "Save", and
 *     closing the browser, refreshing, or switching computers loses nothing, because
 *     the text lives in the database, not in the browser.
 *   - Editing a published article: the readers keep seeing the last approved version;
 *     the reporter's changes must not appear on the public site while they work, nor
 *     after they are sent for approval, only after an editor approves them.
 *
 * How the second requirement works: every article has TWO copies of its content.
 * `published` is what readers see (the public pages read only this). `draft` is the
 * working copy. This function writes only to `draft`, so whatever the reporter types,
 * `published` stays exactly as the editor approved it. When an editor approves, the
 * draft is copied into `published` (SM's code), and only then do readers see the change.
 *
 * Steps, in this order (each step can stop the request with an error):
 *   1. findOwnedArticle: 400 bad id, 404 no such article, 403 not this reporter's article.
 *   2. The status must be draft, returned or published, otherwise 409 (a pending article
 *      is waiting for the editor and is read-only).
 *   3. Validate the body: 400 for anything wrong (readDraftFromRequestBody).
 *   4. If the article is published, move the working copy back to "draft": the new
 *      version has to go through approval again. canTransition checks that this change is
 *      allowed; `published` is never touched.
 *   5. Save the draft and answer with the save time.
 *
 * The reporter and the status are NEVER read from the request body: the owner comes from
 * the session and the status change is decided here, so the browser can't pick either.
 * No try/catch: in Express 5 an error thrown here reaches errorHandler by itself.
 *
 * @param {import('express').Request} request - request.params.id is the article id,
 *   request.body the five draft fields, request.session.user the reporter.
 * @param {import('express').Response} response - Answers 200 { success: true, data: { savedAt } }.
 * @returns {Promise<void>}
 * @throws {Error} With statusCode 400, 403, 404 or 409 (see the steps above).
 */
async function autosaveDraft(request, response) {
  const article = await findOwnedArticle(request.params.id, request.session.user.id);

  if (!EDITABLE_STATUSES.includes(article.status)) {
    throw createHttpError(409, 'This article is waiting for the editor and cannot be edited right now.');
  }

  // Express 5 leaves request.body undefined when the request has no body at all, and
  // reading a field of undefined would crash. "|| {}" turns that into a clean 400.
  const draft = readDraftFromRequestBody(request.body || {});

  // First edit of a live article: the new version becomes "In preparation" again. The
  // transition table is the one place that says this change is allowed, so we ask it
  // instead of writing our own rule. Only `status` changes here; `published` is not touched.
  if (article.status === STATUS.PUBLISHED) {
    if (!canTransition(STATUS.PUBLISHED, STATUS.DRAFT, 'reporter')) {
      throw createHttpError(409, 'This article cannot be edited right now.');
    }
    article.status = STATUS.DRAFT;
  }

  // Replacing the whole draft (not field by field) keeps the saved copy equal to what
  // is on the reporter's screen, even if a request is repeated. save() writes only the
  // fields that changed (draft and, maybe, status), so `published` is never sent to the
  // database. It also refreshes the article's updatedAt time.
  article.draft = draft;
  await article.save();

  // The time the server confirmed the save, for the "Saved at 14:32" message. We use the
  // current time and not article.updatedAt: if the text hadn't changed, save() writes
  // nothing and updatedAt would stay old, but the draft is still correctly saved now.
  response.json({ success: true, data: { savedAt: new Date().toISOString() } });
}

// The draft fields that must be filled in before an article can be sent to the editor, with
// the name to show the reporter in the error message. imageUrl is not here: an article
// may have no picture. While WRITING all five fields may be empty (autosave saves
// half-written drafts), but an editor can't review an article without these four.
const REQUIRED_SUBMIT_FIELDS = {
  title: 'title',
  summary: 'summary',
  category: 'category',
  body: 'article text',
};

/**
 * Lists the required fields of a draft that are still empty. A field made only of spaces
 * or line breaks counts as empty: it looks filled-in on the screen but says nothing.
 *
 * @param {{title: string, summary: string, category: string, body: string}} draft - The
 *   article's saved draft (from the database).
 * @returns {string[]} The display names of the empty required fields, in form order;
 *   an empty list means the draft is complete.
 */
function findMissingRequiredFields(draft) {
  return Object.keys(REQUIRED_SUBMIT_FIELDS)
    .filter(function (fieldName) {
      // "|| ''" so a field that is missing altogether (not just empty) can't crash trim().
      return (draft[fieldName] || '').trim() === '';
    })
    .map(function (fieldName) {
      return REQUIRED_SUBMIT_FIELDS[fieldName];
    });
}

/**
 * POST /api/reporter/articles/:id/submit - the reporter sends the finished article to the
 * editor: the status changes from "In preparation" (or "Returned for corrections") to
 * "Awaiting editor approval".
 *
 * Requirement served (in our own words): a reporter may move an article that belongs to
 * them from "in preparation" to "awaiting editor approval", and may do the same again for
 * an article the editor returned, after fixing it. Every other change is not allowed.
 *
 * Steps, in this order (each can stop the request with an error):
 *   1. findOwnedArticle: 400 bad id, 404 no such article, 403 not this reporter's article.
 *   2. The four required fields of the saved draft must be filled in, otherwise 400 that
 *      names the missing ones. We check the draft stored in the DATABASE, not anything
 *      sent in this request, so what the editor will review is exactly what was checked.
 *      This is done on the server because the browser can't be trusted: anyone can call
 *      this route directly and skip any check in the page.
 *   3. canTransition(current status, "pending", "reporter") must allow it, otherwise 409.
 *      The transition table is the single place that knows the allowed changes, so this
 *      route doesn't repeat them in its own if-statements. It allows draft -> pending and
 *      returned -> pending; it refuses pending -> pending (already submitted) and
 *      published -> pending (a live article must first be edited, which moves it to draft).
 *   4. Set the status to "pending" and save.
 *
 * What is deliberately NOT changed:
 *   - `published` stays as it is: readers keep seeing the last approved version while the
 *     new one waits for the editor, also after this call.
 *   - `editorNote` is not cleared. The editor's note belongs to the editor's decision: it is
 *     cleared when the editor approves (SM's code). Until then the reporter can still read
 *     what was asked of them, and the editor can check that it was done.
 *
 * After this the article is "pending", so autosave and the edit page answer 409: it is
 * read-only while the editor reviews it, so the text under review can't change.
 *
 * The reporter and the status are NEVER read from the request body: the owner comes from
 * the session, and the new status is decided here. No try/catch: in Express 5 an error
 * thrown in an async handler reaches errorHandler by itself.
 *
 * @param {import('express').Request} request - request.params.id is the article id,
 *   request.session.user the reporter.
 * @param {import('express').Response} response - Answers 200
 *   { success: true, data: { id, status, statusLabel } }.
 * @returns {Promise<void>}
 * @throws {Error} With statusCode 400, 403, 404 or 409 (see the steps above).
 */
async function submitArticleForApproval(request, response) {
  const reporterId = request.session.user.id;
  const article = await findOwnedArticle(request.params.id, reporterId);

  const missingFields = findMissingRequiredFields(article.draft);
  if (missingFields.length > 0) {
    throw createHttpError(400, 'Please fill in these fields before submitting: ' + missingFields.join(', ') + '.');
  }

  if (!canTransition(article.status, STATUS.PENDING, 'reporter')) {
    const message = article.status === STATUS.PENDING
      ? 'This article is already waiting for the editor.'
      : `An article that is "${STATUS_LABELS[article.status]}" cannot be submitted for approval.`;
    throw createHttpError(409, message);
  }

  const previousStatus = article.status;
  article.status = STATUS.PENDING;
  await article.save();

  // A status change is a significant event (requirement: keep logs of important events).
  // Only ids and statuses are logged, never the article text.
  logger.info(`Article ${article._id} submitted for approval by reporter ${reporterId} (${previousStatus} -> ${article.status})`);

  response.json({
    success: true,
    data: {
      id: article._id.toString(),
      status: article.status,
      statusLabel: STATUS_LABELS[article.status],
    },
  });
}

module.exports = {
  showReporterDashboard,
  showArticleEditor,
  listMyArticles,
  createArticle,
  autosaveDraft,
  submitArticleForApproval,
};
