/**
 * routes/pageRoutes/analyticsPageRoutes.js
 *
 * Page route for Impact Analytics. Mounted at "/" in app.js.
 * Created by OS in phase 0 with the path and access from the routes table in
 * "Shared contracts". The page (showAnalyticsPage) is the frame; its script
 * public/js/analyticsChart.js loads the chart data from analyticsApiRoutes.js.
 * ?article=<id> is optional and opens that article's chart at once.
 *
 * requireRole('editor') runs on the server before the controller, so only an editor
 * can open the page, whatever the browser sends (requirements: server-side permissions).
 *
 * Related: controllers/analyticsController.js, middleware/requireRole.js.
 * Owner: SM.
 */

const express = require('express');
const requireRole = require('../../middleware/requireRole');
const analyticsController = require('../../controllers/analyticsController');

const router = express.Router();

// Editors only. requireRole also sends guests to /login.
router.get('/editor/analytics', requireRole('editor'), analyticsController.showAnalyticsPage);

module.exports = router;
