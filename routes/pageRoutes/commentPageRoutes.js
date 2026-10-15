/**
 * routes/pageRoutes/commentPageRoutes.js
 *
 * The editor's comment moderation page, mounted at "/" in app.js.
 *
 * Owner: OS.
 */

const express = require('express');
const requireRole = require('../../middleware/requireRole');
const commentController = require('../../controllers/commentController');

const router = express.Router();

// Editors only; guests go to /login.
router.get('/editor/comments', requireRole('editor'), commentController.showCommentModerationPage);

module.exports = router;
