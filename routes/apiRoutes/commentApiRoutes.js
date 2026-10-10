/**
 * routes/apiRoutes/commentApiRoutes.js
 *
 * JSON API routes for comments (full CRUD on the Comment model). Mounted at "/api"
 * in app.js, so "/comments" here is "/api/comments" in the browser.
 * Paths and access follow the routes table in "Shared contracts".
 *
 * This router only defines paths ending in "/comments" under "/articles/:id", never a
 * bare "/articles/:id", so it can't clash with SH's DELETE /api/articles/viewed.
 *
 * Owner: OS.
 */

const express = require('express');
const requireRole = require('../../middleware/requireRole');
const limitGuestComments = require('../../middleware/commentRateLimiter');
const commentController = require('../../controllers/commentController');

const router = express.Router();

// On the article page: open to everyone. Posting goes through the rate limiter
// first, so a guest's 4th comment in a minute never reaches the controller.
router.get('/articles/:id/comments', commentController.listArticleComments);
router.post('/articles/:id/comments', limitGuestComments, commentController.addComment);

// Moderation: editors only (guests get 401, reporters 403).
router.get('/comments', requireRole('editor'), commentController.searchComments);
router.patch('/comments/:id', requireRole('editor'), commentController.updateComment);
router.delete('/comments/:id', requireRole('editor'), commentController.deleteComment);

module.exports = router;
