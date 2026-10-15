/**
 * routes/pageRoutes/editorPageRoutes.js
 *
 * Page routes for the editor's dashboard and review page, mounted at "/" in app.js.
 *
 * Related: controllers/editorController.js, middleware/requireRole.js.
 * Owner: SM.
 */

const express = require('express');
const requireRole = require('../../middleware/requireRole');
const editorController = require('../../controllers/editorController');

const router = express.Router();

// requireRole runs first, on the server: guests go to /login, reporters get a 403 page.
router.get('/editor', requireRole('editor'), editorController.showEditorDashboard);
router.get('/editor/articles/:id', requireRole('editor'), editorController.showArticleReview);

module.exports = router;
