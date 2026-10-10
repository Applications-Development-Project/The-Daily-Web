/**
 * middleware/requireRole.js
 *
 * Protects a route so only users with one role reach it, for example
 * requireRole('editor') for every /editor and /api/editor route.
 * - Not logged in: handled exactly like requireLogin (401 JSON or redirect to /login).
 * - Logged in with another role: 403, as JSON for /api or the error page for pages.
 *
 * The role comes only from the server-side session (copied from the User document at
 * login), never from anything the browser sends, so editing a cookie, a hidden field
 * or a request body can't give anyone more rights. This is what the requirements mean
 * by "permissions are checked on the server; hiding buttons is not enough".
 *
 * Used by: the reporter and editor route files.
 * Related: middleware/requireLogin.js, models/User.js (the allowed roles).
 * Owner: OS.
 */

const requireLogin = require('./requireLogin');

// Must match the role enum in models/User.js.
const KNOWN_ROLES = ['reporter', 'editor'];

/**
 * Builds a middleware that allows only the given role.
 *
 * requireRole is called once, when a route file is loaded, and returns the real
 * middleware, which then runs on every request. Checking the role name here, at load
 * time, means a typo like requireRole('editr') stops the server at startup with a clear
 * message, instead of silently locking everyone out of that page.
 *
 * @param {string} role - "reporter" or "editor".
 * @returns {import('express').RequestHandler} Middleware that checks the session's role.
 * @throws {Error} If role is not one of the known roles.
 */
function requireRole(role) {
  if (!KNOWN_ROLES.includes(role)) {
    throw new Error(`requireRole: unknown role "${role}". Use one of: ${KNOWN_ROLES.join(', ')}.`);
  }

  /**
   * Lets the request through only if the logged-in user has the required role.
   *
   * @param {import('express').Request} request - request.session.user holds the role.
   * @param {import('express').Response} response - Passed to requireLogin for guests.
   * @param {import('express').NextFunction} next - Continues, or passes a 403 error on.
   * @returns {void}
   */
  function checkRole(request, response, next) {
    const user = request.session.user;

    if (!user) {
      return requireLogin(request, response, next);
    }

    if (user.role !== role) {
      const error = new Error('You do not have permission to do this.');
      error.statusCode = 403;
      return next(error);
    }

    next();
  }

  return checkRole;
}

module.exports = requireRole;
