/**
 * middleware/requireLogin.js
 *
 * Protects a route so only logged-in users (reporters and editors) reach it.
 * A guest gets:
 * - 401 JSON { success: false, error } for /api requests, which fetch code can show, or
 * - a redirect to /login for pages, so a person lands where they can log in.
 *
 * "Logged in" means the server-side session has a user (set at login by
 * authController). The browser only holds a signed session id, so it can't fake this.
 *
 * Usage in a route file:
 *   router.get('/reporter', requireLogin, requireRole('reporter'), showReporterDashboard);
 * (requireRole also checks login by itself, so requireRole alone is enough too.)
 *
 * Used by: every protected route file, and middleware/requireRole.js.
 * Related: middleware/isApiRequest.js, middleware/errorHandler.js (sends the 401 JSON).
 * Owner: OS.
 */

const isApiRequest = require('./isApiRequest');

/**
 * Lets the request through only if someone is logged in.
 *
 * @param {import('express').Request} request - request.session.user is set after login.
 * @param {import('express').Response} response - Used to redirect guests on pages.
 * @param {import('express').NextFunction} next - Continues, or passes a 401 error on.
 * @returns {void}
 */
function requireLogin(request, response, next) {
  if (request.session.user) {
    return next();
  }

  if (isApiRequest(request)) {
    const error = new Error('Please log in to continue.');
    error.statusCode = 401;
    return next(error);
  }

  response.redirect('/login');
}

module.exports = requireLogin;
