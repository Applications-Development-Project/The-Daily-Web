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

const bcrypt = require('bcrypt');
const User = require('../models/User');
const Article = require('../models/Article');
const logger = require('../services/logger');

// A MongoDB id is exactly 24 hexadecimal characters; we check the shape to give a
// clear 400 message instead of a database error.
const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

// The user list is shown 20 at a time, like every other list in the project.
const USERS_PER_PAGE = 20;

// A search box value longer than this can't match any username or display name.
const MAX_SEARCH_LENGTH = 100;

// How much work bcrypt does per hash; each +1 doubles it. 10 is what the whole team
// uses (also in scripts/seed.js): fast enough for a login, slow for someone guessing.
const BCRYPT_ROUNDS = 10;

// Field rules. The username and display name limits match models/User.js.
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 30;
// Letters, digits, dot, dash and underscore only: no spaces or symbols that would be
// confusing to type at the login page.
const USERNAME_PATTERN = /^[a-z0-9._-]+$/;
const MAX_DISPLAY_NAME_LENGTH = 50;
const MIN_PASSWORD_LENGTH = 8;
// bcrypt only uses the first 72 bytes; the same limit as the login form.
const MAX_PASSWORD_LENGTH = 200;
const USER_ROLES = ['reporter', 'editor'];

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
 * Checks a new username. It is stored lowercase (see models/User.js), so we compare
 * and save the lowercase form.
 *
 * @param {*} value - body.username.
 * @returns {string} The trimmed, lowercase username.
 * @throws {Error} 400 if it is missing, the wrong length, or has other characters.
 */
function readUsername(value) {
  const username = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (username.length < MIN_USERNAME_LENGTH || username.length > MAX_USERNAME_LENGTH) {
    throw createClientError(400, `Username must be ${MIN_USERNAME_LENGTH} to ${MAX_USERNAME_LENGTH} characters.`);
  }
  if (!USERNAME_PATTERN.test(username)) {
    throw createClientError(400, 'Username can only contain letters, digits, dots, dashes and underscores.');
  }
  return username;
}

/**
 * Checks a display name (the name readers see on articles).
 *
 * @param {*} value - body.displayName.
 * @returns {string} The trimmed display name.
 * @throws {Error} 400 if it is missing, blank or too long.
 */
function readDisplayName(value) {
  const displayName = typeof value === 'string' ? value.trim() : '';
  if (displayName === '' || displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    throw createClientError(400, `Display name must be 1 to ${MAX_DISPLAY_NAME_LENGTH} characters.`);
  }
  return displayName;
}

/**
 * Checks a role.
 *
 * @param {*} value - body.role.
 * @returns {string} "reporter" or "editor".
 * @throws {Error} 400 for anything else.
 */
function readRole(value) {
  if (!USER_ROLES.includes(value)) {
    throw createClientError(400, 'Role must be "reporter" or "editor".');
  }
  return value;
}

/**
 * Checks a new password and turns it into a bcrypt hash. Only the hash is ever stored;
 * bcrypt adds a random salt, so two users with the same password get different hashes,
 * and the password can't be recovered from the hash.
 *
 * Spaces are kept as typed (no trim): they can be part of a password.
 *
 * @param {*} value - body.password.
 * @returns {Promise<string>} The bcrypt hash.
 * @throws {Error} 400 if it isn't a string of the allowed length.
 */
async function hashNewPassword(value) {
  if (typeof value !== 'string' || value.length < MIN_PASSWORD_LENGTH || value.length > MAX_PASSWORD_LENGTH) {
    throw createClientError(400, `Password must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`);
  }
  return bcrypt.hash(value, BCRYPT_ROUNDS);
}

/**
 * Loads the user named in the URL, for an update or delete.
 *
 * @param {string} userId - request.params.id.
 * @returns {Promise<import('mongoose').Document>} The user document (can be changed and saved).
 * @throws {Error} 400 if the id is malformed, 404 if there is no such user.
 */
async function findUserById(userId) {
  if (!OBJECT_ID_PATTERN.test(userId)) {
    throw createClientError(400, 'Invalid user id.');
  }
  const user = await User.findById(userId);
  if (!user) {
    throw createClientError(404, 'User not found.');
  }
  return user;
}

/**
 * Safety rule: never leave the system with zero editors, because then nobody could
 * approve articles or manage users. Called before an editor is demoted or deleted.
 *
 * (The "can't change your own account" rules already make this nearly impossible,
 * since the editor making the request stays an editor. We still check, as a second
 * safety net that doesn't depend on that reasoning.)
 *
 * @returns {Promise<void>}
 * @throws {Error} 409 if this is the last editor.
 */
async function ensureAnotherEditorRemains() {
  const editorCount = await User.countDocuments({ role: 'editor' });
  if (editorCount <= 1) {
    throw createClientError(409, 'The system must keep at least one editor.');
  }
}

/**
 * Safety rule: a reporter who still has articles can't be deleted or made an editor,
 * because their articles would be left without a reporter (moving articles to someone
 * else is out of scope for this project).
 *
 * @param {import('mongoose').Document} user - The reporter.
 * @param {string} actionDescription - For the message, for example "be deleted".
 * @returns {Promise<void>}
 * @throws {Error} 409 if the reporter has at least one article.
 */
async function ensureReporterHasNoArticles(user, actionDescription) {
  // exists() stops at the first match instead of counting them all.
  const hasArticles = await Article.exists({ reporter: user._id });
  if (hasArticles) {
    throw createClientError(409, `This reporter still has articles, so they can't ${actionDescription}.`);
  }
}

/**
 * Checks whether the logged-in editor is acting on their own account.
 *
 * @param {import('express').Request} request - request.session.user.id is the editor.
 * @param {import('mongoose').Document} user - The account being changed.
 * @returns {boolean}
 */
function isOwnAccount(request, user) {
  return request.session.user.id === user._id.toString();
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
 * POST /api/users - body { username, displayName, role, password }.
 * Creates a reporter or editor and answers 201 { success: true, data: <the new user> }.
 *
 * A taken username isn't checked here: the unique index on username refuses it,
 * and errorHandler turns MongoDB's duplicate key error into 409. Checking first and
 * then saving could still let two simultaneous requests both pass; the index can't.
 *
 * @param {import('express').Request} request - The new user's fields.
 * @param {import('express').Response} response - The JSON answer.
 * @returns {Promise<void>}
 * @throws {Error} 400 for an invalid field, 409 (from the index) for a taken username.
 */
async function createUser(request, response) {
  const body = request.body || {};
  const username = readUsername(body.username);
  const displayName = readDisplayName(body.displayName);
  const role = readRole(body.role);
  const passwordHash = await hashNewPassword(body.password);

  const user = await User.create({ username, displayName, role, passwordHash });

  logger.info(`Editor "${request.session.user.displayName}" created user "${user.username}" (${user.role})`);
  response.status(201).json({ success: true, data: toUserResponse(user) });
}

/**
 * Applies a role change after checking the safety rules.
 *
 * @param {import('express').Request} request - Who is asking.
 * @param {import('mongoose').Document} user - The account being changed.
 * @param {string} newRole - "reporter" or "editor".
 * @returns {Promise<void>}
 * @throws {Error} 409 if a safety rule forbids the change.
 */
async function changeRole(request, user, newRole) {
  if (newRole === user.role) {
    return;
  }

  if (newRole === 'reporter') {
    if (isOwnAccount(request, user)) {
      throw createClientError(409, "You can't remove your own editor role.");
    }
    await ensureAnotherEditorRemains();
  } else {
    await ensureReporterHasNoArticles(user, 'become an editor');
  }

  user.role = newRole;
}

/**
 * PATCH /api/users/:id - body with any of { displayName, role, password }.
 * Answers 200 { success: true, data: <the updated user> }.
 * The username can't be changed: it is how the person logs in.
 *
 * @param {import('express').Request} request - The changes.
 * @param {import('express').Response} response - The JSON answer.
 * @returns {Promise<void>}
 * @throws {Error} 400 for invalid input, 404 for an unknown user, 409 for a safety rule.
 */
async function updateUser(request, response) {
  const body = request.body || {};
  if (body.username !== undefined) {
    throw createClientError(400, "The username can't be changed.");
  }
  if (body.displayName === undefined && body.role === undefined && body.password === undefined) {
    throw createClientError(400, 'Nothing to change: send displayName, role or password.');
  }

  const user = await findUserById(request.params.id);

  // Every field is checked before anything is saved, so a request with one bad field
  // changes nothing.
  if (body.displayName !== undefined) {
    user.displayName = readDisplayName(body.displayName);
  }
  if (body.role !== undefined) {
    await changeRole(request, user, readRole(body.role));
  }
  if (body.password !== undefined) {
    user.passwordHash = await hashNewPassword(body.password);
  }

  // save() runs the model's validators again before writing.
  await user.save();

  logger.info(`Editor "${request.session.user.displayName}" updated user "${user.username}"`);
  response.json({ success: true, data: toUserResponse(user) });
}

/**
 * DELETE /api/users/:id - deletes a user, unless a safety rule forbids it.
 * Answers 200 { success: true, data: { id } }, so the page knows which row to remove.
 *
 * @param {import('express').Request} request - request.params.id is the user to delete.
 * @param {import('express').Response} response - The JSON answer.
 * @returns {Promise<void>}
 * @throws {Error} 400 for a malformed id, 404 for an unknown user, 409 for a safety rule.
 */
async function deleteUser(request, response) {
  const user = await findUserById(request.params.id);

  if (isOwnAccount(request, user)) {
    throw createClientError(409, "You can't delete your own account.");
  }
  if (user.role === 'editor') {
    await ensureAnotherEditorRemains();
  } else {
    await ensureReporterHasNoArticles(user, 'be deleted');
  }

  await user.deleteOne();

  logger.info(`Editor "${request.session.user.displayName}" deleted user "${user.username}" (${user.role})`);
  response.json({ success: true, data: { id: user._id.toString() } });
}

module.exports = { showUserManagementPage, searchUsers, createUser, updateUser, deleteUser };
