/**
 * middleware/setCurrentUser.js
 *
 * Runs on every request, before the routers:
 * 1. Refreshes the logged-in user from the database, so a role change or a deleted
 *    account applies on the very next request (otherwise an editor demoted to reporter
 *    could keep editor rights for the 7 days of the session). Guests cost nothing.
 * 2. Sets res.locals.currentUser ({ id, role, displayName } or null), which every view
 *    gets automatically (the header's login state). Display only: permissions are
 *    checked by requireLogin and requireRole, which run after this.
 *
 * Used by: app.js (after the session, before the routers).
 * Owner: OS.
 */

const User = require('../models/User');
const logger = require('../services/logger');

/**
 * Reloads the session user, then sets res.locals.currentUser. A failed lookup goes to
 * errorHandler by itself (Express 5).
 *
 * @param {import('express').Request} request - Holds request.session.user after login.
 * @param {import('express').Response} response - Gets response.locals.currentUser.
 * @param {import('express').NextFunction} next
 * @returns {Promise<void>}
 */
async function setCurrentUser(request, response, next) {
  const sessionUser = request.session.user;

  if (sessionUser) {
    // One lookup by _id, answered from MongoDB's built-in index.
    const user = await User.findById(sessionUser.id).select('role displayName').lean();

    if (!user) {
      // The account was deleted: this browser is a guest from now on.
      logger.info(`Logged out deleted user "${sessionUser.displayName}"`);
      delete request.session.user;
    } else if (user.role !== sessionUser.role || user.displayName !== sessionUser.displayName) {
      request.session.user = { id: sessionUser.id, role: user.role, displayName: user.displayName };
    }
  }

  // null, not undefined, so views can write "if (currentUser)".
  response.locals.currentUser = request.session.user || null;
  next();
}

module.exports = setCurrentUser;
