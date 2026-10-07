/**
 * models/DeviceArticleView.js
 *
 * Mongoose model that remembers which device has already opened which article.
 * It powers the feed's "viewed / not viewed" filter. Fields follow "Data models"
 * in "Shared contracts".
 *
 * Guests don't log in, so "viewed" means viewed from this browser: every browser
 * gets a random deviceId cookie (middleware/assignDeviceId.js), and the first time
 * it opens an article we store one (deviceId, article) pair. Opening the same
 * article again doesn't add a second document; it only refreshes updatedAt.
 *
 * This is separate from ArticleViewStats on purpose: ArticleViewStats counts views
 * (how many), this one only answers yes or no for one device (has it seen it).
 *
 * Used by: services/viewTracker.js (recordView records the pair),
 * controllers/feedController.js (the viewed filter and "Reset viewed marks"),
 * controllers/editorController.js (removes the pairs when an article is deleted).
 * Related: models/Article.js, middleware/assignDeviceId.js (req.deviceId).
 * Owner: SM.
 */

const mongoose = require('mongoose');

const deviceArticleViewSchema = new mongoose.Schema(
  {
    // The browser's id from the deviceId cookie (req.deviceId).
    deviceId: {
      type: String,
      required: [true, 'Device id is required'],
    },

    // The article this device has opened.
    article: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Article',
      required: [true, 'Article is required'],
    },
  },
  {
    // createdAt: when this device first opened the article.
    // updatedAt: the last time it opened it (refreshed on every visit).
    timestamps: true,
  }
);

// unique: one document per device and article, however many times it is opened,
// so the collection grows with "devices x articles they read", not with every visit.
// deviceId comes first in the index because every query here starts from one device:
// "which articles has this device seen?" (feed filter) and "delete this device's
// marks" (reset) both use it without scanning other devices.
deviceArticleViewSchema.index({ deviceId: 1, article: 1 }, { unique: true });

module.exports = mongoose.model('DeviceArticleView', deviceArticleViewSchema);
