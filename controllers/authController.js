/**
 * controllers/authController.js
 *
 * Logging in and out for reporters and editors.
 * - GET  /login           shows the login page (or sends a logged-in user to their area).
 * - POST /api/auth/login  checks username and password; on success stores
 *                         { id, role, displayName } in req.session.user (the shape fixed in
 *                         "Shared contracts") and answers where to go: /reporter or /editor.
 * - POST /logout          ends the session and goes back to the home page.
 *
 * After login, every permission check (requireLogin, requireRole) reads the role from
 * this server-side session, never from anything the browser sends.
 *
 * Used by: routes/pageRoutes/authPageRoutes.js, routes/apiRoutes/authApiRoutes.js.
 * Related: models/User.js, config/session.js, views/public/login.ejs, services/logger.js.
 * Owner: OS.
 */

const bcrypt = require('bcrypt');
const User = require('../models/User');
const logger = require('../services/logger');
const { SESSION_COOKIE_NAME } = require('../config/session');

// The same message for an unknown username and for a wrong password, so the login
// form can't be used to find out which usernames exist.
const LOGIN_FAILED_MESSAGE = 'Wrong username or password.';
const MISSING_FIELDS_MESSAGE = 'Please enter your username and password.';

// Same limit as the User model. A longer username can't exist, so we don't search for it.
const MAX_USERNAME_LENGTH = 30;
// bcrypt only uses the first 72 bytes of a password anyway. Refusing very long input
// stops anyone from making the server hash megabytes of text.
const MAX_PASSWORD_LENGTH = 200;

// Where each role lands after logging in (requirements: a reporter goes to their
// work area, an editor to the management area).
const HOME_PAGE_BY_ROLE = {
  reporter: '/reporter',
  editor: '/editor',
};

/**
 * Reads and checks the login fields from the request body.
 *
 * Both values must be strings. This blocks a NoSQL injection: without the check, a body
 * like { "username": { "$ne": "" } } would reach User.findOne as a query operator
 * ("username not empty") and match the first user in the database.
 *
 * @param {Object|undefined} body - req.body. In Express 5 it is undefined when the
 *   request had no body, so we never read it without checking first.
 * @returns {{username: string, password: string}|null} The cleaned values, or null if
 *   a field is missing, empty or not a string.
 */
function readLoginFields(body) {
  if (!body) {
    return null;
  }

  const { username, password } = body;
  if (typeof username !== 'string' || typeof password !== 'string') {
    return null;
  }

  // Usernames are stored lowercase (see models/User.js), so "Dana" finds "dana".
  const cleanUsername = username.trim().toLowerCase();
  if (cleanUsername === '' || password === '') {
    return null;
  }

  return { username: cleanUsername, password: password };
}

/**
 * Finds the user and checks the password.
 *
 * bcrypt.compare hashes the typed password with the salt stored inside passwordHash
 * and compares the results; the original password is never stored or recovered.
 *
 * @param {string} username - Lowercase, trimmed username.
 * @param {string} password - The password as typed.
 * @returns {Promise<Object|null>} The user document if both are right, otherwise null.
 */
async function findUserWithPassword(username, password) {
  if (username.length > MAX_USERNAME_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return null;
  }

  // passwordHash has select: false in the model, so we must ask for it explicitly.
  // This is the only query in the app that reads it.
  const user = await User.findOne({ username: username }).select('+passwordHash');
  if (!user) {
    return null;
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  return passwordMatches ? user : null;
}

/**
 * Gives the visitor a brand-new session id before we store the user in it.
 * This prevents "session fixation": if an attacker had planted a known session id in
 * someone's browser before they logged in, that id stops working at login.
 * express-session's regenerate() uses a callback; we wrap it in a Promise so the
 * controller can simply "await" it.
 *
 * @param {import('express').Request} request - The request whose session is replaced.
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
 * Deletes the session from the session store (MongoDB), so the old cookie no longer
 * logs anyone in, even if it was copied. Wrapped in a Promise like regenerateSession.
 *
 * @param {import('express').Request} request - The request whose session is deleted.
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
 * GET /login - shows the login page. Someone who is already logged in goes straight
 * to their own area instead of seeing a form they don't need.
 *
 * @param {import('express').Request} request - request.session.user is set if logged in.
 * @param {import('express').Response} response - Renders the page or redirects.
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
 * POST /api/auth/login - body { username, password }.
 * Answers 200 { success: true, data: { redirectTo } } on success,
 * 400 if a field is missing, and 401 with one generic message if the username or
 * password is wrong. Errors from the database or session store go to errorHandler
 * (Express 5 passes a rejected promise from an async controller on by itself).
 *
 * @param {import('express').Request} request - The login request.
 * @param {import('express').Response} response - The JSON answer.
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
    // JSON.stringify puts the username in quotes and escapes line breaks, so a username
    // typed with a line break can't fake an extra line in the log.
    logger.info(`Failed login for username ${JSON.stringify(loginFields.username)}`);
    response.status(401).json({ success: false, error: LOGIN_FAILED_MESSAGE });
    return;
  }

  await regenerateSession(request);
  // Only these three fields go in the session: enough for permission checks and the
  // header, and never the password hash. express-session saves the session to MongoDB
  // before the response is sent.
  request.session.user = {
    id: user._id.toString(),
    role: user.role,
    displayName: user.displayName,
  };

  logger.info(`User "${user.username}" (${user.role}) logged in`);
  response.json({ success: true, data: { redirectTo: HOME_PAGE_BY_ROLE[user.role] } });
}

/**
 * POST /logout - sent by the plain HTML form in the site header (works without
 * JavaScript). Deletes the session, clears the cookie and goes back to the home page.
 * requireLogin runs before it, so request.session.user always exists here.
 *
 * @param {import('express').Request} request - The logout request.
 * @param {import('express').Response} response - Redirects to "/".
 * @returns {Promise<void>}
 */
async function logOut(request, response) {
  const displayName = request.session.user.displayName;

  await destroySession(request);
  // The cookie would be ignored anyway now that its session is gone, but clearing it
  // leaves nothing behind in the browser.
  response.clearCookie(SESSION_COOKIE_NAME);

  logger.info(`User "${displayName}" logged out`);
  response.redirect('/');
}

module.exports = { showLoginPage, logIn, logOut };
