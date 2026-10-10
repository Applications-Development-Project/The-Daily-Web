/**
 * services/viewTracker.js
 *
 * Records that an article was viewed, for the Impact Analytics chart and the feed's
 * "viewed / not viewed" filter. The article page calls recordView() on every visit.
 *
 * How views are stored (requirements: thousands of readers at the same time):
 * - ArticleViewStats: one counter per article per hour. Every view in the same
 *   hour adds 1 to the same document, so the chart reads at most 24 small
 *   documents per article per day, however many readers there are.
 * - Article.totalViews: a running total, so "sort by popularity" in the feed
 *   doesn't have to add up the hourly counters on every request.
 * Both are increased with $inc, which MongoDB applies atomically inside the
 * database, so views that arrive at the same moment are all counted.
 * - DeviceArticleView: one (deviceId, article) pair per device and article,
 *   so the feed can show or hide articles this browser has already opened.
 *
 * Used by: controllers/articlePageController.js (SH).
 * Related: models/ArticleViewStats.js, models/DeviceArticleView.js, models/Article.js.
 * Owner: SM.
 */

const Article = require('../models/Article');
const ArticleViewStats = require('../models/ArticleViewStats');
const DeviceArticleView = require('../models/DeviceArticleView');
const logger = require('./logger');

/**
 * Rounds a moment down to the start of its hour, for example 14:37:12 becomes
 * 14:00:00.000. Every view in the same hour gets the same hourStart, which is how
 * they all land in the same ArticleViewStats counter.
 *
 * We round in UTC (setUTCMinutes) so the hours are the same whatever time zone
 * the server runs in; the browser shows them in the reader's local time.
 *
 * @param {Date} date - Any moment.
 * @returns {Date} A new Date at the start of that hour (the input is not changed).
 */
function getHourStart(date) {
  const hourStart = new Date(date.getTime());
  hourStart.setUTCMinutes(0, 0, 0);
  return hourStart;
}

/**
 * Records one view of an article by one device.
 *
 * It never throws and never rejects: counting a view is less important than showing
 * the article, so any failure (database down, invalid id) is logged here instead of
 * breaking the reader's page.
 *
 * @param {string|import('mongoose').Types.ObjectId} articleId - The article that was opened.
 * @param {string} deviceId - The visitor's device id (req.deviceId).
 * @returns {Promise<void>} Resolves when the view has been handled.
 */
async function recordView(articleId, deviceId) {
  try {
    // Increase the total first, and only on a live article (published not null).
    // If nothing matched, the article doesn't exist or isn't public, and we stop
    // here, so no hourly counter is ever created for an article readers can't see.
    const articleUpdate = await Article.updateOne(
      { _id: articleId, published: { $ne: null } },
      { $inc: { totalViews: 1 } }
    );
    if (articleUpdate.matchedCount === 0) {
      logger.info(`View not counted: article ${articleId} is missing or not published`);
      return;
    }

    // upsert: true means "update the counter for this hour, or create it with
    // views: 1 if this is the hour's first view". The unique index on
    // { article, hourStart } guarantees there is only ever one counter per hour.
    await ArticleViewStats.updateOne(
      { article: articleId, hourStart: getHourStart(new Date()) },
      { $inc: { views: 1 } },
      { upsert: true }
    );

    // Remember that this device has opened the article, for the feed's "viewed"
    // filter. We check the id ourselves because updates don't run the schema's
    // "required" rule: without this check an empty id could be stored.
    if (typeof deviceId === 'string' && deviceId !== '') {
      // $setOnInsert only writes these fields when the pair is new. On a repeat
      // visit nothing changes except updatedAt, which Mongoose sets automatically
      // because the model has timestamps; upsert never creates a second pair.
      await DeviceArticleView.updateOne(
        { deviceId: deviceId, article: articleId },
        { $setOnInsert: { deviceId: deviceId, article: articleId } },
        { upsert: true }
      );
    }
  } catch (error) {
    // For example a malformed articleId (CastError) or a lost database connection.
    logger.error(`Could not record a view of article ${articleId}`, error);
  }
}

module.exports = { recordView, getHourStart };
