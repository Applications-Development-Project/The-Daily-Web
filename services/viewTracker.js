/**
 * services/viewTracker.js
 *
 * Counts article views (recordView, called by the article page on every visit) and
 * reads them back for the Impact Analytics chart (getViewsOverTime).
 *
 * A view updates three things, each with one indexed write:
 * - ArticleViewStats: the counter of the current hour (for the chart);
 * - Article.totalViews: a running total (for the feed's "most popular" sort);
 * - DeviceArticleView: "this device has seen it" (for the feed's viewed filter).
 *
 * Used by: controllers/articlePageController.js, controllers/analyticsController.js,
 * scripts/seed.js (getHourStart).
 * Owner: SM.
 */

const Article = require('../models/Article');
const ArticleViewStats = require('../models/ArticleViewStats');
const DeviceArticleView = require('../models/DeviceArticleView');
const logger = require('./logger');

/**
 * Rounds a moment down to the start of its hour (14:37:12 becomes 14:00:00.000), so all
 * views of the same hour land in the same counter. UTC, so the server's time zone
 * doesn't matter.
 *
 * @param {Date} date - Any moment.
 * @returns {Date} A new Date at the start of that hour.
 */
function getHourStart(date) {
  const hourStart = new Date(date.getTime());
  hourStart.setUTCMinutes(0, 0, 0);
  return hourStart;
}

/**
 * Records one view of an article by one device. Every visit counts, including a refresh.
 *
 * It never throws: showing the article matters more than counting it, so a failure is
 * logged instead of breaking the reader's page.
 *
 * Known limit: the three writes are not one transaction (our single MongoDB server has
 * none), so a failure in between could leave totalViews one higher than the counters.
 *
 * @param {string|import('mongoose').Types.ObjectId} articleId - The article that was opened.
 * @param {string} deviceId - The visitor's device id (req.deviceId).
 * @returns {Promise<void>}
 */
async function recordView(articleId, deviceId) {
  try {
    // Only a live article counts (published not null). This one update is both the
    // existence check and the count.
    const articleUpdate = await Article.updateOne(
      { _id: articleId, published: { $ne: null } },
      { $inc: { totalViews: 1 } }
    );
    if (articleUpdate.matchedCount === 0) {
      logger.info(`View not counted: article ${articleId} is missing or not published`);
      return;
    }

    // upsert: update this hour's counter, or create it on the hour's first view.
    // $inc runs inside MongoDB, so two views at the same moment are both counted
    // (reading 5 and writing back 6 would lose one).
    await ArticleViewStats.updateOne(
      { article: articleId, hourStart: getHourStart(new Date()) },
      { $inc: { views: 1 } },
      { upsert: true }
    );

    // updateOne doesn't run the schema's "required" rule, so we check the id ourselves.
    if (typeof deviceId === 'string' && deviceId !== '') {
      // $setOnInsert writes only for a new pair; a repeat visit just refreshes updatedAt.
      await DeviceArticleView.updateOne(
        { deviceId: deviceId, article: articleId },
        { $setOnInsert: { deviceId: deviceId, article: articleId } },
        { upsert: true }
      );
    }
  } catch (error) {
    logger.error(`Could not record a view of article ${articleId}`, error);
  }
}

const DEFAULT_RANGE_DAYS = 30;
// Every hour becomes one bucket, so the range is limited (a year is 8,784 buckets).
const MAX_RANGE_DAYS = 366;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Returns one bucket for every hour between from and to, with views: 0 where there is
 * no counter, so the chart drops to 0 instead of drawing a line across empty hours.
 *
 * @param {{hourStart: Date, views: number}[]} storedBuckets - Counters from the database.
 * @param {Date} from - Start of the range.
 * @param {Date} to - End of the range.
 * @returns {{hourStart: Date, views: number}[]} One bucket per hour, oldest first.
 */
function fillMissingHours(storedBuckets, from, to) {
  // A Map finds each hour directly instead of searching the list every time.
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
 * The data for the Impact Analytics chart: the article's hourly views and the moments
 * it was published, between two dates. Unlike recordView, errors are passed on, so the
 * API can answer with an error.
 *
 * @param {string|import('mongoose').Types.ObjectId} articleId - A valid article id.
 * @param {Date} [from] - Start of the range. Default: 30 days ago.
 * @param {Date} [to] - End of the range. Default: now.
 * @returns {Promise<{buckets: {hourStart: Date, views: number}[], publishEvents: {publishedAt: Date}[]}|null>}
 *   Both lists oldest first, or null if the article doesn't exist.
 * @throws {Error} If the database query fails.
 */
async function getViewsOverTime(articleId, from = new Date(Date.now() - DEFAULT_RANGE_DAYS * DAY_MS), to = new Date()) {
  // Only the publish history is needed, not the article's body.
  const article = await Article.findById(articleId).select('publishHistory').lean();
  if (!article) {
    return null;
  }

  // getHourStart(from) includes the hour "from" falls in.
  const storedBuckets = await ArticleViewStats.find({
    article: articleId,
    hourStart: { $gte: getHourStart(from), $lte: to },
  })
    .sort({ hourStart: 1 })
    .select({ hourStart: 1, views: 1, _id: 0 })
    .lean();

  // Each approval in the range is a marker on the chart (publishHistory is oldest first).
  const publishEvents = article.publishHistory
    .filter((publishEvent) => publishEvent.publishedAt >= from && publishEvent.publishedAt <= to)
    .map((publishEvent) => ({ publishedAt: publishEvent.publishedAt }));

  return {
    buckets: fillMissingHours(storedBuckets, from, to),
    publishEvents: publishEvents,
  };
}

module.exports = { recordView, getHourStart, getViewsOverTime, DEFAULT_RANGE_DAYS, MAX_RANGE_DAYS };
