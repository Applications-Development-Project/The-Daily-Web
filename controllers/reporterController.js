/**
 * controllers/reporterController.js
 *
 * The reporter's side of the site: the dashboard page and the JSON API behind it.
 * OS created this file in phase 0 as a PLACEHOLDER so every route existed from day one;
 * EZ is replacing the function bodies one by one. The function names and
 * module.exports stay the same, because the route files already call them.
 *
 * What is real today:
 * - showReporterDashboard (GET /reporter) and listMyArticles (GET /api/reporter/articles),
 *   both built on findReporterArticles.
 * What is still a PLACEHOLDER (answers 501 { success: false, error: "Not implemented
 * yet" } for the API, or the shared error page with status 501 for the page):
 * - showArticleEditor, createArticle, autosaveDraft, submitArticleForApproval.
 *   The submit step will be checked with canTransition from services/articleWorkflow.js.
 *
 * Rules that apply to every function here:
 * - Only reporters get in: the route files use requireRole('reporter'), so the role is
 *   checked on the server from the session.
 * - The reporter's id always comes from request.session.user, never from the URL, the
 *   query or the body, so a reporter can't act as someone else.
 * - Ownership ("is this MY article?") is checked here in the controller, not in
 *   canTransition, because it needs the article from the database. Today the only code
 *   that reads articles is the list, and it asks only for articles whose reporter is
 *   the logged-in user. The checks on a single article (by :id) come with the edit,
 *   autosave and submit functions.
 * - No try/catch: this project uses Express 5, where an error thrown (or a rejected
 *   promise) in an async function goes to errorHandler by itself. A database failure
 *   therefore becomes a clean error response, not a crashed server.
 *
 * Article content (the contract with SM's editor page): an article's draft has the
 * fields title, summary, category, imageUrl and body. The dashboard shows only the
 * first three, so it never loads the body.
 *
 * Used by: routes/pageRoutes/reporterPageRoutes.js, routes/apiRoutes/reporterApiRoutes.js.
 * Related: models/Article.js, services/articleWorkflow.js (STATUS, STATUS_LABELS),
 * views/reporter/dashboard.ejs.
 * Owner: EZ.
 */

const Article = require('../models/Article');
const { STATUS, STATUS_LABELS } = require('../services/articleWorkflow');

// An article id from the URL must be exactly 24 hexadecimal characters. We check the
// shape ourselves ("Checking ids from the URL" in the plan) because
// mongoose.isValidObjectId() also accepts any 12-character string.
const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

// The statuses in which a reporter may open and change the working copy (the draft):
// "In preparation", "Returned for corrections", and "Published" (editing a live
// article is allowed by the requirements; the new version goes through approval again).
// "pending" is missing on purpose: while the editor reviews it, it is read-only.
const EDITABLE_STATUSES = [STATUS.DRAFT, STATUS.RETURNED, STATUS.PUBLISHED];

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
 * It uses the same findReporterArticles as the JSON API, so the page and the API can't
 * disagree about which articles a reporter owns. The view is views/reporter/dashboard.ejs.
 * No try/catch: in Express 5 an error thrown here reaches errorHandler by itself.
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
    // (a typo in a string would silently show the wrong buttons; STATUS.PNDING is undefined).
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
 * That one place holds the ownership rule ("a reporter sees only articles whose
 * reporter field is their own id"), so the page and the API cannot disagree.
 *
 * Each item describes the WORKING copy (draft), because that is what the reporter is
 * editing; "isLive" says whether readers can see an approved version, so the dashboard
 * can show a "Live version online" badge (an article that is live and back in "draft"
 * is still online with its old text). The editor's note is included only for returned
 * articles, where it is relevant.
 *
 * "status" and "isLive" are separate on purpose. Status describes the working copy;
 * live means "published is not null". A live article that the reporter started editing
 * has status "draft" ("In preparation") AND isLive true: both are true at once.
 *
 * Known limit we accepted: the list has no paging. It returns every article of the
 * reporter. One reporter writes far fewer articles than the whole site holds, and
 * only short fields are loaded, so this stays fast enough for the project. Paging
 * would be needed if a single reporter could have thousands of articles.
 *
 * @param {string} reporterId - The reporter's user id, always taken from the session.
 *   It is a value the server created at login, not text typed by the user, so it is
 *   safe to put in the query. Mongoose turns the string into an ObjectId.
 * @returns {Promise<Object[]>} Items { id, title, summary, category, status, statusLabel,
 *   isLive, editorNote, updatedAt }.
 * @throws {Error} If the database query fails (Express 5 passes it to errorHandler).
 */
async function findReporterArticles(reporterId) {
  const articles = await Article.find({ reporter: reporterId })
    // Uses the { reporter: 1, updatedAt: -1 } index, so this stays fast with many articles.
    // The index matches the query exactly: filter on reporter, then newest update first,
    // so MongoDB reads the articles already in order and doesn't sort them itself.
    .sort({ updatedAt: -1 })
    // Only the fields the dashboard shows; the long bodies are never loaded.
    // published.title is enough to tell "live" (an object) from "never approved" (null).
    // We select published.title and not the whole "published" object because the
    // dashboard only needs to know IF a published version exists, and the whole object
    // would load a second full body for every live article.
    .select('status draft.title draft.summary draft.category published.title editorNote updatedAt')
    // lean() returns plain objects instead of full Mongoose documents: faster, read-only.
    .lean();

  return articles.map((article) => ({
    // _id is an ObjectId object; as text it can go into JSON and into a URL.
    id: article._id.toString(),
    title: article.draft.title,
    summary: article.draft.summary,
    category: article.draft.category,
    status: article.status,
    statusLabel: STATUS_LABELS[article.status],
    // published is null until an editor approves the article for the first time.
    // With lean() a null stays null, so we compare with null; undefined is also
    // covered in case a document was stored without the field.
    isLive: article.published !== null && article.published !== undefined,
    // The note is only meaningful for a returned article. After the reporter
    // resubmits, the old note must not stay on the screen, so we send '' for all other statuses.
    editorNote: article.status === STATUS.RETURNED ? article.editorNote : '',
    updatedAt: article.updatedAt,
  }));
}

/**
 * GET /api/reporter/articles - the logged-in reporter's own articles as JSON.
 * The reporter id comes from the server-side session, never from the request, so a
 * reporter can't ask for someone else's list.
 * No try/catch: in Express 5 an error thrown here reaches errorHandler by itself.
 * The answer is { success: true, data: { articles } } with status 200, the same shape
 * every JSON answer in the project uses. It has no paging (see findReporterArticles).
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
 * PATCH /api/reporter/articles/:id/draft - autosave the draft. PLACEHOLDER.
 * Today it always answers 501, so nothing can change an article yet. Built in a later branch.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function autosaveDraft(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
}

/**
 * POST /api/reporter/articles/:id/submit - send the article to the editor. PLACEHOLDER.
 * Today it always answers 501, so no article can reach "pending" from here yet.
 * Built in a later branch.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function submitArticleForApproval(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
}

module.exports = {
  showReporterDashboard,
  showArticleEditor,
  listMyArticles,
  createArticle,
  autosaveDraft,
  submitArticleForApproval,
};
