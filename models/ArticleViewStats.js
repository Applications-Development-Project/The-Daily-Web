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
 * Full CRUD on this model (the requirements ask for it on the statistics model):
 * - Create and Update: recordView in services/viewTracker.js ($inc with upsert).
 * - Read, list and search by time range: getViewsOverTime (viewTracker.js) behind
 *   GET /api/editor/articles/:id/views?from=&to= and the analytics chart.
 * - Delete: "reset statistics" (DELETE /api/editor/articles/:id/views) and deleting
 *   the article itself (editorController.deleteArticle).
 *
 * Known limit: counters are never removed on their own, so an article keeps up to
 * 8,760 small documents a year. That is fine for this project; a long-running site
 * would add a TTL index (MongoDB deletes documents older than a set age) or roll old
 * hours up into daily counters.
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
  // The rounding is done in UTC by getHourStart() in viewTracker.js, so the hours
  // are the same whatever time zone the server runs in; the browser shows them in
  // the reader's local time.
  hourStart: {
    type: Date,
    required: [true, 'Hour start is required'],
  },

  // How many views the article had in that hour.
  // min: 0 is checked when a document is created with create() or save(). The
  // normal path, updateOne with $inc, skips schema validators by default; that is
  // safe here because $inc: 1 can only make the number bigger.
  views: {
    type: Number,
    default: 0,
    min: [0, 'Views cannot be negative'],
  },
});
// No timestamps option: hourStart already says which time the document is about,
// and createdAt/updatedAt would add two dates to every one of many small documents.

// unique: MongoDB refuses a second document for the same article and hour, so two
// simultaneous first views of a new hour can never create two counters. When two
// upserts race to create the same hour, MongoDB retries the losing one as a normal
// update, so its view is added instead of lost (tested with 200 views at once).
// The same index answers the chart query: "this article, hours between from and to,
// sorted by time", without scanning other articles' stats.
articleViewStatsSchema.index({ article: 1, hourStart: 1 }, { unique: true });

module.exports = mongoose.model('ArticleViewStats', articleViewStatsSchema);
