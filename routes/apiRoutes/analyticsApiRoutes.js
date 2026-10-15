/**
 * routes/apiRoutes/analyticsApiRoutes.js
 *
 * JSON API for an article's view statistics, mounted at "/api" in app.js:
 * GET .../views?from=&to= returns the chart data, DELETE .../views resets them.
 *
 * Related: controllers/analyticsController.js, middleware/requireRole.js.
 * Owner: SM.
 */

const express = require('express');
const requireRole = require('../../middleware/requireRole');
const analyticsController = require('../../controllers/analyticsController');

const router = express.Router();

// Checked on the server for every call: guests get 401, reporters 403.
router.get('/editor/articles/:id/views', requireRole('editor'), analyticsController.getArticleViews);
router.delete('/editor/articles/:id/views', requireRole('editor'), analyticsController.resetArticleViews);

module.exports = router;
