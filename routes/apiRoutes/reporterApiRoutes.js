/**
 * routes/apiRoutes/reporterApiRoutes.js
 *
 * JSON API routes for the reporter area. Mounted at "/api" in app.js, so
 * "/reporter/articles" here is "/api/reporter/articles" in the browser.
 * Created by OS in phase 0 with the paths and access from the routes table in
 * "Shared contracts"; the controller behind them is a PLACEHOLDER until EZ replaces it.
 *
 * Owner: EZ.
 */

const express = require('express');
const requireRole = require('../../middleware/requireRole');
const reporterController = require('../../controllers/reporterController');

const router = express.Router();

// Reporters only (guests get 401, editors 403). Whether the article belongs to
// this reporter is checked in the controller, because it needs the article from the database.
router.get('/reporter/articles', requireRole('reporter'), reporterController.listMyArticles);
router.post('/reporter/articles', requireRole('reporter'), reporterController.createArticle);
router.patch('/reporter/articles/:id/draft', requireRole('reporter'), reporterController.autosaveDraft);
router.post('/reporter/articles/:id/submit', requireRole('reporter'), reporterController.submitArticleForApproval);

module.exports = router;
