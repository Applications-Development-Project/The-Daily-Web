/**
 * controllers/authController.js
 *
 * PLACEHOLDER (phase 0). Owner: OS, who replaces these bodies in the next branch
 * (os/feature-basic-login). The function names and module.exports stay the same,
 * because the route files below already call them.
 * Until then, API functions answer 501 { success: false, error: "Not implemented yet" }
 * and page functions show the shared error page with status 501.
 *
 * What it will do: show the login page, log in (check the password with bcrypt and
 * store { id, role, displayName } in req.session.user), and log out.
 *
 * Used by: routes/pageRoutes/authPageRoutes.js, routes/apiRoutes/authApiRoutes.js.
 */

/**
 * GET /login - the login page. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function showLoginPage(request, response) {
  response.status(501).render('public/error', { statusCode: 501, message: 'The login page is not built yet.' });
}

/**
 * POST /api/auth/login - check username and password, start a session. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function logIn(request, response) {
  response.status(501).json({ success: false, error: 'Not implemented yet' });
}

/**
 * POST /logout - end the session and go back to the home page. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function logOut(request, response) {
  response.status(501).render('public/error', { statusCode: 501, message: 'Logging out is not built yet.' });
}

module.exports = { showLoginPage, logIn, logOut };
