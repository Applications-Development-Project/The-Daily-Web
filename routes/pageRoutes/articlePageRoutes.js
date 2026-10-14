/**
 * routes/pageRoutes/articlePageRoutes.js
 *
 * Page route for a single article. Mounted at "/" in app.js.
 * Created by OS in phase 0 with the path and access from the routes table in
 * "Shared contracts"; SH wrote the real controller behind it, which renders the whole
 * article on the server (for search engines) and counts the view.
 *
 * :id is any text here; the controller checks it and answers the 404 page for a malformed
 * or unknown id, or an article that isn't live.
 *
 * Related: controllers/articlePageController.js, views/public/article.ejs.
 *
 * Owner: SH.
 */

const express = require('express');
const articlePageController = require('../../controllers/articlePageController');

const router = express.Router();

// Open to everyone, so no login check.
router.get('/articles/:id', articlePageController.showArticlePage);

module.exports = router;
