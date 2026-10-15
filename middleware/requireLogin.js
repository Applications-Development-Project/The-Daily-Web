/**
 * middleware/requireLogin.js
 *
 * Lets only logged-in users through. A guest gets 401 JSON for /api requests, or a
 * redirect to /login for pages. "Logged in" means the server-side session has a user,
 * which the browser can't fake (it only holds a signed session id).
 *
 * Used by: protected routes and middleware/requireRole.js.
 * Owner: OS.
 */

const isApiRequest = require('../utils/isApiRequest');

/**
 * Lets the request through only if someone is logged in.
 *
 * @param {import('express').Request} request - request.session.user is set at login.
 * @param {import('express').Response} response - Redirects guests on pages.
 * @param {import('express').NextFunction} next - Continues, or passes a 401 on.
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
