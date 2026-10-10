/**
 * routes/apiRoutes/feedApiRoutes.js
 *
 * JSON API routes for the feed. Mounted at "/api" in app.js, so "/articles" here is
 * "/api/articles" in the browser.
 * Created by OS in phase 0 with the paths and access from the routes table in
 * "Shared contracts"; the controller behind them is a PLACEHOLDER until SH replaces it.
 *
 * Note: this router must keep the exact path "/articles/viewed" and must never add a
 * bare "/articles/:id" API route, so "viewed" can never be read as an article id
 * (see the note under the routes table).
 *
 * Owner: SH.
 */

const express = require('express');
const feedController = require('../../controllers/feedController');

const router = express.Router();

// Both are open to everyone: guests read the feed and have their own viewed marks.
router.get('/articles', feedController.listFeedArticles);
router.delete('/articles/viewed', feedController.resetViewedMarks);

module.exports = router;
