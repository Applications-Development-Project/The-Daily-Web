/**
 * routes/apiRoutes/editorApiRoutes.js
 *
 * JSON API for the editor's article management, mounted at "/api" in app.js.
 * REST: the URL names the resource and the method says what to do with it. Approve
 * and return are POST because they are actions with rules, not plain field updates.
 * (The /views routes are in analyticsApiRoutes.js.)
 *
 * Related: controllers/editorController.js, middleware/requireRole.js.
 * Owner: SM.
 */

const express = require('express');
const requireRole = require('../../middleware/requireRole');
const editorController = require('../../controllers/editorController');

const router = express.Router();

// Checked on the server for every call: guests get 401, reporters 403.
router.get('/editor/articles', requireRole('editor'), editorController.listAllArticles);
router.patch('/editor/articles/:id/draft', requireRole('editor'), editorController.editArticleDraft);
router.post('/editor/articles/:id/approve', requireRole('editor'), editorController.approveArticle);
router.post('/editor/articles/:id/return', requireRole('editor'), editorController.returnArticleToReporter);
router.delete('/editor/articles/:id', requireRole('editor'), editorController.deleteArticle);

module.exports = router;
