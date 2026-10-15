/**
 * routes/apiRoutes/feedApiRoutes.js
 *
 * JSON API for the feed, mounted at "/api" in app.js: one page of 20 live articles, and
 * resetting this device's viewed marks. Never add a bare "/articles/:id" API route here,
 * or "viewed" could be read as an article id.
 *
 * Related: controllers/feedController.js.
 * Owner: SH.
 */

const express = require('express');
const feedController = require('../../controllers/feedController');

const router = express.Router();

// Open to everyone: guests read the feed and have their own viewed marks (deviceId cookie).
router.get('/articles', feedController.listFeedArticles);
router.delete('/articles/viewed', feedController.resetViewedMarks);

module.exports = router;
