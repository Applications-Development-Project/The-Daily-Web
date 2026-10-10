/**
 * routes/apiRoutes/analyticsApiRoutes.js
 *
 * JSON API routes for article view statistics. Mounted at "/api" in app.js, so
 * "/editor/articles/:id/views" here is "/api/editor/articles/:id/views" in the browser.
 * Created by OS in phase 0 with the paths and access from the routes table in
 * "Shared contracts"; SM has replaced both placeholders with the real versions:
 * - GET    .../views?from=&to=  the article's hourly views and publish times (the chart's data)
 * - DELETE .../views            reset the article's statistics
 * Together with recordView (create and update) they give the statistics model the
 * full CRUD the requirements ask for. REST: the URL names the resource (the views of
 * one article) and the method says what to do with it.
 *
 * Every route checks requireRole('editor') on the server first: guests get 401 and
 * reporters 403, even when calling the API directly.
 *
 * Related: controllers/analyticsController.js, services/viewTracker.js,
 * middleware/requireRole.js.
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
