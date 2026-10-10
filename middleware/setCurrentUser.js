/**
 * middleware/setCurrentUser.js
 *
 * Makes the logged-in user available to every EJS view as "currentUser"
 * ({ id, role, displayName }, or null for a guest). res.locals is merged into the
 * variables of every res.render() call, so the header partial can show "Log in" or
 * the user's name on every page without each controller passing the user in.
 *
 * This is for display only. It never grants access: permissions are checked by
 * requireLogin and requireRole on the server.
 *
 * Used by: app.js (after the session middleware, before the routers).
 * Read by: views/partials/header.ejs (SH) and any view that shows login state.
 * Owner: OS.
 */

/**
 * Copies the session's user (or null) into res.locals.currentUser.
 *
 * @param {import('express').Request} request - Holds request.session.user after login.
 * @param {import('express').Response} response - Gets response.locals.currentUser.
 * @param {import('express').NextFunction} next - Continues to the next middleware.
 * @returns {void}
 */
function setCurrentUser(request, response, next) {
  // We use null, not undefined, so views can simply write "if (currentUser)".
  response.locals.currentUser = request.session.user || null;
  next();
}

module.exports = setCurrentUser;
