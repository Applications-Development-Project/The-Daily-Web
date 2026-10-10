/**
 * controllers/userController.js
 *
 * User management for the editor (full CRUD on the User model): the user management
 * page and the Users API to search, create, update and delete reporters and editors.
 * Every route here is editor-only (requireRole('editor') in the route files).
 *
 * Safety rules, each answered with 409 and a clear message:
 * - an editor can't delete or demote their own account,
 * - no change may leave the system with zero editors,
 * - a reporter who still has articles can't be deleted or made an editor
 *   (moving their articles to someone else is out of scope).
 *
 * Every user sent to the browser has the shape
 * { id, username, displayName, role, createdAt }. passwordHash is never sent.
 *
 * Used by: routes/pageRoutes/userPageRoutes.js, routes/apiRoutes/userApiRoutes.js.
 * Related: models/User.js, models/Article.js, views/editor/users.ejs,
 * public/js/userManagement.js, services/logger.js.
 * Owner: OS.
 */

const User = require('../models/User');

// The user list is shown 20 at a time, like every other list in the project.
const USERS_PER_PAGE = 20;

// A search box value longer than this can't match any username or display name.
const MAX_SEARCH_LENGTH = 100;

/**
 * Builds the error passed to errorHandler, which answers with this status and message.
 *
 * @param {number} statusCode - A 4xx status.
 * @param {string} message - What the editor is told.
 * @returns {Error}
 */
function createClientError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Turns a user from the database into the shape we send to the browser. Picking the
 * fields one by one means passwordHash can never leak, even by mistake.
 *
 * @param {Object} user - A user document or a lean object.
 * @returns {{id: string, username: string, displayName: string, role: string, createdAt: Date}}
 */
function toUserResponse(user) {
  return {
    id: user._id.toString(),
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt,
  };
}

/**
 * Puts a backslash before every character that has a special meaning in a regular
 * expression. Without this, searching for "a.b" would also match "axb" (the dot means
 * "any character"), and a search like "(((" would make the regular expression invalid.
 *
 * @param {string} text - What the editor typed.
 * @returns {string} The same text, safe to use inside a RegExp.
 */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Reads ?search= from the URL. Missing means "no search".
 *
 * @param {*} searchValue - request.query.search. Express gives an array if the
 *   parameter appears twice (?search=a&search=b), so we check the type.
 * @returns {string} The trimmed search text, or '' for none.
 * @throws {Error} 400 if it isn't a single text value or is too long.
 */
function readSearchText(searchValue) {
  if (searchValue === undefined) {
    return '';
  }
  if (typeof searchValue !== 'string' || searchValue.length > MAX_SEARCH_LENGTH) {
    throw createClientError(400, 'Invalid search.');
  }
  return searchValue.trim();
}

/**
 * Reads ?page= from the URL. Missing means page 1.
 *
 * @param {*} pageValue - request.query.page.
 * @returns {number} A whole number, 1 or more.
 * @throws {Error} 400 for anything else, like "0", "-2", "1.5" or "abc".
 */
function readPageNumber(pageValue) {
  if (pageValue === undefined) {
    return 1;
  }
  const page = Number(pageValue);
  if (typeof pageValue !== 'string' || !Number.isInteger(page) || page < 1) {
    throw createClientError(400, 'Page must be a whole number, 1 or more.');
  }
  return page;
}

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
 * GET /api/users?search=&page= - users whose username or display name contains the
 * search text (ignoring capital letters), sorted by username, 20 per page.
 * Answers 200 { success: true, data: { users, page, totalPages, totalUsers } }.
 * totalPages lets the page enable or disable its "Next" button.
 *
 * @param {import('express').Request} request - request.query.search and .page.
 * @param {import('express').Response} response - The JSON answer.
 * @returns {Promise<void>}
 * @throws {Error} 400 for an invalid search or page (passed on to errorHandler).
 */
async function searchUsers(request, response) {
  const searchText = readSearchText(request.query.search);
  const page = readPageNumber(request.query.page);

  // An empty filter {} matches every user. With a search, $or matches either field,
  // and the "i" flag makes the match ignore capital letters.
  let filter = {};
  if (searchText !== '') {
    const searchPattern = new RegExp(escapeRegExp(searchText), 'i');
    filter = { $or: [{ username: searchPattern }, { displayName: searchPattern }] };
  }

  // countDocuments and find run at the same time (Promise.all), so the page waits
  // for one round trip to the database instead of two.
  const [totalUsers, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .sort({ username: 1 })
      .skip((page - 1) * USERS_PER_PAGE)
      .limit(USERS_PER_PAGE)
      .lean(),
  ]);

  response.json({
    success: true,
    data: {
      users: users.map(toUserResponse),
      page: page,
      totalPages: Math.max(1, Math.ceil(totalUsers / USERS_PER_PAGE)),
      totalUsers: totalUsers,
    },
  });
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
