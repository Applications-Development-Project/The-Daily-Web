/**
 * controllers/editorController.js
 *
 * The editor's work with articles: the dashboard and review page, editing, approving,
 * returning with a note, and deleting an article with its comments and statistics.
 *
 * Every route is protected with requireRole('editor'), so request.session.user is
 * always an editor here. The article comes from the URL and the editor from the
 * session, never from the request body. APIs answer errors with sendError(); pages
 * throw createHttpError() and errorHandler shows the error page.
 *
 * Used by: routes/pageRoutes/editorPageRoutes.js, routes/apiRoutes/editorApiRoutes.js.
 * Related: models/Article.js, services/articleWorkflow.js, services/draftValidation.js.
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

const ARTICLES_PER_PAGE = 20;
// Titles are at most 200 characters, so a longer search can never match.
const MAX_SEARCH_LENGTH = 200;
// An article can't go live with any of these empty (the image is optional).
const REQUIRED_CONTENT_FIELDS = ['title', 'summary', 'body', 'category'];
// Same limit as Article.editorNote in the model.
const MAX_EDITOR_NOTE_LENGTH = 2000;
// For example "10 Oct 2026, 14:32", as on the rest of the site.
const DATE_TIME_FORMAT = { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' };
// The content fields with the names the review page shows, in page order.
const CONTENT_FIELD_LABELS = {
  title: 'Title',
  summary: 'Summary',
  category: 'Category',
  imageUrl: 'Main image',
  body: 'Body',
};

/**
 * Formats a date for the page ('' when there is none), in the server's time zone.
 *
 * @param {Date|null|undefined} date
 * @returns {string}
 */
function formatDateTime(date) {
  return date ? new Date(date).toLocaleString('en-GB', DATE_TIME_FORMAT) : '';
}

/**
 * Prepares one content object (draft or published) for the page, with the body split
 * into paragraphs (they are separated by a blank line).
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
 * editor sees what an update changes.
 *
 * @param {Object} draft - The working copy.
 * @param {Object|null} published - The live version, or null if never published.
 * @returns {string[]} Field names in page order; empty if not live or nothing changed.
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
    changedFieldLabels: changedFields.map((field) => CONTENT_FIELD_LABELS[field]),
    // Newest approval first.
    publishHistory: article.publishHistory
      .slice()
      .reverse()
      .map((publishEvent) => ({
        publishedAt: formatDateTime(publishEvent.publishedAt),
        editorName: publishEvent.editor ? publishEvent.editor.displayName : 'Unknown editor',
      })),
    // Hiding a button protects nothing: the server checks again when it is used.
    canApprove: canTransition(article.status, STATUS.PUBLISHED, role),
    canReturn: canTransition(article.status, STATUS.RETURNED, role),
    canEdit: role === 'editor',
    // Saving an edit of a live article publishes it at once (see editArticleDraft).
    editPublishesOnSave: article.status === STATUS.PUBLISHED,
    // The draft as stored (the body not split), to fill the Edit form.
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
 * @param {import('express').Response} response
 * @param {number} statusCode - 400, 404, 409...
 * @param {string} message - A message the editor can read.
 * @returns {void}
 */
function sendError(response, statusCode, message) {
  response.status(statusCode).json({ success: false, error: message });
}

/**
 * Loads the article named in the URL, or answers the request itself: 400 for an id
 * that isn't a valid MongoDB id (checked before the database), 404 if it doesn't exist.
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
 * Reads one text value from the query string. Only a plain string may reach a query:
 * an array (?status=a&status=b) or an object could change the query's meaning
 * (NoSQL injection), so it counts as invalid.
 *
 * @param {*} value - request.query.something.
 * @returns {string|null} The trimmed text ('' if not sent), or null if it isn't text.
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
 *   A message for a 400 answer, or the clean values ('' means "no filter").
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
  // Digits only, so "2.5", "-1", "abc" and "1e3" are refused.
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
 * Turns an article into one dashboard row, with only what the table shows. The title is
 * the working copy's, which is what the editor reviews.
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
    reporterName: article.reporter ? article.reporter.displayName : 'Unknown reporter',
    status: article.status,
    statusLabel: STATUS_LABELS[article.status],
    // Live = readers can see it, whatever the status of the working copy.
    isLive: Boolean(article.published),
    updatedAt: article.updatedAt,
  };
}

/**
 * GET /editor - the dashboard. The table arrives empty; public/js/editor/dashboard.js
 * fills it from the API, so the rows are built in one place only.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response - Renders views/editor/dashboard.ejs.
 * @returns {Promise<void>}
 */
async function showEditorDashboard(request, response) {
  const statusValues = Object.values(STATUS);

  // Defense question: "Why countDocuments and not loading the articles and counting them?"
  // MongoDB counts with the index and sends back one number, instead of sending hundreds of documents.
  // Note: The numbers are from when the page opened. A delete doesn't update them, 
  // but it's enough for an overview.
  const counts = await Promise.all(
    statusValues.map(status => Article.countDocuments({ status }))
  );

  const statusCounts = {};
  statusValues.forEach((status, i) => {
    statusCounts[status] = counts[i];
  });

  // From the shared status list, so the filter offers exactly what the API accepts.
  const statusOptions = statusValues.map((status) => ({ value: status, label: STATUS_LABELS[status] }));
  
  response.render('editor/dashboard', {
    title: 'Articles - Editor - The Daily Web',
    statusOptions: statusOptions,
    statusCounts: statusCounts,
  });
}

/**
 * GET /editor/articles/:id - the review page of one article.
 *
 * @param {import('express').Request} request - params.id; session.user is the editor.
 * @param {import('express').Response} response - Renders views/editor/articleReview.ejs.
 * @returns {Promise<void>}
 * @throws {Error} 404 (the error page) if the id is malformed or no article has it.
 */
async function showArticleReview(request, response) {
  // For a person, "bad id" and "no such article" both mean "not found".
  if (!isValidObjectId(request.params.id)) {
    throw createHttpError(404, 'Article not found');
  }

  const article = await Article.findById(request.params.id)
    .populate('reporter', 'displayName')
    .populate('publishHistory.editor', 'displayName')
    .lean();
  if (!article) {
    throw createHttpError(404, 'Article not found');
  }

  const review = toReviewView(article, request.session.user.role);
  response.render('editor/articleReview', {
    title: `Review: ${review.title} - Editor - The Daily Web`,
    review: review,
    // The model's list, so the Edit form never offers a category the server refuses.
    categories: Article.CATEGORIES,
  });
}

/**
 * GET /api/editor/articles?status=&search=&page= - every article, newest change first,
 * 20 per page. search matches the working or the live title, any capitals.
 *
 * Fast with thousands of articles: 20 rows per answer, only the table's fields (.select,
 * .lean), and the sort uses the { updatedAt, _id } indexes. Known limit: a search inside
 * titles can't use an index (a text index could, but matches whole words only).
 *
 * Answers 200 { success: true, data: { articles, page, totalPages, totalArticles } },
 * or 400 if a parameter is invalid.
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
    // escapeRegExp: the text is searched as typed ("C++" is not a pattern).
    const titlePattern = new RegExp(escapeRegExp(listQuery.search), 'i');
    filter.$or = [{ 'draft.title': titlePattern }, { 'published.title': titlePattern }];
  }

  // The page and the count don't depend on each other, so they run at the same time.
  // _id breaks ties in updatedAt, so paging never repeats or skips an article.
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
      // At least 1, so an empty result reads "page 1 of 1".
      totalPages: Math.max(1, Math.ceil(totalArticles / ARTICLES_PER_PAGE)),
      totalArticles: totalArticles,
    },
  });
}

/**
 * Makes the working copy (draft) the version readers see, and records the publish in
 * the history (a marker on the analytics chart). Shared by approving and by the
 * editor's edit of a live article. Changes the document in memory; the caller saves it.
 *
 * @param {import('mongoose').Document} article - The article to publish.
 * @param {string} editorId - The logged-in editor's id, from the session.
 * @returns {void}
 */
function publishWorkingCopy(article, editorId) {
  // One "now" for all dates, so the chart marker and the feed date agree.
  const now = new Date();
  // toObject() makes a separate copy: later draft edits can't change what readers see.
  article.published = article.draft.toObject();
  article.status = STATUS.PUBLISHED;
  article.editorNote = '';
  if (!article.firstPublishedAt) {
    article.firstPublishedAt = now;
  }
  article.lastPublishedAt = now;
  article.publishHistory.push({ publishedAt: now, editor: editorId });
}

/**
 * PATCH /api/editor/articles/:id/draft - the editor edits an article in any status
 * (requirements p.6: the editor can edit all articles). The status never changes:
 * - pending, draft or returned: only the working copy changes; readers keep the live version;
 * - published: saving is the approval, so the edit is published at once (the page asks
 *   for confirmation first). Saving it unchanged answers 409, so no empty "update" is
 *   added to the history.
 *
 * The fields are checked by EZ's readDraftFromRequestBody, the same rules as the
 * reporter's autosave (it also drops any other field, like "status"). For a pending or
 * published article, title, summary, body and category can't be empty.
 *
 * Answers 200 { success: true, data: { id, status, published, updatedAt } } (published:
 * true when the edit went live), 400 for a bad id or field, 404 if not found, 409 when a
 * live article is saved unchanged.
 *
 * @param {import('express').Request} request - params.id; body { title, summary,
 *   category, imageUrl, body }; session.user is the editor.
 * @param {import('express').Response} response - The JSON answer.
 * @returns {Promise<void>}
 * @throws {Error} 400 from readDraftFromRequestBody for an invalid field.
 */
async function editArticleDraft(request, response) {
  const article = await findArticleFromUrl(request, response);
  if (!article) {
    return;
  }

  // Express 5 leaves request.body undefined when the request has no body.
  const draft = readDraftFromRequestBody(request.body || {});

  const mustBeComplete = article.status === STATUS.PENDING || article.status === STATUS.PUBLISHED;
  const emptyFields = REQUIRED_CONTENT_FIELDS.filter((field) => draft[field].trim() === '');
  if (mustBeComplete && emptyFields.length > 0) {
    const labels = emptyFields.map((field) => CONTENT_FIELD_LABELS[field]);
    sendError(response, 400, `These fields can't be empty in an article that is "${STATUS_LABELS[article.status]}": ${labels.join(', ')}`);
    return;
  }

  const publishesNow = article.status === STATUS.PUBLISHED;
  if (publishesNow && findChangedFields(draft, article.published).length === 0) {
    sendError(response, 409, 'There are no changes to publish: the text is the same as the published version');
    return;
  }

  article.draft = draft;
  if (publishesNow) {
    publishWorkingCopy(article, request.session.user.id);
  }
  // save() runs the model's validation (lengths, category) before writing.
  await article.save();

  logger.info(publishesNow
    ? `Live article ${article._id} edited and published by editor "${request.session.user.displayName}"`
    : `Draft of article ${article._id} edited by editor "${request.session.user.displayName}" (status stays ${article.status})`);
  response.json({
    success: true,
    data: { id: article._id.toString(), status: article.status, published: publishesNow, updatedAt: article.updatedAt },
  });
}

/**
 * POST /api/editor/articles/:id/approve - publishes the article's working copy. For an
 * update of a live article, this is the moment readers switch to the new version.
 * The body is not read: exactly the reviewed draft is published.
 *
 * Known limit: two editors approving at the same moment could both pass the status
 * check and add two history entries (simultaneous editing needn't be supported).
 *
 * Answers 200 { success: true, data: { id, status, lastPublishedAt } }, 400 for a
 * malformed id, 404 if not found, 409 if the status or a missing field prevents it.
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

  // Only pending -> published, only by an editor (articleWorkflow.js). The role comes
  // from the server-side session.
  if (!canTransition(article.status, STATUS.PUBLISHED, request.session.user.role)) {
    sendError(response, 409, `An article that is "${STATUS_LABELS[article.status]}" can't be published`);
    return;
  }

  const missingFields = REQUIRED_CONTENT_FIELDS.filter((field) => !(article.draft[field] || '').trim());
  if (missingFields.length > 0) {
    sendError(response, 409, `The article can't be published without: ${missingFields.join(', ')}`);
    return;
  }

  publishWorkingCopy(article, request.session.user.id);
  await article.save();

  logger.info(`Article ${article._id} approved and published by editor "${request.session.user.displayName}"`);
  response.json({
    success: true,
    data: { id: article._id.toString(), status: article.status, lastPublishedAt: article.lastPublishedAt },
  });
}

/**
 * POST /api/editor/articles/:id/return - body { note }. Returns the article to its
 * reporter with a required note. A live version stays online unchanged.
 *
 * Answers 200 { success: true, data: { id, status, editorNote } }, 400 if the note is
 * missing, empty or too long (or the id is malformed), 404 if not found, 409 if the
 * status doesn't allow returning.
 *
 * @param {import('express').Request} request - params.id, body.note; session.user is the editor.
 * @param {import('express').Response} response - The JSON answer.
 * @returns {Promise<void>}
 */
async function returnArticleToReporter(request, response) {
  // Express 5: request.body is undefined when the request has no body.
  const body = request.body || {};
  const note = typeof body.note === 'string' ? body.note.trim() : '';

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
 * DELETE /api/editor/articles/:id - deletes an article (any status) with its comments,
 * view counters and device marks. The browser asks for confirmation first.
 *
 * Our single MongoDB server has no transactions, so the article is deleted first: if a
 * later step failed, only invisible leftovers remain, never a live article without its
 * comments.
 *
 * Answers 200 { success: true, data: { id, deletedComments, deletedViewStats,
 * deletedDeviceViews } }, 400 for a malformed id, 404 if not found.
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

  // Independent deletes, so they run at the same time.
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