/**
 * routes/apiRoutes/reporterApiRoutes.js
 *
 * JSON API routes for the reporter area. Mounted at "/api" in app.js, so
 * "/reporter/articles" here is "/api/reporter/articles" in the browser.
 * Created by OS in phase 0 with the paths and access from the routes table in
 * "Shared contracts". GET /reporter/articles (list my articles) now runs real code
 * in the controller; create, autosave and submit are still PLACEHOLDERS that answer
 * 501 { success: false, error: "Not implemented yet" } until those branches are done.
 *
 * The routes follow REST: the URL names the thing (an article), the HTTP method says
 * the action (GET reads, POST creates or triggers a step, PATCH changes part of an
 * article). Every answer is JSON in the shape { success, data } or { success, error }.
 * The matching page routes are in routes/pageRoutes/reporterPageRoutes.js.
 *
 * Used by: app.js (it mounts this router at /api).
 * Related: controllers/reporterController.js, middleware/requireRole.js.
 * Owner: EZ.
 */

const express = require('express');
const requireRole = require('../../middleware/requireRole');
const reporterController = require('../../controllers/reporterController');

const router = express.Router();

// Reporters only (guests get 401, editors 403). Whether the article belongs to
// this reporter is checked in the controller, because it needs the article from the database.
// requireRole('reporter') runs on every route, so a call made with Postman or curl is
// stopped the same way as a click in the browser: the requirements say that hiding
// buttons is not a permission, so the real check must be on the server. The role comes
// from the server-side session, never from the request.
// The reporter's own id also comes from the session. No route takes a reporter id
// in the URL or body, so a reporter can't ask for, or create an article for, someone else.
// GET and POST share one path (/reporter/articles); the method tells them apart.
router.get('/reporter/articles', requireRole('reporter'), reporterController.listMyArticles);
router.post('/reporter/articles', requireRole('reporter'), reporterController.createArticle);
router.patch('/reporter/articles/:id/draft', requireRole('reporter'), reporterController.autosaveDraft);
router.post('/reporter/articles/:id/submit', requireRole('reporter'), reporterController.submitArticleForApproval);

module.exports = router;
