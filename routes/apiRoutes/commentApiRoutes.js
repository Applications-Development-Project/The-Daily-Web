/**
 * routes/apiRoutes/commentApiRoutes.js
 *
 * JSON API for comments (mounted at "/api" in app.js): an article's comments, and the
 * editor's moderation. Never a bare "/articles/:id" route, so it can't clash with
 * DELETE /api/articles/viewed.
 *
 * Owner: OS.
 */

const express = require('express');
const requireRole = require('../../middleware/requireRole');
const limitGuestComments = require('../../middleware/commentRateLimiter');
const commentController = require('../../controllers/commentController');

const router = express.Router();

// Open to everyone. Posting goes through the limiter first, so a guest's 4th comment in a
// minute never reaches the controller.
router.get('/articles/:id/comments', commentController.listArticleComments);
router.post('/articles/:id/comments', limitGuestComments, commentController.addComment);

// Moderation: editors only (guests get 401, reporters 403).
router.get('/comments', requireRole('editor'), commentController.searchComments);
router.patch('/comments/:id', requireRole('editor'), commentController.updateComment);
router.delete('/comments/:id', requireRole('editor'), commentController.deleteComment);

module.exports = router;
