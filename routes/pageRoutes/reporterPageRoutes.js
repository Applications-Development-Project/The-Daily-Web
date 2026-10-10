/**
 * routes/pageRoutes/reporterPageRoutes.js
 *
 * Page routes for the reporter area. Mounted at "/" in app.js.
 * Created by OS in phase 0 with the paths and access from the routes table in
 * "Shared contracts"; the controller behind them is a PLACEHOLDER until EZ replaces it.
 *
 * Owner: EZ.
 */

const express = require('express');
const requireRole = require('../../middleware/requireRole');
const reporterController = require('../../controllers/reporterController');

const router = express.Router();

// Reporters only. requireRole also sends guests to /login.
// Whether the article belongs to this reporter is checked in the controller.
router.get('/reporter', requireRole('reporter'), reporterController.showReporterDashboard);
router.get('/reporter/articles/:id/edit', requireRole('reporter'), reporterController.showArticleEditor);

module.exports = router;
