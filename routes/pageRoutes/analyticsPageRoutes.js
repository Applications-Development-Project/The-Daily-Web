/**
 * routes/pageRoutes/analyticsPageRoutes.js
 *
 * Page route for Impact Analytics, mounted at "/" in app.js. ?article=<id> is optional
 * and opens that article's chart at once.
 *
 * Related: controllers/analyticsController.js, middleware/requireRole.js.
 * Owner: SM.
 */

const express = require('express');
const requireRole = require('../../middleware/requireRole');
const analyticsController = require('../../controllers/analyticsController');

const router = express.Router();

// requireRole runs first, on the server: guests go to /login, reporters get a 403 page.
router.get('/editor/analytics', requireRole('editor'), analyticsController.showAnalyticsPage);

module.exports = router;
