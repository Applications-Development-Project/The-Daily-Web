/**
 * routes/pageRoutes/reporterPageRoutes.js
 *
 * Page routes for the reporter area (dashboard and article editor), mounted at "/" in app.js.
 *
 * Related: controllers/reporterController.js, middleware/requireRole.js.
 * Owner: EZ.
 */

const express = require('express');
const requireRole = require('../../middleware/requireRole');
const reporterController = require('../../controllers/reporterController');

const router = express.Router();

// requireRole runs first, on the server: guests go to /login, editors get a 403 page.
// The edit page's controller also checks that the article is this reporter's (403 otherwise).
router.get('/reporter', requireRole('reporter'), reporterController.showReporterDashboard);
router.get('/reporter/articles/:id/edit', requireRole('reporter'), reporterController.showArticleEditor);

module.exports = router;
