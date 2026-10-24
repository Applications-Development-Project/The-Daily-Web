/**
 * controllers/userController.js
 *
 * User management for the editor (full CRUD on User): the page and the Users API.
 * Editor-only (requireRole in the routes). Safety rules, each answered with 409:
 * an editor can't delete or demote their own account; the system always keeps an
 * editor; a reporter who has articles can't be deleted or made an editor.
 * A user sent to the browser is { id, username, displayName, role, createdAt }, never
 * the password hash.
 *
 * Used by: routes/pageRoutes/userPageRoutes.js, routes/apiRoutes/userApiRoutes.js.
 * Owner: OS.
 */

const bcrypt = require('bcrypt');
const User = require('../models/User');
const Article = require('../models/Article');
const logger = require('../services/logger');
const { createHttpError } = require('../utils/httpErrors');
const { isValidObjectId, escapeRegExp, readSearchText, readPageNumber } = require('../utils/requestValidation');

const USERS_PER_PAGE = 20;

// Longer can't match any username or display name.
const MAX_SEARCH_LENGTH = 100;

// bcrypt's work per hash (each +1 doubles it): fast for a login, slow for a guesser.
const BCRYPT_ROUNDS = 10;

// The same limits as models/User.js.
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 30;
// No spaces or symbols that would be confusing to type at login.
const USERNAME_PATTERN = /^[a-z0-9._-]+$/;
const MAX_DISPLAY_NAME_LENGTH = 50;
const MIN_PASSWORD_LENGTH = 8;
// bcrypt uses only the first 72 bytes; the same limit as the login form.
const MAX_PASSWORD_LENGTH = 200;
const USER_ROLES = ['reporter', 'editor'];

/**
 * Turns a user into the shape sent to the browser. Picking fields one by one means
 * passwordHash can never leak by mistake.
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
 * Checks a new username (stored lowercase).
 *
 * @param {*} value - body.username.
 * @returns {string} The trimmed, lowercase username.
 * @throws {Error} 400 if missing, the wrong length, or with other characters.
 */
function readUsername(value) {
  const username = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (username.length < MIN_USERNAME_LENGTH || username.length > MAX_USERNAME_LENGTH) {
    throw createHttpError(400, `Username must be ${MIN_USERNAME_LENGTH} to ${MAX_USERNAME_LENGTH} characters.`);
  }
  if (!USERNAME_PATTERN.test(username)) {
    throw createHttpError(400, 'Username can only contain letters, digits, dots, dashes and underscores.');
  }
  return username;
}

/**
 * Checks a display name (the name readers see on articles).
 *
 * @param {*} value - body.displayName.
 * @returns {string} The trimmed display name.
 * @throws {Error} 400 if missing, blank or too long.
 */
function readDisplayName(value) {
  const displayName = typeof value === 'string' ? value.trim() : '';
  if (displayName === '' || displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    throw createHttpError(400, `Display name must be 1 to ${MAX_DISPLAY_NAME_LENGTH} characters.`);
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
    throw createHttpError(400, 'Role must be "reporter" or "editor".');
  }
  return value;
}

/**
 * Checks a new password and hashes it with bcrypt (a random salt per hash; the password
 * can't be recovered). Spaces are kept: they can be part of a password.
 *
 * @param {*} value - body.password.
 * @returns {Promise<string>} The bcrypt hash.
 * @throws {Error} 400 if it isn't a string of the allowed length.
 */
async function hashNewPassword(value) {
  if (typeof value !== 'string' || value.length < MIN_PASSWORD_LENGTH || value.length > MAX_PASSWORD_LENGTH) {
    throw createHttpError(400, `Password must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`);
  }
  return bcrypt.hash(value, BCRYPT_ROUNDS);
}

/**
 * Loads the user named in the URL.
 *
 * @param {string} userId - request.params.id.
 * @returns {Promise<import('mongoose').Document>}
 * @throws {Error} 400 for a malformed id, 404 if there is no such user.
 */
async function findUserById(userId) {
  if (!isValidObjectId(userId)) {
    throw createHttpError(400, 'Invalid user id.');
  }
  const user = await User.findById(userId);
  if (!user) {
    throw createHttpError(404, 'User not found.');
  }
  return user;
}

// The safety rules answer 409 (not allowed in the current state), not 403: the editor
// IS allowed to manage users.

/**
 * Safety rule: never zero editors (nobody could approve or manage users). A second
 * safety net beside "you can't demote yourself".
 *
 * @returns {Promise<void>}
 * @throws {Error} 409 if this is the last editor.
 */
async function ensureAnotherEditorRemains() {
  const editorCount = await User.countDocuments({ role: 'editor' });
  if (editorCount <= 1) {
    throw createHttpError(409, 'The system must keep at least one editor.');
  }
}

/**
 * Safety rule: a reporter with articles can't be deleted or made an editor (their articles
 * would have no reporter; moving articles is out of scope).
 *
 * @param {import('mongoose').Document} user - The reporter.
 * @param {string} actionDescription - For the message, for example "be deleted".
 * @returns {Promise<void>}
 * @throws {Error} 409 if the reporter has an article.
 */
async function ensureReporterHasNoArticles(user, actionDescription) {
  // exists() stops at the first match instead of counting.
  const hasArticles = await Article.exists({ reporter: user._id });
  if (hasArticles) {
    throw createHttpError(409, `This reporter still has articles, so they can't ${actionDescription}.`);
  }
}

/**
 * Checks whether the logged-in editor is acting on their own account.
 *
 * @param {import('express').Request} request
 * @param {import('mongoose').Document} user
 * @returns {boolean}
 */
function isOwnAccount(request, user) {
  return request.session.user.id === user._id.toString();
}

/**
 * GET /editor/users - the page, sent empty; public/js/editor/users.js fills it from the API.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response - Renders views/editor/users.ejs.
 * @returns {void}
 */
function showUserManagementPage(request, response) {
  response.render('editor/users');
}

/**
 * GET /api/users?search=&page= - users whose username or display name contains the text
 * (any capitals), by username, 20 per page. A "contains" search can't use an index, which
 * costs nothing with a few dozen staff accounts.
 * Answers 200 { success: true, data: { users, page, totalPages, totalUsers } }.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {Promise<void>}
 * @throws {Error} 400 for an invalid search or page.
 */
async function searchUsers(request, response) {
  const searchText = readSearchText(request.query.search, MAX_SEARCH_LENGTH);
  const page = readPageNumber(request.query.page);

  let filter = {};
  if (searchText !== '') {
    const searchPattern = new RegExp(escapeRegExp(searchText), 'i');
    filter = { $or: [{ username: searchPattern }, { displayName: searchPattern }] };
  }

  // Both at the same time: one round trip instead of two.
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
 * POST /api/users - body { username, displayName, role, password }. Answers 201 with the
 * new user. A taken username is refused by the unique index (409 from errorHandler): a
 * check-then-save could let two simultaneous requests both pass, the index can't.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {Promise<void>}
 * @throws {Error} 400 for an invalid field, 409 for a taken username.
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
 * @throws {Error} 409 if a safety rule forbids it.
 */
async function changeRole(request, user, newRole) {
  if (newRole === user.role) {
    return;
  }

  if (newRole === 'reporter') {
    if (isOwnAccount(request, user)) {
      throw createHttpError(409, "You can't remove your own editor role.");
    }
    await ensureAnotherEditorRemains();
  } else {
    await ensureReporterHasNoArticles(user, 'become an editor');
  }

  user.role = newRole;
}

/**
 * PATCH /api/users/:id - any of { displayName, role, password }. The username can't
 * change (it is how the person logs in). Answers 200 with the updated user.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {Promise<void>}
 * @throws {Error} 400 for invalid input, 404 for an unknown user, 409 for a safety rule.
 */
async function updateUser(request, response) {
  const body = request.body || {};
  if (body.username !== undefined) {
    throw createHttpError(400, "The username can't be changed.");
  }
  if (body.displayName === undefined && body.role === undefined && body.password === undefined) {
    throw createHttpError(400, 'Nothing to change: send displayName, role or password.');
  }

  // findById + save(), not findByIdAndUpdate: the safety rules need the current role,
  // save() always runs the validators, and only the fields assigned below are written.
  // passwordHash isn't loaded (select: false) and is saved only if it changes.
  const user = await findUserById(request.params.id);

  // Every field is checked before saving, so one bad field changes nothing.
  if (body.displayName !== undefined) {
    user.displayName = readDisplayName(body.displayName);
  }
  if (body.role !== undefined) {
    await changeRole(request, user, readRole(body.role));
  }
  if (body.password !== undefined) {
    user.passwordHash = await hashNewPassword(body.password);
  }

  await user.save();

  logger.info(`Editor "${request.session.user.displayName}" updated user "${user.username}"`);
  response.json({ success: true, data: toUserResponse(user) });
}

/**
 * DELETE /api/users/:id - deletes a user unless a safety rule forbids it.
 * Answers 200 { success: true, data: { id } }.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {Promise<void>}
 * @throws {Error} 400 for a malformed id, 404 for an unknown user, 409 for a safety rule.
 */
async function deleteUser(request, response) {
  const user = await findUserById(request.params.id);

  if (isOwnAccount(request, user)) {
    throw createHttpError(409, "You can't delete your own account.");
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
