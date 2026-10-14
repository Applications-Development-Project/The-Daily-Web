/**
 * routes/apiRoutes/feedApiRoutes.js
 *
 * JSON API routes for the feed. Mounted at "/api" in app.js, so "/articles" here is
 * "/api/articles" in the browser.
 * Created by OS in phase 0 with the paths and access from the routes table in
 * "Shared contracts"; SH wrote the real controller behind them:
 * - GET    /articles?search=&category=&viewed=&sort=&page=  one page of 20 live articles
 * - DELETE /articles/viewed                                 forget this device's viewed marks
 *
 * No login check: guests read the feed, and each browser has its own viewed marks
 * (identified by the deviceId cookie on the server, never by anything in the URL).
 *
 * Note: this router must keep the exact path "/articles/viewed" and must never add a
 * bare "/articles/:id" API route, so "viewed" can never be read as an article id
 * (see the note under the routes table).
 *
 * Related: controllers/feedController.js, public/js/public/feed.js.
 * Owner: SH.
 */

const express = require('express');
const feedController = require('../../controllers/feedController');

const router = express.Router();

// Both are open to everyone: guests read the feed and have their own viewed marks.
router.get('/articles', feedController.listFeedArticles);
router.delete('/articles/viewed', feedController.resetViewedMarks);

module.exports = router;
