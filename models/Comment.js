/**
 * models/Comment.js
 *
 * Readers' comments. Guests have no accounts, so a comment stores the typed name and the
 * browser's deviceId, which the 3-per-minute limit counts.
 *
 * Used by: controllers/commentController.js, middleware/commentRateLimiter.js,
 * controllers/articlePageController.js, controllers/editorController.js (delete), scripts/seed.js.
 * Owner: OS.
 */

const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    article: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Article',
      required: [true, 'Article is required'],
    },

    // trim: a name of only spaces becomes "" and fails "required". The controller checks
    // the same limits first, with a friendlier message.
    authorName: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [50, 'Name can be at most 50 characters'],
    },

    // Stored as typed and always shown as text (textContent, <%= %>): escaping when showing
    // always works, while removing "dangerous" HTML when saving is easy to get wrong and
    // would change honest text like "a < b".
    text: {
      type: String,
      required: [true, 'Comment text is required'],
      trim: true,
      maxlength: [1000, 'Comment can be at most 1,000 characters'],
    },

    // Set by the server from the deviceId cookie, never from the body: otherwise a guest
    // could send a new id with each comment and escape the limit.
    deviceId: {
      type: String,
      required: [true, 'Device id is required'],
    },
  },
  {
    // createdAt: what the limit counts and the list sorts by.
    timestamps: true,
  }
);

// An article's comments, newest first.
commentSchema.index({ article: 1, createdAt: -1 });
// One device's recent comments: the limiter counts them from the index alone.
commentSchema.index({ deviceId: 1, createdAt: -1 });

const Comment = mongoose.model('Comment', commentSchema);

// How many newest comments the article page and the comments API show (written once).
Comment.MAX_SHOWN_PER_ARTICLE = 100;

module.exports = Comment;
