/**
 * middleware/commentRateLimiter.js
 *
 * A guest may post at most 3 comments per minute from the same device; the next one gets
 * 429 "Too Many Requests" with a message. It counts the comments this device saved in the
 * last 60 seconds (instead of a counter in memory), so the limit survives a restart, needs
 * no extra storage, and is answered from the { deviceId, createdAt } index. createdAt is
 * set by Mongoose, so a guest can't fake it. Reporters and editors aren't limited.
 *
 * Known limits: counting and saving are two steps, so two comments at exactly the same
 * moment could both pass; clearing cookies gives a new device id (an IP address would be
 * shared by a whole office or school network).
 *
 * Used by: routes/apiRoutes/commentApiRoutes.js, before commentController.addComment.
 * Owner: OS.
 */

const Comment = require('../models/Comment');
const logger = require('../services/logger');

const MAX_COMMENTS_PER_WINDOW = 3;
const WINDOW_MS = 60 * 1000;

const LIMIT_REACHED_MESSAGE = 'You can post up to 3 comments per minute. Please wait a moment and try again.';

/**
 * Lets the comment through, or passes on a 429 if this guest's device already posted 3
 * comments in the last minute. If the count fails, Express 5 sends the error to
 * errorHandler by itself.
 *
 * @param {import('express').Request} request - Uses session.user and deviceId.
 * @param {import('express').Response} response - Not used; errorHandler sends the 429.
 * @param {import('express').NextFunction} next
 * @returns {Promise<void>}
 */
async function limitGuestComments(request, response, next) {
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
