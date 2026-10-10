/**
 * controllers/commentController.js
 *
 * PLACEHOLDER (phase 0). Owner: OS, who replaces these bodies in phase 1.
 * The function names and module.exports stay the same, because the route files
 * below already call them.
 * Until then, API functions answer 501 { success: false, error: "Not implemented yet" }
 * and page functions show the shared error page with status 501.
 *
 * What it will do: list and add comments on an article page (guests limited to 3 per
 * minute by middleware/commentRateLimiter.js), and the editor's comment moderation
 * page and API (search, edit, delete).
 *
 * Used by: routes/pageRoutes/commentPageRoutes.js, routes/apiRoutes/commentApiRoutes.js.
 */

/**
 * GET /api/articles/:id/comments - an article's comments, newest first. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function listArticleComments(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
}

/**
 * POST /api/articles/:id/comments - add a comment. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function addComment(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
}

/**
 * GET /editor/comments - the comment moderation page. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function showCommentModerationPage(request, response) {
  response.status(501).render('public/error', { statusCode: 501, message: 'Comment moderation is not built yet.' });
}

/**
 * GET /api/comments?search=&page= - search all comments, 20 per page. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function searchComments(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
}

/**
 * PATCH /api/comments/:id - edit a comment's text. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function updateComment(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
}

/**
 * DELETE /api/comments/:id - delete a comment. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function deleteComment(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
}

module.exports = {
  listArticleComments,
  addComment,
  showCommentModerationPage,
  searchComments,
  updateComment,
  deleteComment,
};
