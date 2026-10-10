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
 * GET /reporter/articles/:id/edit - the article editor page. PLACEHOLDER.
 * Today it always shows the error page with status 501, so the dashboard's "Edit"
 * link leads here until the editor page is built. The real version will have to
 * check that the article belongs to the logged-in reporter before showing it.
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
 * POST /api/reporter/articles - create a new draft article. PLACEHOLDER.
 * Today it always answers 501. Built in a later branch.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function createArticle(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
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
