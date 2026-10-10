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
 * It also reads the statistics back for the chart: getViewsOverTime().
 *
 * Used by: controllers/articlePageController.js (SH, recordView),
 * controllers/analyticsController.js (SM, getViewsOverTime).
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

// How far back the analytics chart looks when no start date is given.
const DEFAULT_RANGE_DAYS = 30;
// The longest range the views API accepts (checked by its controller, which answers
// 400). Every hour in the range becomes one bucket, so a year is 8,784 buckets;
// without a limit, a range like "since 1970" would build half a million.
const MAX_RANGE_DAYS = 366;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Turns the stored counters into one bucket for EVERY hour between from and to,
 * with views: 0 for the hours that have no counter.
 *
 * Why: a counter exists only for hours in which someone read the article. If the
 * chart got only those, it would draw a straight line from, say, 55 views at 06:00
 * to 3 views at 10:00, as if there were views in between. With the empty hours
 * filled in, the line drops to 0, which is what really happened.
 *
 * Stepping by exactly one hour is safe because the hours are in UTC, which has no
 * daylight-saving jumps.
 *
 * @param {{hourStart: Date, views: number}[]} storedBuckets - Counters from the database.
 * @param {Date} from - Start of the range.
 * @param {Date} to - End of the range.
 * @returns {{hourStart: Date, views: number}[]} One bucket per hour, oldest first.
 */
function fillMissingHours(storedBuckets, from, to) {
  // A Map from "hour as a number" to views, so each hour below is found directly
  // instead of searching the whole list every time.
  const viewsByHour = new Map();
  for (const bucket of storedBuckets) {
    viewsByHour.set(bucket.hourStart.getTime(), bucket.views);
  }

  const buckets = [];
  for (let hour = getHourStart(from).getTime(); hour <= to.getTime(); hour += HOUR_MS) {
    buckets.push({
      hourStart: new Date(hour),
      views: viewsByHour.get(hour) || 0,
    });
  }
  return buckets;
}

/**
 * Returns the data for the Impact Analytics chart of one article: its hourly view
 * counts and the moments the editor published it, between two dates.
 *
 * It reads at most one small document per hour (720 for 30 days), whatever the
 * number of readers, and the query uses the { article, hourStart } index, so it
 * never looks at other articles' statistics.
 *
 * Unlike recordView, errors are NOT swallowed here: the caller (the views API)
 * must answer with an error, so it passes them on to errorHandler.
 *
 * @param {string|import('mongoose').Types.ObjectId} articleId - A valid article id
 *   (the caller checks the format first).
 * @param {Date} [from] - Start of the range. Default: 30 days before now.
 * @param {Date} [to] - End of the range. Default: now. The caller makes sure the
 *   range is at most MAX_RANGE_DAYS long.
 * @returns {Promise<{buckets: {hourStart: Date, views: number}[], publishEvents: {publishedAt: Date}[]}|null>}
 *   buckets: one per hour in the range, with views: 0 for hours without views.
 *   Both lists sorted from oldest to newest, or null if the article doesn't exist.
 * @throws {Error} If the database query fails.
 */
async function getViewsOverTime(articleId, from = new Date(Date.now() - DEFAULT_RANGE_DAYS * DAY_MS), to = new Date()) {
  // We only need the publish history from the article, so we load only that field.
  const article = await Article.findById(articleId).select('publishHistory').lean();
  if (!article) {
    return null;
  }

  // getHourStart(from) includes the hour "from" falls in: with from = 14:37, the
  // 14:00 counter also holds views from 14:37 to 14:59, so it belongs in the range.
  const storedBuckets = await ArticleViewStats.find({
    article: articleId,
    hourStart: { $gte: getHourStart(from), $lte: to },
  })
    .sort({ hourStart: 1 })
    .select({ hourStart: 1, views: 1, _id: 0 })
    .lean();

  // Every approval inside the range becomes a marker on the chart. publishHistory
  // is stored oldest first (each approval is pushed at the end), so it stays sorted.
  const publishEvents = article.publishHistory
    .filter((publishEvent) => publishEvent.publishedAt >= from && publishEvent.publishedAt <= to)
    .map((publishEvent) => ({ publishedAt: publishEvent.publishedAt }));

  return {
    buckets: fillMissingHours(storedBuckets, from, to),
    publishEvents: publishEvents,
  };
}

module.exports = { recordView, getHourStart, getViewsOverTime, MAX_RANGE_DAYS };
