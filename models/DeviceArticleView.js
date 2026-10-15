/**
 * models/DeviceArticleView.js
 *
 * Remembers which device (browser) has opened which article, for the feed's
 * "viewed / not viewed" filter. Guests don't log in, so the device is identified by
 * the httpOnly deviceId cookie (middleware/assignDeviceId.js).
 *
 * Separate from ArticleViewStats: that one counts views, this one only answers
 * "has this device seen it?". Known limit: clearing cookies gives a new device id.
 *
 * Used by: services/viewTracker.js, controllers/feedController.js,
 * controllers/editorController.js (delete).
 * Owner: SM.
 */

const mongoose = require('mongoose');

const deviceArticleViewSchema = new mongoose.Schema(
  {
    // required is checked by create() and save(), not by updateOne, so recordView
    // checks for an empty id itself.
    deviceId: {
      type: String,
      required: [true, 'Device id is required'],
    },

    article: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Article',
      required: [true, 'Article is required'],
    },
  },
  {
    // createdAt: the first visit; updatedAt: the latest one.
    timestamps: true,
  }
);

// One document per device and article, however many visits. deviceId comes first
// because every query starts from one device (the feed filter and its reset).
deviceArticleViewSchema.index({ deviceId: 1, article: 1 }, { unique: true });

module.exports = mongoose.model('DeviceArticleView', deviceArticleViewSchema);
