/**
 * models/ArticleViewStats.js
 *
 * Mongoose model for view statistics: how many times an article was viewed in
 * one hour. Fields follow "Data models" in "Shared contracts".
 *
 * Why one counter per article per hour, and not one document per view:
 * the requirements say the site may serve thousands of readers at the same time.
 * One document per view would mean millions of documents, and drawing a 30-day
 * chart would have to read and count all of them. With hourly counters an article
 * has at most 24 documents a day (720 for 30 days), however many readers it has,
 * and the chart reads them as they are. Each view is a single atomic
 * { $inc: { views: 1 } } with upsert in services/viewTracker.js, so views that
 * arrive at the same moment are all counted and never overwrite each other.
 * The price is detail: we can't tell at which minute inside an hour a view
 * happened, which is fine for a chart over days.
 *
 * Used by: services/viewTracker.js (recordView adds views),
 * controllers/analyticsController.js (chart data and reset), scripts/seed.js,
 * controllers/editorController.js (removes the stats when an article is deleted).
 * Related: models/Article.js (article, and its running totalViews).
 * Owner: SM.
 */

const mongoose = require('mongoose');

const articleViewStatsSchema = new mongoose.Schema({
  // The article these views belong to.
  article: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Article',
    required: [true, 'Article is required'],
  },

  // The start of the hour this counter covers, for example 14:00:00.000 for every
  // view between 14:00 and 14:59. Rounding every view down to the start of its
  // hour is what makes all views of the same hour land in the same document.
  hourStart: {
    type: Date,
    required: [true, 'Hour start is required'],
  },

  // How many views the article had in that hour.
  views: {
    type: Number,
    default: 0,
    min: [0, 'Views cannot be negative'],
  },
});
// No timestamps option: hourStart already says which time the document is about,
// and createdAt/updatedAt would add two dates to every one of many small documents.

// unique: MongoDB refuses a second document for the same article and hour, so two
// simultaneous first views of a new hour can never create two counters.
// The same index answers the chart query: "this article, hours between from and to,
// sorted by time", without scanning other articles' stats.
articleViewStatsSchema.index({ article: 1, hourStart: 1 }, { unique: true });

module.exports = mongoose.model('ArticleViewStats', articleViewStatsSchema);
