/**
 * routes/pageRoutes/reporterPageRoutes.js
 *
 * Page routes for the reporter area. Mounted at "/" in app.js.
 * Created by OS in phase 0 with the paths and access from the routes table in
 * "Shared contracts". EZ replaced both placeholders with the real dashboard and article
 * editor pages.
 *
 * A route file only says WHICH URL goes to WHICH controller function and WHO may
 * use it. It holds no logic, so the access rules can be read in one glance.
 * The matching JSON routes are in routes/apiRoutes/reporterApiRoutes.js.
 *
 * Used by: app.js (it mounts this router).
 * Related: controllers/reporterController.js, middleware/requireRole.js,
 * views/reporter/dashboard.ejs.
 * Owner: EZ.
 */

const express = require('express');
const requireRole = require('../../middleware/requireRole');
const reporterController = require('../../controllers/reporterController');

const router = express.Router();

// Reporters only. requireRole also sends guests to /login.
// Whether the article belongs to this reporter is checked in the controller.
// The check is on the server because hiding a link in the browser is not a
// permission (requirements: "permission checks are also done on the server"):
// a guest or an editor who types /reporter into the address bar still gets
// stopped here. requireRole('reporter') reads the role from the server-side
// session, not from anything the browser sends, so it can't be faked.
// A guest is redirected to /login; a logged-in editor gets a 403 error page.
// GET /reporter takes no id: the controller uses the logged-in reporter's own id
// from the session, so there is no URL a reporter could change to see another list.
// Only /reporter/articles/:id/edit has an :id; there the controller's findOwnedArticle
// checks that the article belongs to this reporter (403 otherwise).
router.get('/reporter', requireRole('reporter'), reporterController.showReporterDashboard);
router.get('/reporter/articles/:id/edit', requireRole('reporter'), reporterController.showArticleEditor);

module.exports = router;
