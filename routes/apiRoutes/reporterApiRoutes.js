/**
 * routes/apiRoutes/reporterApiRoutes.js
 *
 * JSON API for the reporter area, mounted at "/api" in app.js: list my articles, create
 * one, autosave its draft and submit it.
 *
 * Related: controllers/reporterController.js, middleware/requireRole.js.
 * Owner: EZ.
 */

const express = require('express');
const requireRole = require('../../middleware/requireRole');
const reporterController = require('../../controllers/reporterController');

const router = express.Router();

// Checked on the server for every call: guests get 401, editors 403. The reporter's id
// comes from the session, never the request; ownership is checked in the controller.
router.get('/reporter/articles', requireRole('reporter'), reporterController.listMyArticles);
router.post('/reporter/articles', requireRole('reporter'), reporterController.createArticle);
router.patch('/reporter/articles/:id/draft', requireRole('reporter'), reporterController.autosaveDraft);
router.post('/reporter/articles/:id/submit', requireRole('reporter'), reporterController.submitArticleForApproval);

module.exports = router;
