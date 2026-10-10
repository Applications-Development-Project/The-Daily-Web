/**
 * routes/pageRoutes/commentPageRoutes.js
 *
 * Page route for the editor's comment moderation. Mounted at "/" in app.js.
 * Paths and access follow the routes table in "Shared contracts".
 *
 * Owner: OS.
 */

const express = require('express');
const requireRole = require('../../middleware/requireRole');
const commentController = require('../../controllers/commentController');

const router = express.Router();

// Editors only. requireRole also sends guests to /login.
router.get('/editor/comments', requireRole('editor'), commentController.showCommentModerationPage);

module.exports = router;
