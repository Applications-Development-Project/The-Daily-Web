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
const { STATUS, STATUS_LABELS } = require('../services/articleWorkflow');

/**
 * GET /reporter - the reporter's dashboard page: a list of their own articles with
 * status labels. The list is rendered on the server (EJS), so the page arrives complete.
 *
 * Only reporters reach this function (requireRole('reporter') in the route file),
 * and the list is filtered by the session's user id, so it only ever shows their own articles.
 * The view views/reporter/dashboard.ejs is added in the next commit.
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
 * GET /reporter/articles/:id/edit - the article editor page. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function showArticleEditor(request, response) {
  response.status(501).render('public/error', { statusCode: 501, message: 'The article editor is not built yet.' });
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
 * PATCH /api/reporter/articles/:id/draft - autosave the draft. PLACEHOLDER.
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
