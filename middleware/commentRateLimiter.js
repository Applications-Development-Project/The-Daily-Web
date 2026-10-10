/**
 * middleware/commentRateLimiter.js
 *
 * Enforces the requirement "a guest may post at most 3 comments per minute from the
 * same device; a further attempt is blocked by the server with a suitable message".
 * It runs before the comment controller, so a blocked comment is never saved.
 *
 * How it counts: it asks MongoDB how many comments this device (req.deviceId, from the
 * deviceId cookie) created in the last 60 seconds. If there are already 3, the request
 * gets 429 "Too Many Requests". Counting saved comments, instead of keeping a counter
 * in memory, means:
 * - the limit still holds after a server restart,
 * - no extra collection or storage is needed,
 * - the check is fast: the { deviceId: 1, createdAt: -1 } index on Comment answers the
 *   count without reading any comment documents.
 *
 * Who is limited: only guests. Logged-in reporters and editors skip the check, because
 * the requirement talks about guests.
 *
 * Known limits (acceptable for this project, worth knowing for the defense):
 * - Counting and then saving are two separate steps. Two comments sent at exactly the
 *   same moment could both be counted before either is saved, and both pass.
 *   A strict version would need one atomic database operation per device.
 * - A guest can get a new device id by clearing cookies. Recognising a device without a
 *   cookie (for example by IP address) has its own problems: everyone behind one
 *   office or school network shares an IP.
 *
 * Used by: routes/apiRoutes/commentApiRoutes.js, before commentController.addComment.
 * Related: models/Comment.js (the index), middleware/assignDeviceId.js (req.deviceId),
 * middleware/errorHandler.js (sends the 429 JSON).
 * Owner: OS.
 */

const Comment = require('../models/Comment');
const logger = require('../services/logger');

// The limit from the requirements: 3 comments per minute per device.
const MAX_COMMENTS_PER_WINDOW = 3;
const WINDOW_MS = 60 * 1000;

const LIMIT_REACHED_MESSAGE = 'You can post up to 3 comments per minute. Please wait a moment and try again.';

/**
 * Lets the comment through, or stops it with 429 if this guest's device already
 * posted 3 comments in the last minute.
 *
 * It is async because it waits for the database count. In Express 5, if the count
 * fails, the rejected promise goes to errorHandler by itself (500), so the server
 * doesn't crash.
 *
 * @param {import('express').Request} request - Uses request.session.user and request.deviceId.
 * @param {import('express').Response} response - Not used; errorHandler sends the 429.
 * @param {import('express').NextFunction} next - Continues to the controller, or passes the 429 on.
 * @returns {Promise<void>}
 */
async function limitGuestComments(request, response, next) {
  // Reporters and editors are not limited.
  if (request.session.user) {
    return next();
  }

  const windowStart = new Date(Date.now() - WINDOW_MS);
  const recentCommentCount = await Comment.countDocuments({
    deviceId: request.deviceId,
    createdAt: { $gte: windowStart },
  });

  if (recentCommentCount >= MAX_COMMENTS_PER_WINDOW) {
    logger.info(`Comment limit reached for device ${request.deviceId}`);
    const error = new Error(LIMIT_REACHED_MESSAGE);
    error.statusCode = 429;
    return next(error);
  }

  next();
}

module.exports = limitGuestComments;
