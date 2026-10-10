/**
 * middleware/setCurrentUser.js
 *
 * Runs on every page and API request, before the routers. It does two things:
 *
 * 1. Keeps the logged-in user's session up to date with the database.
 *    At login, authController copies { id, role, displayName } into the session.
 *    If an editor later changes that user's role or name, or deletes the user, the copy
 *    would be out of date until the session expires (7 days), and an editor demoted to
 *    reporter could keep using editor pages. So for a logged-in user we load the role
 *    and name again from the User collection on each request:
 *    - user deleted: the session forgets the user, so they are logged out,
 *    - role or name changed: the session gets the new values.
 *    Guests have no session user, so this costs nothing for them; for staff it is one
 *    lookup by _id, which MongoDB answers from its built-in index.
 *
 * 2. Makes the user available to every EJS view as "currentUser" ({ id, role,
 *    displayName }, or null for a guest). res.locals is merged into the variables of
 *    every res.render() call, so the header can show "Log in" or the user's name on
 *    every page without each controller passing the user in. This is for display only;
 *    permissions are checked by requireLogin and requireRole, which run after this and
 *    so always see the fresh role.
 *
 * Used by: app.js (after the session middleware, before the routers).
 * Read by: views/partials/header.ejs (SH) and any view that shows login state.
 * Related: models/User.js, controllers/userController.js (where roles change).
 * Owner: OS.
 */

const User = require('../models/User');
const logger = require('../services/logger');

/**
 * Reloads the session user from the database (see the header), then sets
 * res.locals.currentUser.
 *
 * It is async because it waits for the database. In Express 5 a failed lookup goes to
 * errorHandler by itself, so the server doesn't crash.
 *
 * @param {import('express').Request} request - Holds request.session.user after login.
 * @param {import('express').Response} response - Gets response.locals.currentUser.
 * @param {import('express').NextFunction} next - Continues to the next middleware.
 * @returns {Promise<void>}
 */
async function setCurrentUser(request, response, next) {
  const sessionUser = request.session.user;

  if (sessionUser) {
    const user = await User.findById(sessionUser.id).select('role displayName').lean();

    if (!user) {
      // The account was deleted: forget it, so this browser is a guest from now on.
      // express-session saves the changed session at the end of the request.
      logger.info(`Logged out deleted user "${sessionUser.displayName}"`);
      delete request.session.user;
    } else if (user.role !== sessionUser.role || user.displayName !== sessionUser.displayName) {
      request.session.user = { id: sessionUser.id, role: user.role, displayName: user.displayName };
    }
  }

  // We use null, not undefined, so views can simply write "if (currentUser)".
  response.locals.currentUser = request.session.user || null;
  next();
}

module.exports = setCurrentUser;
