/**
 * controllers/reporterController.js
 *
 * The reporter's side: the dashboard and article editor pages, and the JSON API behind
 * them (list, create, autosave, submit).
 *
 * Rules for every function here:
 * - Only reporters get in (requireRole in the routes). The reporter's id always comes from
 *   the session, and the status and owner are never read from the request body.
 * - Ownership is checked here (findOwnedArticle), not in canTransition, because it needs
 *   the article from the database. Status changes go through canTransition.
 * - Only `draft` and `status` change here; `published` (what readers see) changes only
 *   when the editor approves.
 *
 * Known limits: autosave and submit load, check and save, so two requests at the same
 * instant could interleave (the page sends one at a time); the list is not paged.
 *
 * Used by: routes/pageRoutes/reporterPageRoutes.js, routes/apiRoutes/reporterApiRoutes.js.
 * Owner: EZ.
 */

const Article = require('../models/Article');
const { STATUS, STATUS_LABELS, canTransition } = require('../services/articleWorkflow');
const logger = require('../services/logger');
// Shared with the editor's edit, so both follow exactly the same draft rules.
const { DRAFT_FIELDS, readDraftFromRequestBody } = require('../services/draftValidation');
const { createHttpError } = require('../utils/httpErrors');
const { isValidObjectId } = require('../utils/requestValidation');

// The statuses in which a reporter may change the working copy. "pending" is missing on
// purpose: while the editor reviews it, it is read-only.
const EDITABLE_STATUSES = [STATUS.DRAFT, STATUS.RETURNED, STATUS.PUBLISHED];

/**
 * Loads the article only if it exists AND belongs to this reporter. Every route that works
 * on one article starts here, so the check can't be forgotten.
 *
 * @param {string} articleId - The id from the URL.
 * @param {string} reporterId - The logged-in reporter's id, from the session.
 * @returns {Promise<import('mongoose').Document>} The article document.
 * @throws {Error} 400 bad id, 404 not found, 403 another reporter's article.
 */
async function findOwnedArticle(articleId, reporterId) {
  if (!isValidObjectId(articleId)) {
    throw createHttpError(400, 'Invalid article id.');
  }

  const article = await Article.findById(articleId);
  if (!article) {
    throw createHttpError(404, 'Article not found.');
  }

  // article.reporter is an ObjectId, reporterId a string: compare them as strings.
  if (article.reporter.toString() !== reporterId) {
    throw createHttpError(403, 'You can only open your own articles.');
  }

  return article;
}

/**
 * GET /reporter - the dashboard: the reporter's own articles, rendered on the server.
 *
 * @param {import('express').Request} request - request.session.user is the reporter.
 * @param {import('express').Response} response - Renders 'reporter/dashboard'.
 * @returns {Promise<void>}
 */
async function showReporterDashboard(request, response) {
  const articles = await findReporterArticles(request.session.user.id);

  response.render('reporter/dashboard', {
    title: 'My articles - The Daily Web',
    articles,
    // The view compares with STATUS names instead of typing 'draft' (a typo would be undefined).
    STATUS,
    // The status filter's choices, from the shared status list (like the editor dashboard's),
    // so a new status would appear here by itself.
    statusOptions: Object.values(STATUS).map((status) => ({ value: status, label: STATUS_LABELS[status] })),
  });
}

/**
 * GET /reporter/articles/:id/edit - the article editor, filled from the draft stored on the
 * server (not the browser), so closing the browser or changing computers loses nothing.
 *
 * @param {import('express').Request} request - params.id; session.user is the reporter.
 * @param {import('express').Response} response - Renders 'reporter/articleEditor'.
 * @returns {Promise<void>}
 * @throws {Error} 400, 403, 404 (findOwnedArticle), or 409 for a pending article.
 */
async function showArticleEditor(request, response) {
  const article = await findOwnedArticle(request.params.id, request.session.user.id);

  if (!EDITABLE_STATUSES.includes(article.status)) {
    throw createHttpError(409, 'This article is waiting for the editor and cannot be edited right now.');
  }

  response.render('reporter/articleEditor', {
    title: 'Edit article - The Daily Web',
    // Only what the view needs, not the whole document.
    article: {
      id: article._id.toString(),
      // For the badge's colour (status-draft, status-returned...), as on the dashboard.
      status: article.status,
      statusLabel: STATUS_LABELS[article.status],
      // published is null until the first approval.
      isLive: article.published !== null && article.published !== undefined,
      editorNote: article.status === STATUS.RETURNED ? article.editorNote : '',
      draft: {
        title: article.draft.title,
        summary: article.draft.summary,
        category: article.draft.category,
        imageUrl: article.draft.imageUrl,
        body: article.draft.body,
      },
    },
    categories: Article.CATEGORIES,
  });
}

/**
 * Loads one reporter's articles for the dashboard, newest update first. Shared by the page
 * and the API, so they can't disagree about which articles are the reporter's.
 * "status" (the working copy) and "isLive" (readers can see a version) are separate: a live
 * article being edited is both "In preparation" and live.
 *
 * @param {string} reporterId - From the session (Mongoose turns it into an ObjectId).
 * @returns {Promise<Object[]>} Items { id, title, summary, category, status, statusLabel,
 *   isLive, editorNote, updatedAt }.
 */
async function findReporterArticles(reporterId) {
  const articles = await Article.find({ reporter: reporterId })
    // Matches the { reporter: 1, updatedAt: -1 } index, so no sorting in memory.
    .sort({ updatedAt: -1 })
    // Only the dashboard's fields: no bodies. published.title is enough to tell if it is live.
    .select('status draft.title draft.summary draft.category published.title editorNote updatedAt')
    .lean();

  return articles.map((article) => ({
    id: article._id.toString(),
    title: article.draft.title,
    summary: article.draft.summary,
    category: article.draft.category,
    status: article.status,
    statusLabel: STATUS_LABELS[article.status],
    isLive: article.published !== null && article.published !== undefined,
    // The note shows while returned, and while pending again after a resubmit (it is
    // cleared only by the editor's approval).
    editorNote: (article.status === STATUS.RETURNED || article.status === STATUS.PENDING) ? article.editorNote : '',
    updatedAt: article.updatedAt,
  }));
}

/**
 * GET /api/reporter/articles - the logged-in reporter's own articles as JSON.
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
 * POST /api/reporter/articles - creates a new, empty article ("In preparation") for the
 * logged-in reporter. The body is never read: the owner, status and published copy are
 * decided by the server, so nobody can create an article in someone else's name.
 *
 * @param {import('express').Request} request - request.session.user is the reporter.
 * @param {import('express').Response} response - Answers 201 { success: true, data: { id } }.
 * @returns {Promise<void>}
 */
async function createArticle(request, response) {
  const article = await Article.create({
    reporter: request.session.user.id,
    status: STATUS.DRAFT,
    // null = never approved, so the public site can't show it.
    published: null,
    // draft is left out: the model gives it empty fields.
  });

  // 201 Created: a new resource exists. The browser only needs the id.
  response.status(201).json({ success: true, data: { id: article._id.toString() } });
}

/**
 * PATCH /api/reporter/articles/:id/draft - autosave: replaces the whole draft with the five
 * fields. Only `draft` is written, so readers keep the approved version (`published`)
 * until an editor approves the new one.
 *
 * @param {import('express').Request} request - params.id, body (the five fields), session.user.
 * @param {import('express').Response} response - Answers 200 { success: true, data: { savedAt } }.
 * @returns {Promise<void>}
 * @throws {Error} 400 (bad id or body), 403, 404, or 409 for a pending article.
 */
async function autosaveDraft(request, response) {
  const article = await findOwnedArticle(request.params.id, request.session.user.id);

  if (!EDITABLE_STATUSES.includes(article.status)) {
    throw createHttpError(409, 'This article is waiting for the editor and cannot be edited right now.');
  }

  // Express 5 leaves request.body undefined when there is no body.
  const draft = readDraftFromRequestBody(request.body || {});

  // First edit of a live article: the new version is "In preparation" again and must be
  // approved; `published` is not touched.
  if (article.status === STATUS.PUBLISHED) {
    if (!canTransition(STATUS.PUBLISHED, STATUS.DRAFT, 'reporter')) {
      throw createHttpError(409, 'This article cannot be edited right now.');
    }
    article.status = STATUS.DRAFT;
  }

  article.draft = draft;
  await article.save();

  // Now, not updatedAt: if nothing changed, save() writes nothing and updatedAt stays old.
  response.json({ success: true, data: { savedAt: new Date().toISOString() } });
}

// Must be filled before submitting (the image is optional), with the names shown in errors.
const REQUIRED_SUBMIT_FIELDS = {
  title: 'title',
  summary: 'summary',
  category: 'category',
  body: 'article text',
};

/**
 * Lists the required fields that are still empty (spaces only count as empty).
 *
 * @param {{title: string, summary: string, category: string, body: string}} draft - The saved draft.
 * @returns {string[]} The display names of the empty fields; empty if the draft is complete.
 */
function findMissingRequiredFields(draft) {
  return Object.keys(REQUIRED_SUBMIT_FIELDS)
    .filter(function (fieldName) {
      return (draft[fieldName] || '').trim() === '';
    })
    .map(function (fieldName) {
      return REQUIRED_SUBMIT_FIELDS[fieldName];
    });
}

/**
 * Tells whether a live article's draft is identical to its published version, so a submit
 * would be an "update" that changes nothing (but still adds a history entry and a chart
 * marker). Checked on the server, which has both copies.
 *
 * @param {import('mongoose').Document} article - With its draft and published copies.
 * @returns {boolean} true if it is live and all five fields are identical.
 */
function hasNoChangesFromPublished(article) {
  if (article.published === null || article.published === undefined) {
    return false;
  }
  return DRAFT_FIELDS.every(function (fieldName) {
    return (article.draft[fieldName] || '') === (article.published[fieldName] || '');
  });
}

/**
 * POST /api/reporter/articles/:id/submit - sends the article to the editor: "In
 * preparation" or "Returned" becomes "Awaiting editor approval". The saved draft is
 * checked (not the request), so the editor reviews exactly what was checked. `published`
 * and the editor's note are not changed.
 *
 * @param {import('express').Request} request - params.id; session.user is the reporter.
 * @param {import('express').Response} response - Answers 200
 *   { success: true, data: { id, status, statusLabel } }.
 * @returns {Promise<void>}
 * @throws {Error} 400 (bad id or missing fields), 403, 404, or 409 (status or no changes).
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

  if (hasNoChangesFromPublished(article)) {
    throw createHttpError(409, 'There are no changes to submit: the text is the same as the published version.');
  }

  const previousStatus = article.status;
  article.status = STATUS.PENDING;
  await article.save();

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
