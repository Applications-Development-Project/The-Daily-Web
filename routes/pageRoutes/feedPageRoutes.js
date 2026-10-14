/**
 * routes/pageRoutes/feedPageRoutes.js
 *
 * Page route for the home page feed. Mounted at "/" in app.js.
 * Created by OS in phase 0 with the path and access from the routes table in
 * "Shared contracts"; SH wrote the real controller behind it (the first 20 articles are
 * rendered on the server; public/js/public/feed.js loads the rest).
 *
 * Related: controllers/feedController.js, views/public/feed.ejs.
 *
 * Owner: SH.
 */

const express = require('express');
const feedController = require('../../controllers/feedController');

const router = express.Router();

// Open to everyone, so no login check.
router.get('/', feedController.showFeedPage);

module.exports = router;
