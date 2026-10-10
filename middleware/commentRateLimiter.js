/**
 * middleware/commentRateLimiter.js
 *
 * Will enforce the requirement "a guest may post at most 3 comments per minute from
 * the same device"; a 4th attempt gets 429 with a clear message.
 *
 * STUB (phase 0): it lets every comment through. It already has its final name and
 * parameters, so the comment route can use it now and nothing else changes when the
 * real version arrives in phase 2. The real version will:
 * - skip the check for logged-in reporters and editors (the limit is for guests),
 * - count this device's comments (req.deviceId) created in the last 60 seconds,
 *   using the { deviceId: 1, createdAt: -1 } index on Comment,
 * - answer 429 { success: false, error: "You can post up to 3 comments per minute..." }
 *   if there are already 3.
 *
 * Used by: the POST /api/articles/:id/comments route, before the controller.
 * Related: models/Comment.js, middleware/assignDeviceId.js.
 * Owner: OS.
 */

/**
 * Checks the guest comment limit. Stub: always lets the request through.
 *
 * @param {import('express').Request} request - Will use request.deviceId and request.session.user.
 * @param {import('express').Response} response - Not used yet.
 * @param {import('express').NextFunction} next - Continues to the comment controller.
 * @returns {void}
 */
function limitGuestComments(request, response, next) {
  next();
}

module.exports = limitGuestComments;
