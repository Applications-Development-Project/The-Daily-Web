/**
 * middleware/requireRole.js
 *
 * Lets only users with one role through, for example requireRole('editor'). Not logged in:
 * like requireLogin (401 or /login). Another role: 403. The role comes only from the
 * server-side session (refreshed every request by setCurrentUser.js), never from anything
 * the browser sends, so it can't be faked.
 *
 * Used by: the reporter and editor route files.
 * Owner: OS.
 */

const requireLogin = require('./requireLogin');

// Must match the role enum in models/User.js.
const KNOWN_ROLES = ['reporter', 'editor'];

/**
 * Builds a middleware that allows only the given role. The role name is checked once,
 * when the route file loads, so a typo like requireRole('editr') stops the server at
 * startup instead of silently locking everyone out. The returned function remembers its
 * role (a closure).
 *
 * @param {string} role - "reporter" or "editor".
 * @returns {import('express').RequestHandler}
 * @throws {Error} If role is unknown.
 */
function requireRole(role) {
  if (!KNOWN_ROLES.includes(role)) {
    throw new Error(`requireRole: unknown role "${role}". Use one of: ${KNOWN_ROLES.join(', ')}.`);
  }

  /**
   * Lets the request through only if the logged-in user has the role.
   *
   * @param {import('express').Request} request - request.session.user holds the role.
   * @param {import('express').Response} response
   * @param {import('express').NextFunction} next - Continues, or passes a 403 on.
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
