/**
 * routes/pageRoutes/editorPageRoutes.js
 *
 * Page routes for the editor's article management. Mounted at "/" in app.js.
 * Created by OS in phase 0 with the paths and access from the routes table in
 * "Shared contracts"; SM has since replaced both placeholder pages with the real
 * dashboard (GET /editor) and review page (GET /editor/articles/:id).
 * (The other /editor pages live in their own owners' files: /editor/analytics in
 * analyticsPageRoutes.js, /editor/users and /editor/comments in OS's route files.)
 *
 * Why the permission check is here and not in the page: requireRole('editor') runs
 * on the server before the controller, for every request, so a guest or a reporter
 * can't open these pages even by typing the URL (requirements: permissions are
 * checked on the server; hiding buttons or links is not a permission check).
 * The role comes from the server-side session, never from anything the browser sends.
 *
 * Related: controllers/editorController.js, middleware/requireRole.js.
 * Owner: SM.
 */

const express = require('express');
const requireRole = require('../../middleware/requireRole');
const editorController = require('../../controllers/editorController');

const router = express.Router();

// Editors only. requireRole sends guests to /login and shows reporters the error
// page with 403. Express runs the functions in the order listed: first the check,
// then the controller, and the controller is reached only if the check calls next().
// :id is any text here; the controller checks that it is a valid id (else a 404 page).
router.get('/editor', requireRole('editor'), editorController.showEditorDashboard);
router.get('/editor/articles/:id', requireRole('editor'), editorController.showArticleReview);

module.exports = router;
