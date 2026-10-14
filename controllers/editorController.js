/**
 * controllers/editorController.js
 *
 * Everything the editor does with articles: the dashboard of all articles and the
 * review page, editing a submitted draft, approving (draft copied into published),
 * returning with a note, and deleting an article with its comments and statistics.
 *
 * Every route that reaches these functions is protected with requireRole('editor')
 * in the route files, so here request.session.user is always a logged-in editor.
 *
 * Rules every function here follows (the lecturer's usual questions):
 * - Permissions are checked on the server (requireRole in the routes, canTransition
 *   for status changes), never by hiding buttons in the browser.
 * - The article comes only from the URL (:id) and the editor only from the session.
 *   Nothing that decides who or what is changed is read from the request body.
 * - Every value from the request is checked for its type before it reaches a query
 *   (a JSON or query value can be an object or array, not only text).
 * - Errors: APIs answer with sendError() as { success: false, error } and a status
 *   code (400 invalid input, 404 not found, 409 not allowed in the current status).
 *   Pages throw createHttpError() and errorHandler shows the shared error page.
 *   Database failures need no try/catch: Express 5 sends a rejected promise from an
 *   async function to errorHandler, which answers 500 and logs it.
 * - The article model has two copies of the content: draft (worked on) and
 *   published (what readers see); see models/Article.js. "Live" means published is
 *   not null, whatever the status.
 *
 * Built step by step from OS's phase 0 placeholders; none is left. The function names
 * stayed the same, because the route files call them.
 *
 * Used by: routes/pageRoutes/editorPageRoutes.js, routes/apiRoutes/editorApiRoutes.js.
 * Related: models/Article.js, services/articleWorkflow.js (STATUS, canTransition),
 * services/draftValidation.js (EZ's field checks, shared with the reporter's autosave).
 * Owner: SM.
 */

const Article = require('../models/Article');
const Comment = require('../models/Comment');
const ArticleViewStats = require('../models/ArticleViewStats');
const DeviceArticleView = require('../models/DeviceArticleView');
const { STATUS, STATUS_LABELS, canTransition } = require('../services/articleWorkflow');
const { readDraftFromRequestBody } = require('../services/draftValidation');
const logger = require('../services/logger');
const { createHttpError } = require('../utils/httpErrors');
const { isValidObjectId, escapeRegExp } = require('../utils/requestValidation');

// The dashboard shows 20 articles per page ("Shared contracts").
const ARTICLES_PER_PAGE = 20;
// Titles are at most 200 characters, so a longer search can never match anything.
const MAX_SEARCH_LENGTH = 200;
// An article can't go live with any of these empty (the image is optional).
const REQUIRED_CONTENT_FIELDS = ['title', 'summary', 'body', 'category'];
// Same limit as Article.editorNote in the model.
const MAX_EDITOR_NOTE_LENGTH = 2000;
// The same date format as the rest of the site, for example "10 Oct 2026, 14:32".
const DATE_TIME_FORMAT = { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' };
// The fields of a content object, with the names the review page shows, in page order.
const CONTENT_FIELD_LABELS = {
  title: 'Title',
  summary: 'Summary',
  category: 'Category',
  imageUrl: 'Main image',
  body: 'Body',
};

/**
 * Formats a date for the page, or returns '' when there is no date.
 *
 * Known limit: this runs on the server, so the time is in the server's time zone.
 * That is right while the server and the editor are in the same country. The
 * dashboard instead formats dates in the browser (public/js/editor/dashboard.js), in the
 * editor's own time zone.
 *
 * @param {Date|null|undefined} date
 * @returns {string}
 */
function formatDateTime(date) {
  return date ? new Date(date).toLocaleString('en-GB', DATE_TIME_FORMAT) : '';
}

/**
 * Prepares one content object (draft or published) for the page. The body is
 * plain text with a blank line between paragraphs, so it is split into paragraphs
 * here and the view prints each one with the escaping <%= %> tag.
 *
 * @param {{title: string, summary: string, body: string, imageUrl: string, category: string}} content
 * @returns {{title: string, summary: string, category: string, imageUrl: string, paragraphs: string[]}}
 */
function toContentView(content) {
  const paragraphs = (content.body || '')
    .split('\n\n')
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '');
  return {
    title: content.title || '',
    summary: content.summary || '',
    category: content.category || '',
    imageUrl: content.imageUrl || '',
    paragraphs: paragraphs,
  };
}

/**
 * Lists the fields where the working copy differs from the live version, so the
 * editor sees exactly what an update changes. Values are compared as stored, so
 * even a changed space or line break counts as a change.
 *
 * @param {Object} draft - The working copy.
 * @param {Object|null} published - The live version, or null if never published.
 * @returns {string[]} Field names in page order, for example ['title', 'body'];
 *   empty when the article isn't live or nothing changed.
 */
function findChangedFields(draft, published) {
  if (!published) {
    return [];
  }
  return Object.keys(CONTENT_FIELD_LABELS).filter((field) => (draft[field] || '') !== (published[field] || ''));
}

/**
 * Prepares everything the review page shows, so the view only prints values.
 *
 * @param {Object} article - A lean article with reporter and publishHistory.editor populated.
 * @param {string} role - The logged-in user's role, for canTransition.
 * @returns {Object} The values views/editor/articleReview.ejs uses.
 */
function toReviewView(article, role) {
  const isLive = Boolean(article.published);
  const changedFields = findChangedFields(article.draft, article.published);
  return {
    id: article._id.toString(),
    title: article.draft.title || (isLive ? article.published.title : '') || '(untitled)',
    reporterName: article.reporter ? article.reporter.displayName : 'Unknown reporter',
    status: article.status,
    statusLabel: STATUS_LABELS[article.status],
    isLive: isLive,
    editorNote: article.editorNote,
    updatedAt: formatDateTime(article.updatedAt),
    draft: toContentView(article.draft),
    published: isLive ? toContentView(article.published) : null,
    changedFields: changedFields,
    // The same fields as readable names, for the line "Changed in this update: ...".
    changedFieldLabels: changedFields.map((field) => CONTENT_FIELD_LABELS[field]),
    // Newest approval first, as the editor most often wants the latest one.
    publishHistory: article.publishHistory
      .slice()
      .reverse()
      .map((publishEvent) => ({
        publishedAt: formatDateTime(publishEvent.publishedAt),
        editorName: publishEvent.editor ? publishEvent.editor.displayName : 'Unknown editor',
      })),
    // The buttons appear only when the workflow allows the decision. The server
    // checks again when a button is used; hiding a button protects nothing.
    canApprove: canTransition(article.status, STATUS.PUBLISHED, role),
    canReturn: canTransition(article.status, STATUS.RETURNED, role),
    // The Edit form appears under the same rule editArticleDraft checks (pending only).
    canEdit: role === 'editor' && article.status === STATUS.PENDING,
    // The draft as stored (the body with its blank lines, not split into paragraphs),
    // to fill the Edit form, so the editor starts from exactly what was submitted.
    editableDraft: {
      title: article.draft.title || '',
      summary: article.draft.summary || '',
      category: article.draft.category || '',
      imageUrl: article.draft.imageUrl || '',
      body: article.draft.body || '',
    },
  };
}

/**
 * Sends an error answer in the shape every API uses: { success: false, error }.
 *
 * @param {import('express').Response} response - The response to send.
 * @param {number} statusCode - 400, 404, 409...
 * @param {string} message - A message the editor can read.
 * @returns {void}
 */
function sendError(response, statusCode, message) {
  response.status(statusCode).json({ success: false, error: message });
}

/**
 * Loads the article named in the URL (/:id), or answers the request itself if it can't:
 * 400 for an id that isn't a valid MongoDB id, 404 if no such article exists.
 * Checking the format first gives a clear message instead of a database CastError.
 *
 * isValidObjectId (utils/requestValidation.js) accepts only a string of exactly 24
 * hexadecimal characters, the one id rule the whole project shares.
 *
 * @param {import('express').Request} request - request.params.id is the article id.
 * @param {import('express').Response} response - Used only to send the 400 or 404.
 * @returns {Promise<Object|null>} The article document, or null if an error was sent.
 */
async function findArticleFromUrl(request, response) {
  if (!isValidObjectId(request.params.id)) {
    sendError(response, 400, 'Invalid article id');
    return null;
  }
  const article = await Article.findById(request.params.id);
  if (!article) {
    sendError(response, 404, 'Article not found');
    return null;
  }
  return article;
}

/**
 * Reads one text value from the query string.
 * A value can arrive as an array (?status=a&status=b), which we treat as invalid
 * instead of guessing which one was meant.
 *
 * Why the type check matters: only a plain string ever reaches a database query.
 * A request value that is an object or array could otherwise change the meaning of
 * the query (a NoSQL injection), or crash the code that expects text.
 *
 * @param {*} value - request.query.something.
 * @returns {string|null} The trimmed text ('' if it was not sent), or null if it isn't text.
 */
function readQueryText(value) {
  if (value === undefined) {
    return '';
  }
  if (typeof value !== 'string') {
    return null;
  }
  return value.trim();
}

/**
 * Checks the dashboard's query string: ?status=&search=&page=
 *
 * @param {Object} query - request.query.
 * @returns {{error: string}|{status: string, search: string, page: number}}
 *   Either a message for a 400 answer, or the clean values ('' means "no filter").
 */
function readArticleListQuery(query) {
  const status = readQueryText(query.status);
  const search = readQueryText(query.search);
  const pageText = readQueryText(query.page);

  if (status === null || search === null || pageText === null) {
    return { error: 'Each of status, search and page can be given only once' };
  }
  if (status !== '' && !Object.values(STATUS).includes(status)) {
    return { error: `Unknown status "${status}". Use one of: ${Object.values(STATUS).join(', ')}` };
  }
  if (search.length > MAX_SEARCH_LENGTH) {
    return { error: `Search can be at most ${MAX_SEARCH_LENGTH} characters` };
  }
  // Only digits, so "2.5", "-1", "abc" and "1e3" are all rejected.
  if (pageText !== '' && !/^\d+$/.test(pageText)) {
    return { error: 'Page must be a whole number, 1 or more' };
  }
  const page = pageText === '' ? 1 : Number(pageText);
  if (page < 1) {
    return { error: 'Page must be a whole number, 1 or more' };
  }

  return { status: status, search: search, page: page };
}

/**
 * Turns an article from the database into one dashboard row, with only what the
 * table shows.
 *
 * The title is the working copy's (draft) title, because that is what the editor
 * reviews; an article whose draft has no title yet falls back to the live title.
 *
 * @param {Object} article - A lean article with reporter populated.
 * @returns {{id: string, title: string, reporterName: string, status: string,
 *   statusLabel: string, isLive: boolean, updatedAt: Date}}
 */
function toArticleRow(article) {
  const liveTitle = article.published ? article.published.title : '';
  return {
    id: article._id.toString(),
    title: article.draft.title || liveTitle || '(untitled)',
    // reporter is null if the user was deleted; the user rules prevent that, but the
    // dashboard must still work if it ever happens.
    reporterName: article.reporter ? article.reporter.displayName : 'Unknown reporter',
    status: article.status,
    statusLabel: STATUS_LABELS[article.status],
    // Live means readers can see it, whatever the status of the working copy.
    isLive: Boolean(article.published),
    updatedAt: article.updatedAt,
  };
}

/**
 * GET /editor - the editor dashboard: a table of every article in the system.
 *
 * The page arrives with an empty table; public/js/editor/dashboard.js fills it from
 * GET /api/editor/articles and refills it when the editor filters, searches or
 * changes page, without reloading. That way the table is built in one place only.
 *
 * @param {import('express').Request} request - session.user is the editor.
 * @param {import('express').Response} response - Renders views/editor/dashboard.ejs.
 * @returns {void}
 */
function showEditorDashboard(request, response) {
  // The filter's choices come from the shared status names and labels, so the page
  // always offers exactly the statuses the API accepts.
  const statusOptions = Object.values(STATUS).map((status) => ({ value: status, label: STATUS_LABELS[status] }));
  response.render('editor/dashboard', {
    title: 'Articles - Editor - The Web Daily',
    statusOptions: statusOptions,
  });
}

/**
 * GET /editor/articles/:id - the review page of one article: who wrote it, its
 * status, the submitted content and its publish history.
 *
 * A malformed or unknown id shows the shared error page with 404 (errorHandler
 * renders it, because this is a page, not an /api request).
 *
 * @param {import('express').Request} request - params.id; session.user is the editor.
 * @param {import('express').Response} response - Renders views/editor/articleReview.ejs.
 * @returns {Promise<void>}
 * @throws {Error} 404 if the id is malformed or no article has it.
 */
async function showArticleReview(request, response) {
  // For a page, "not a valid id" and "no such article" mean the same to the editor.
  if (!isValidObjectId(request.params.id)) {
    throw createHttpError(404, 'Article not found');
  }

  // populate replaces the stored user ids with the users' display names.
  const article = await Article.findById(request.params.id)
    .populate('reporter', 'displayName')
    .populate('publishHistory.editor', 'displayName')
    .lean();
  if (!article) {
    throw createHttpError(404, 'Article not found');
  }

  const review = toReviewView(article, request.session.user.role);
  response.render('editor/articleReview', {
    title: `Review: ${review.title} - Editor - The Web Daily`,
    review: review,
    // The categories the Edit form offers: the model's list, so the form can never offer
    // a category the server would refuse.
    categories: Article.CATEGORIES,
  });
}

/**
 * GET /api/editor/articles?status=&search=&page= - every article in the system,
 * newest change first, 20 per page, for the editor dashboard.
 *
 * - status: one of draft, pending, published, returned; empty means all.
 * - search: part of the title, any capitals; matches the working title or the live title.
 * - page: 1 or more; empty means 1.
 *
 * Answers 200 { success: true, data: { articles, page, totalPages, totalArticles } },
 * or 400 with a message if a parameter is invalid. Database errors go to errorHandler
 * (Express 5 passes a rejected promise from an async controller on by itself).
 * The response shape is SM's own contract with public/js/editor/dashboard.js.
 *
 * Performance with thousands of articles:
 * - Only 20 rows per answer (paging), only the fields the table shows (.select),
 *   plain objects (.lean), and only the reporter's displayName (populate), so no
 *   article body or user data the page doesn't need is ever loaded.
 * - Without a filter, the sort reads the { updatedAt: -1, _id: -1 } index in order, so
 *   MongoDB never sorts the whole collection in memory; the status filter uses the
 *   { status: 1 } index.
 * Known limits, fine for the thousands of articles the requirements mention:
 * - A case-insensitive search inside titles ('i' regex, any position) can't use an
 *   index, so MongoDB checks the titles one by one. A text index would avoid that, but
 *   it matches whole words only.
 * - skip() still passes over the earlier pages; an editor rarely goes deep enough for
 *   that to matter.
 *
 * @param {import('express').Request} request - The query string holds the filters.
 * @param {import('express').Response} response - The JSON answer.
 * @returns {Promise<void>}
 */
async function listAllArticles(request, response) {
  const listQuery = readArticleListQuery(request.query);
  if (listQuery.error) {
    response.status(400).json({ success: false, error: listQuery.error });
    return;
  }

  const filter = {};
  if (listQuery.status !== '') {
    filter.status = listQuery.status;
  }
  if (listQuery.search !== '') {
    // 'i' = ignore capitals. We search both titles, so a live article whose
    // working copy was renamed can be found by either name.
    const titlePattern = new RegExp(escapeRegExp(listQuery.search), 'i');
    filter.$or = [{ 'draft.title': titlePattern }, { 'published.title': titlePattern }];
  }

  // The page of articles and the total count are two independent queries, so we
  // send both at once and wait for both, instead of one after the other.
  // _id is the tie-breaker: articles with the same updatedAt keep a fixed order,
  // so moving between pages never repeats or skips one.
  const [articles, totalArticles] = await Promise.all([
    Article.find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .skip((listQuery.page - 1) * ARTICLES_PER_PAGE)
      .limit(ARTICLES_PER_PAGE)
      .select({ status: 1, 'draft.title': 1, 'published.title': 1, reporter: 1, updatedAt: 1 })
      .populate('reporter', 'displayName')
      .lean(),
    Article.countDocuments(filter),
  ]);

  response.json({
    success: true,
    data: {
      articles: articles.map(toArticleRow),
      page: listQuery.page,
      // At least 1, so an empty result still reads "page 1 of 1".
      totalPages: Math.max(1, Math.ceil(totalArticles / ARTICLES_PER_PAGE)),
      totalArticles: totalArticles,
    },
  });
}

/**
 * PATCH /api/editor/articles/:id/draft - the editor edits the submitted version of an
 * article that awaits approval, before deciding (requirements p.5: "for an article
 * awaiting approval, the editor can edit it himself"; p.6: "the editor can edit all
 * articles").
 *
 * The rules, agreed with EZ (open question 4 in the work plan):
 * - Only while the article is pending; any other status answers 409. A draft or a
 *   returned article is the reporter's work in progress, and a published one without a
 *   pending update has nothing submitted to edit.
 * - The status stays pending: editing is not a decision. The editor still approves or
 *   returns it afterwards, and canTransition isn't asked because nothing moves.
 * - Only the working copy (draft) changes. For a live article, readers keep seeing the
 *   published version until the editor approves, exactly as with a reporter's update.
 * - The fields are checked by EZ's readDraftFromRequestBody (services/draftValidation.js),
 *   the same function the reporter's autosave uses, so a draft is held to the same rules
 *   whoever saves it: every field must be text (no objects, so no NoSQL injection), the
 *   same maximum lengths, a known category, and an http(s) image address or none.
 *   Anything else in the body (a "status", a "published") is dropped by that function.
 * - One extra rule here: title, summary, body and category can't be empty. The reporter
 *   may save an empty field while writing, but this article was already submitted as
 *   complete, and the editor's edit must keep it ready to approve.
 *
 * Known limit: if the reporter's article were saved by someone else between the editor
 * opening the page and saving, the editor's version would replace it. That can't happen
 * here (a pending article is read-only for the reporter), and the requirements say
 * simultaneous editing doesn't need to be supported.
 *
 * Answers 200 { success: true, data: { id, status, updatedAt } }, 400 for a malformed
 * id or an invalid field, 404 if the article doesn't exist, 409 if it isn't pending.
 *
 * @param {import('express').Request} request - params.id; body { title, summary,
 *   category, imageUrl, body }; session.user is the editor.
 * @param {import('express').Response} response - The JSON answer.
 * @returns {Promise<void>}
 * @throws {Error} 400 from readDraftFromRequestBody for an invalid field; errorHandler
 *   turns it into { success: false, error } (Express 5 passes it on from async code).
 */
async function editArticleDraft(request, response) {
  const article = await findArticleFromUrl(request, response);
  if (!article) {
    return;
  }

  if (article.status !== STATUS.PENDING) {
    sendError(response, 409, `An article that is "${STATUS_LABELS[article.status]}" can't be edited by the editor; only articles awaiting approval can`);
    return;
  }

  // Express 5 leaves request.body undefined when the request has no body.
  const draft = readDraftFromRequestBody(request.body || {});

  const emptyFields = REQUIRED_CONTENT_FIELDS.filter((field) => draft[field].trim() === '');
  if (emptyFields.length > 0) {
    const labels = emptyFields.map((field) => CONTENT_FIELD_LABELS[field]);
    sendError(response, 400, `These fields can't be empty in a submitted article: ${labels.join(', ')}`);
    return;
  }

  article.draft = draft;
  await article.save();

  logger.info(`Draft of article ${article._id} edited by editor "${request.session.user.displayName}" (still awaiting approval)`);
  response.json({
    success: true,
    data: { id: article._id.toString(), status: article.status, updatedAt: article.updatedAt },
  });
}

/**
 * POST /api/editor/articles/:id/approve - publishes the article: its working copy
 * (draft) becomes the version readers see (published).
 *
 * For an update to a live article this is the moment readers switch from the old
 * version to the new one; until now they kept seeing the last approved version.
 * Every approval is recorded in publishHistory, which the analytics chart marks.
 *
 * The request body is not read at all: what gets published is exactly the draft the
 * editor reviewed, so nobody can publish other content by sending it in the request.
 * Only an editor can reach this, and only from pending (canTransition), so a reporter
 * can never publish, even by calling the API directly (requirements).
 *
 * Known limit: two editors pressing Approve at the same moment could both pass the
 * status check before either saves, adding two history entries. The requirements say
 * simultaneous editing of one article doesn't need to be supported; a stricter
 * version would update with a condition (only if status is still pending).
 *
 * Answers 200 { success: true, data: { id, status, lastPublishedAt } },
 * 400 for a malformed id, 404 if the article doesn't exist, and 409 if its status
 * doesn't allow publishing or a required field is empty.
 *
 * @param {import('express').Request} request - params.id; session.user is the editor.
 * @param {import('express').Response} response - The JSON answer.
 * @returns {Promise<void>}
 */
async function approveArticle(request, response) {
  const article = await findArticleFromUrl(request, response);
  if (!article) {
    return;
  }

  // The status rules live in articleWorkflow.js (only pending -> published, only
  // by an editor). The role comes from the server-side session, never the browser.
  if (!canTransition(article.status, STATUS.PUBLISHED, request.session.user.role)) {
    sendError(response, 409, `An article that is "${STATUS_LABELS[article.status]}" can't be published`);
    return;
  }

  // The editor may have edited the draft after it was submitted, so we check again
  // that nothing readers need is missing.
  const missingFields = REQUIRED_CONTENT_FIELDS.filter((field) => !(article.draft[field] || '').trim());
  if (missingFields.length > 0) {
    sendError(response, 409, `The article can't be published without: ${missingFields.join(', ')}`);
    return;
  }

  // One "now" for all three dates, so lastPublishedAt and the new publishHistory
  // entry are exactly the same moment (the chart marker and the feed date agree).
  const now = new Date();

  // toObject() makes a separate plain copy of the draft. Later edits to the draft
  // then can't change what readers see until the next approval.
  article.published = article.draft.toObject();
  article.status = STATUS.PUBLISHED;
  article.editorNote = '';
  if (!article.firstPublishedAt) {
    article.firstPublishedAt = now;
  }
  article.lastPublishedAt = now;
  article.publishHistory.push({ publishedAt: now, editor: request.session.user.id });

  // save() runs the model's validation (lengths, category) before writing.
  await article.save();

  logger.info(`Article ${article._id} approved and published by editor "${request.session.user.displayName}"`);
  response.json({
    success: true,
    data: { id: article._id.toString(), status: article.status, lastPublishedAt: article.lastPublishedAt },
  });
}

/**
 * POST /api/editor/articles/:id/return - body { note }. Sends the article back to its
 * reporter for corrections, with a note saying what to fix.
 *
 * Only the working copy changes status. If the article is live, its published
 * version stays exactly as it is, so readers keep seeing the last approved version.
 *
 * The note is the only value read from the body. It is stored as plain text, and the
 * pages show it with the escaping <%= %> tag, so a note can't add HTML to a page.
 * The review page also checks the note in the browser for a quick message; this
 * check on the server is the real one.
 *
 * Answers 200 { success: true, data: { id, status, editorNote } },
 * 400 if the note is missing, empty or too long (or the id is malformed),
 * 404 if the article doesn't exist, and 409 if its status doesn't allow returning.
 *
 * @param {import('express').Request} request - params.id, body.note; session.user is the editor.
 * @param {import('express').Response} response - The JSON answer.
 * @returns {Promise<void>}
 */
async function returnArticleToReporter(request, response) {
  // In Express 5, request.body is undefined when the request has no body at all,
  // so we fall back to an empty object instead of crashing on undefined.note.
  const body = request.body || {};
  const note = typeof body.note === 'string' ? body.note.trim() : '';

  // The note is checked before the database is touched: without it there is
  // nothing to do (the requirements say a return always comes with a note).
  if (note === '') {
    sendError(response, 400, 'Please write a note telling the reporter what to fix');
    return;
  }
  if (note.length > MAX_EDITOR_NOTE_LENGTH) {
    sendError(response, 400, `The note can be at most ${MAX_EDITOR_NOTE_LENGTH} characters`);
    return;
  }

  const article = await findArticleFromUrl(request, response);
  if (!article) {
    return;
  }

  if (!canTransition(article.status, STATUS.RETURNED, request.session.user.role)) {
    sendError(response, 409, `An article that is "${STATUS_LABELS[article.status]}" can't be returned`);
    return;
  }

  // published is deliberately not touched.
  article.status = STATUS.RETURNED;
  article.editorNote = note;
  await article.save();

  logger.info(`Article ${article._id} returned to its reporter by editor "${request.session.user.displayName}"`);
  response.json({
    success: true,
    data: { id: article._id.toString(), status: article.status, editorNote: article.editorNote },
  });
}

/**
 * DELETE /api/editor/articles/:id - deletes an article together with everything
 * that belongs to it: its comments, its hourly view statistics and the devices'
 * "viewed" marks. Without this, those documents would stay in the database forever,
 * pointing to an article that no longer exists. The browser asks the editor to
 * confirm before calling this.
 *
 * Order matters because our MongoDB is a single server, which has no transactions
 * (all-or-nothing writes need a replica set). We delete the article FIRST: if a
 * later step failed, what is left are only leftovers nobody can see (the article
 * page and chart answer 404 without the article). The other order could fail
 * halfway and leave a live article whose comments and statistics are gone.
 *
 * Any status can be deleted: the requirements let the editor delete content
 * "as needed", so this is not a status change and canTransition isn't asked.
 * Deleting is permanent (there is no "deleted" flag to undo it), which is why the
 * dashboard asks for confirmation first.
 *
 * Answers 200 { success: true, data: { id, deletedComments, deletedViewStats,
 * deletedDeviceViews } }, 400 for a malformed id, 404 if the article doesn't exist.
 *
 * @param {import('express').Request} request - params.id; session.user is the editor.
 * @param {import('express').Response} response - The JSON answer.
 * @returns {Promise<void>}
 */
async function deleteArticle(request, response) {
  const article = await findArticleFromUrl(request, response);
  if (!article) {
    return;
  }

  await article.deleteOne();

  // The three related deletes don't depend on each other, so they run at the same time.
  const [commentsResult, viewStatsResult, deviceViewsResult] = await Promise.all([
    Comment.deleteMany({ article: article._id }),
    ArticleViewStats.deleteMany({ article: article._id }),
    DeviceArticleView.deleteMany({ article: article._id }),
  ]);

  logger.info(
    `Article ${article._id} deleted by editor "${request.session.user.displayName}" ` +
    `(${commentsResult.deletedCount} comments, ${viewStatsResult.deletedCount} view counters, ` +
    `${deviceViewsResult.deletedCount} device marks)`
  );
  response.json({
    success: true,
    data: {
      id: article._id.toString(),
      deletedComments: commentsResult.deletedCount,
      deletedViewStats: viewStatsResult.deletedCount,
      deletedDeviceViews: deviceViewsResult.deletedCount,
    },
  });
}

module.exports = {
  showEditorDashboard,
  showArticleReview,
  listAllArticles,
  editArticleDraft,
  approveArticle,
  returnArticleToReporter,
  deleteArticle,
};
