/**
 * routes/apiRoutes/editorApiRoutes.js
 *
 * JSON API routes for the editor's article management. Mounted at "/api" in app.js,
 * so "/editor/articles" here is "/api/editor/articles" in the browser.
 * Created by OS in phase 0 with the paths and access from the routes table in
 * "Shared contracts"; the controller behind them is a PLACEHOLDER until SM replaces it.
 * (The /editor/articles/:id/views routes live in analyticsApiRoutes.js.)
 *
 * Owner: SM.
 */

const express = require('express');
const requireRole = require('../../middleware/requireRole');
const editorController = require('../../controllers/editorController');

const router = express.Router();

// Editors only (guests get 401, reporters 403).
router.get('/editor/articles', requireRole('editor'), editorController.listAllArticles);
router.patch('/editor/articles/:id/draft', requireRole('editor'), editorController.editArticleDraft);
router.post('/editor/articles/:id/approve', requireRole('editor'), editorController.approveArticle);
router.post('/editor/articles/:id/return', requireRole('editor'), editorController.returnArticleToReporter);
router.delete('/editor/articles/:id', requireRole('editor'), editorController.deleteArticle);

module.exports = router;
