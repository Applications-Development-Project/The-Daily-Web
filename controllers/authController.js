/**
 * controllers/authController.js
 *
 * Logging in and out: GET /login, POST /api/auth/login (on success the session gets
 * { id, role, displayName } and the answer says where to go) and POST /logout.
 *
 * An unknown username and a wrong password get the same message AND take the same time
 * (an unknown username is still compared against DUMMY_PASSWORD_HASH), so neither the
 * message nor the timing reveals which usernames exist.
 *
 * Used by: routes/pageRoutes/authPageRoutes.js, routes/apiRoutes/authApiRoutes.js.
 * Owner: OS.
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const logger = require('../services/logger');
const { SESSION_COOKIE_NAME } = require('../config/session');

const LOGIN_FAILED_MESSAGE = 'Wrong username or password.';
const MISSING_FIELDS_MESSAGE = 'Please enter your username and password.';

// Same limit as the model: a longer username can't exist.
const MAX_USERNAME_LENGTH = 30;
// bcrypt uses only the first 72 bytes; refusing long input stops hashing megabytes of text.
const MAX_PASSWORD_LENGTH = 200;

// A hash of a random password nobody knows, made once at startup; it can never match.
// 10 rounds, the same cost as every real hash.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomUUID(), 10);

// Where each role lands after logging in; decided by the server from the database role.
const HOME_PAGE_BY_ROLE = {
  reporter: '/reporter',
  editor: '/editor',
};

/**
 * Reads the login fields. Both must be strings: { "username": { "$ne": "" } } would
 * otherwise reach findOne as a query operator and match the first user (NoSQL injection).
 *
 * @param {Object|undefined} body - req.body (undefined in Express 5 when there is no body).
 * @returns {{username: string, password: string}|null} The values, or null if a field is
 *   missing, empty or not a string.
 */
function readLoginFields(body) {
  if (!body) {
    return null;
  }

  const { username, password } = body;
  if (typeof username !== 'string' || typeof password !== 'string') {
    return null;
  }

  // Usernames are stored lowercase, so "Dana" finds "dana".
  const cleanUsername = username.trim().toLowerCase();
  if (cleanUsername === '' || password === '') {
    return null;
  }

  return { username: cleanUsername, password: password };
}

/**
 * Finds the user and checks the password. bcrypt.compare hashes the typed password with
 * the salt stored in passwordHash; the password itself is never stored or recovered.
 *
 * @param {string} username - Lowercase, trimmed.
 * @param {string} password - As typed.
 * @returns {Promise<Object|null>} The user if both are right, otherwise null.
 */
async function findUserWithPassword(username, password) {
  if (username.length > MAX_USERNAME_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return null;
  }

  // passwordHash has select: false; this is the only query that reads it.
  const user = await User.findOne({ username: username }).select('+passwordHash');
  if (!user) {
    // The same bcrypt work as a real check, so the timing doesn't reveal anything.
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    return null;
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  return passwordMatches ? user : null;
}

/**
 * Gives the visitor a new session id before storing the user in it, against "session
 * fixation" (a session id planted in the browser before login stops working).
 * Wraps the callback of regenerate() in a Promise, so it can be awaited.
 *
 * @param {import('express').Request} request
 * @returns {Promise<void>}
 * @throws {Error} If the session store fails.
 */
function regenerateSession(request) {
  return new Promise((resolve, reject) => {
    request.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

/**
 * Deletes the session from MongoDB, so the old cookie no longer works, even if copied.
 *
 * @param {import('express').Request} request
 * @returns {Promise<void>}
 * @throws {Error} If the session store fails.
 */
function destroySession(request) {
  return new Promise((resolve, reject) => {
    request.session.destroy((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

/**
 * GET /login - the login page; a logged-in user goes straight to their area.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function showLoginPage(request, response) {
  const user = request.session.user;
  if (user) {
    response.redirect(HOME_PAGE_BY_ROLE[user.role]);
    return;
  }
  response.render('public/login');
}

/**
 * POST /api/auth/login - body { username, password }. Answers 200 { success: true,
 * data: { redirectTo } }, 400 if a field is missing, 401 if the username or password is wrong.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {Promise<void>}
 */
async function logIn(request, response) {
  const loginFields = readLoginFields(request.body);
  if (!loginFields) {
    response.status(400).json({ success: false, error: MISSING_FIELDS_MESSAGE });
    return;
  }

  const user = await findUserWithPassword(loginFields.username, loginFields.password);
  if (!user) {
    // JSON.stringify quotes the name, so a typed line break can't fake a log line.
    // The password is never logged.
    logger.info(`Failed login for username ${JSON.stringify(loginFields.username)}`);
    response.status(401).json({ success: false, error: LOGIN_FAILED_MESSAGE });
    return;
  }

  await regenerateSession(request);
  // Only these three fields go in the session, never the password hash.
  request.session.user = {
    id: user._id.toString(),
    role: user.role,
    displayName: user.displayName,
  };

  logger.info(`User "${user.username}" (${user.role}) logged in`);
  response.json({ success: true, data: { redirectTo: HOME_PAGE_BY_ROLE[user.role] } });
}

/**
 * POST /logout - from the header's plain form. Deletes the session, clears the cookie and
 * goes home. POST, not GET: a POST started by another site arrives without our
 * sameSite: 'lax' cookie, so requireLogin turns it away.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response - Redirects to "/".
 * @returns {Promise<void>}
 */
async function logOut(request, response) {
  const displayName = request.session.user.displayName;

  await destroySession(request);
  // Useless without its session anyway, but nothing is left behind.
  response.clearCookie(SESSION_COOKIE_NAME);

  logger.info(`User "${displayName}" logged out`);
  response.redirect('/');
}

module.exports = { showLoginPage, logIn, logOut };
