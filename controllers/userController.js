/**
 * controllers/userController.js
 *
 * PLACEHOLDER (phase 0). Owner: OS, who replaces these bodies in phase 1.
 * The function names and module.exports stay the same, because the route files
 * below already call them.
 * Until then, API functions answer 501 { success: false, error: "Not implemented yet" }
 * and page functions show the shared error page with status 501.
 *
 * What it will do: the editor's user management page and the Users API (search,
 * create, update, delete), with the safety rules: an editor can't delete or demote
 * themselves, the last editor can't be removed, and a reporter who has articles can't
 * be deleted or made an editor. passwordHash is never returned.
 *
 * Used by: routes/pageRoutes/userPageRoutes.js, routes/apiRoutes/userApiRoutes.js.
 */

/**
 * GET /editor/users - the user management page. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function showUserManagementPage(request, response) {
  response.status(501).render('public/error', { statusCode: 501, message: 'User management is not built yet.' });
}

/**
 * GET /api/users?search=&page= - search users, 20 per page. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function searchUsers(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
}

/**
 * POST /api/users - create a reporter or editor. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function createUser(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
}

/**
 * PATCH /api/users/:id - change display name, role or password. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function updateUser(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
}

/**
 * DELETE /api/users/:id - delete a user. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function deleteUser(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
}

module.exports = { showUserManagementPage, searchUsers, createUser, updateUser, deleteUser };
