/**
 * routes/pageRoutes/analyticsPageRoutes.js
 *
 * Page route for Impact Analytics. Mounted at "/" in app.js.
 * Created by OS in phase 0 with the path and access from the routes table in
 * "Shared contracts"; the controller behind it is a PLACEHOLDER until SM replaces it.
 *
 * Owner: SM.
 */

const express = require('express');
const requireRole = require('../../middleware/requireRole');
const analyticsController = require('../../controllers/analyticsController');

const router = express.Router();

// Editors only. requireRole also sends guests to /login.
router.get('/editor/analytics', requireRole('editor'), analyticsController.showAnalyticsPage);

module.exports = router;
