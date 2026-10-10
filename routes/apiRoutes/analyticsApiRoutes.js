/**
 * routes/apiRoutes/analyticsApiRoutes.js
 *
 * JSON API routes for article view statistics. Mounted at "/api" in app.js, so
 * "/editor/articles/:id/views" here is "/api/editor/articles/:id/views" in the browser.
 * Created by OS in phase 0 with the paths and access from the routes table in
 * "Shared contracts"; the controller behind them is a PLACEHOLDER until SM replaces it.
 *
 * Owner: SM.
 */

const express = require('express');
const requireRole = require('../../middleware/requireRole');
const analyticsController = require('../../controllers/analyticsController');

const router = express.Router();

// Editors only (guests get 401, reporters 403).
router.get('/editor/articles/:id/views', requireRole('editor'), analyticsController.getArticleViews);
router.delete('/editor/articles/:id/views', requireRole('editor'), analyticsController.resetArticleViews);

module.exports = router;
