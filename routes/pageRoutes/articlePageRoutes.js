/**
 * routes/pageRoutes/articlePageRoutes.js
 *
 * The full article page, mounted at "/" in app.js. The controller checks the id
 * (404 for a malformed, unknown or not-live article).
 *
 * Related: controllers/articlePageController.js.
 * Owner: SH.
 */

const express = require('express');
const articlePageController = require('../../controllers/articlePageController');

const router = express.Router();

// Open to everyone, so no login check.
router.get('/articles/:id', articlePageController.showArticlePage);

module.exports = router;
