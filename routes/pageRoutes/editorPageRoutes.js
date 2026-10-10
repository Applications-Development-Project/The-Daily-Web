/**
 * routes/pageRoutes/editorPageRoutes.js
 *
 * Page routes for the editor's article management. Mounted at "/" in app.js.
 * Created by OS in phase 0 with the paths and access from the routes table in
 * "Shared contracts"; the controller behind them is a PLACEHOLDER until SM replaces it.
 * (The other /editor pages live in their own owners' files: /editor/analytics in
 * analyticsPageRoutes.js, /editor/users and /editor/comments in OS's route files.)
 *
 * Owner: SM.
 */

const express = require('express');
const requireRole = require('../../middleware/requireRole');
const editorController = require('../../controllers/editorController');

const router = express.Router();

// Editors only. requireRole also sends guests to /login.
router.get('/editor', requireRole('editor'), editorController.showEditorDashboard);
router.get('/editor/articles/:id', requireRole('editor'), editorController.showArticleReview);

module.exports = router;
