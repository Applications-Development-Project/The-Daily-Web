/**
 * routes/pageRoutes/articlePageRoutes.js
 *
 * Page route for a single article. Mounted at "/" in app.js.
 * Created by OS in phase 0 with the path and access from the routes table in
 * "Shared contracts"; the controller behind it is a PLACEHOLDER until SH replaces it.
 *
 * Owner: SH.
 */

const express = require('express');
const articlePageController = require('../../controllers/articlePageController');

const router = express.Router();

// Open to everyone, so no login check.
router.get('/articles/:id', articlePageController.showArticlePage);

module.exports = router;
