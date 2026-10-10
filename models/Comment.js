/**
 * models/Comment.js
 *
 * Mongoose model for readers' comments on articles. Fields follow "Data models"
 * in "Shared contracts": article, authorName, text, deviceId, plus createdAt/updatedAt.
 *
 * Guests don't have accounts, so a comment stores the name the reader typed
 * (authorName) and the id of the browser it came from (deviceId). deviceId is what
 * lets the server enforce "a guest may post at most 3 comments per minute from the
 * same device" (middleware/commentRateLimiter.js).
 *
 * Used by: controllers/commentController.js (article comments and moderation),
 * middleware/commentRateLimiter.js, controllers/articlePageController.js (SH, first
 * comments rendered on the server), editor delete (SM, removes an article's comments),
 * scripts/seed.js.
 * Related: models/Article.js (each comment belongs to one article).
 * Owner: OS.
 */

const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    // The article this comment belongs to.
    article: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Article',
      required: [true, 'Article is required'],
    },

    // The name the reader typed. trim removes spaces around it, so a name made only
    // of spaces becomes "" and fails "required" instead of being saved as blank.
    authorName: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [50, 'Name can be at most 50 characters'],
    },

    // The comment itself. Stored exactly as typed (no HTML is removed here); it is
    // always shown with textContent or EJS <%= %>, which display it as plain text,
    // so a comment containing <script> can never run in a reader's browser.
    text: {
      type: String,
      required: [true, 'Comment text is required'],
      trim: true,
      maxlength: [1000, 'Comment can be at most 1,000 characters'],
    },

    // The id from the browser's deviceId cookie (req.deviceId, set by
    // middleware/assignDeviceId.js). Always set by the server, never read from the
    // request body, so a guest can't pretend to be a different device.
    deviceId: {
      type: String,
      required: [true, 'Device id is required'],
    },
  },
  {
    // createdAt is what the rate limiter counts ("comments in the last 60 seconds")
    // and what the comment list sorts by (newest first).
    timestamps: true,
  }
);

// Indexes, exactly as listed in "Shared contracts".
// An article's comments, newest first: the article page and GET /api/articles/:id/comments.
commentSchema.index({ article: 1, createdAt: -1 });
// One device's recent comments: the rate limiter counts these on every guest comment.
// Because both fields are in the index, MongoDB counts them without reading the
// comments themselves, so the check stays fast with any number of comments.
commentSchema.index({ deviceId: 1, createdAt: -1 });

module.exports = mongoose.model('Comment', commentSchema);
