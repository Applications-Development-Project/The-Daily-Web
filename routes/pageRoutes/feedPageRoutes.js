/**
 * routes/pageRoutes/feedPageRoutes.js
 *
 * The home page feed, mounted at "/" in app.js.
 *
 * Related: controllers/feedController.js.
 * Owner: SH.
 */

const express = require('express');
const feedController = require('../../controllers/feedController');

const router = express.Router();

// Open to everyone, so no login check.
router.get('/', feedController.showFeedPage);

module.exports = router;
