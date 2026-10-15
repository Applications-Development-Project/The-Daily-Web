/**
 * models/ArticleViewStats.js
 *
 * View statistics: how many times an article was viewed in one hour.
 *
 * One counter per article per hour, not one document per view: thousands of readers
 * would create millions of documents, while hourly counters give at most 720 per
 * article for a 30-day chart. Each view is an atomic $inc (services/viewTracker.js).
 *
 * Used by: services/viewTracker.js, controllers/analyticsController.js,
 * controllers/editorController.js (delete), scripts/seed.js.
 * Owner: SM.
 */

const mongoose = require('mongoose');

const articleViewStatsSchema = new mongoose.Schema({
  article: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Article',
    required: [true, 'Article is required'],
  },

  // The start of the hour (UTC), for example 14:00 for every view from 14:00 to 14:59.
  hourStart: {
    type: Date,
    required: [true, 'Hour start is required'],
  },

  // min is checked by create() and save(); $inc in updateOne skips validators, which is
  // safe because adding 1 can only make the number bigger.
  views: {
    type: Number,
    default: 0,
    min: [0, 'Views cannot be negative'],
  },
});
// No timestamps: hourStart already says which time the document is about.

// One counter per article and hour. If two first views of an hour race, MongoDB retries
// the losing upsert as an update, so no view is lost. The chart query uses it too.
articleViewStatsSchema.index({ article: 1, hourStart: 1 }, { unique: true });

module.exports = mongoose.model('ArticleViewStats', articleViewStatsSchema);
