/**
 * controllers/analyticsController.js
 *
 * Impact Analytics: the analytics page, the chart data of one article, and resetting
 * an article's statistics. The statistics are read and written in
 * services/viewTracker.js; this file checks the request and sends the answer.
 *
 * Used by: routes/pageRoutes/analyticsPageRoutes.js, routes/apiRoutes/analyticsApiRoutes.js.
 * Owner: SM.
 */

const Article = require('../models/Article');
const ArticleViewStats = require('../models/ArticleViewStats');
const { getViewsOverTime, DEFAULT_RANGE_DAYS, MAX_RANGE_DAYS } = require('../services/viewTracker');
const logger = require('../services/logger');
const { isValidObjectId } = require('../utils/requestValidation');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Sends an error answer in the shape every API uses: { success: false, error }.
 *
 * @param {import('express').Response} response
 * @param {number} statusCode - 400, 404...
 * @param {string} message - A message the editor can read.
 * @returns {void}
 */
function sendError(response, statusCode, message) {
  response.status(statusCode).json({ success: false, error: message });
}

/**
 * Reads one optional date from the query string (the page sends full ISO dates).
 *
 * @param {*} value - request.query.from or request.query.to.
 * @param {string} name - 'from' or 'to', for the error message.
 * @returns {{date: (Date|null)}|{error: string}} date is null when the value wasn't sent.
 */
function readDateQuery(value, name) {
  if (value === undefined || value === '') {
    return { date: null };
  }
  // ?from=a&from=b arrives as an array.
  if (typeof value !== 'string') {
    return { error: `"${name}" can be given only once` };
  }
  const date = new Date(value);
  // An unreadable text gives an "Invalid Date", whose time is NaN.
  if (Number.isNaN(date.getTime())) {
    return { error: `"${name}" is not a valid date` };
  }
  return { date: date };
}

/**
 * Works out the chart's range from ?from=&to=: no "to" means now, no "from" means
 * DEFAULT_RANGE_DAYS before "to", and a "to" in the future becomes now.
 * The range is limited because the answer has one point per hour: "since 1970" would
 * otherwise make the server build half a million points.
 *
 * @param {Object} query - request.query.
 * @returns {{from: Date, to: Date}|{error: string}} The range, or a message for a 400 answer.
 */
function readDateRange(query) {
  const fromResult = readDateQuery(query.from, 'from');
  if (fromResult.error) {
    return { error: fromResult.error };
  }
  const toResult = readDateQuery(query.to, 'to');
  if (toResult.error) {
    return { error: toResult.error };
  }

  const now = new Date();
  let to = toResult.date || now;
  if (to > now) {
    to = now;
  }
  const from = fromResult.date || new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);

  if (from >= to) {
    return { error: '"from" must be earlier than "to"' };
  }
  // One hour of grace: the page computes "from" a moment before the server computes
  // "now", so "the last 366 days" arrives a few milliseconds longer.
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS + HOUR_MS) {
    return { error: `The range can be at most ${MAX_RANGE_DAYS} days` };
  }
  return { from: from, to: to };
}

// The periods the page offers; the filter keeps them within the API's limit.
const RANGE_OPTIONS = [
  { days: 1, label: 'Last 24 hours' },
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
  { days: 365, label: 'Last 365 days' },
].filter((option) => option.days <= MAX_RANGE_DAYS);

/**
 * GET /editor/analytics?article= - the Impact Analytics page. The page is only the frame:
 * public/js/editor/analytics.js searches articles and loads the chart without reloading.
 * ?article=<id> (from the review page's link) opens that article at once; a bad or
 * unknown id shows a notice instead of an error page.
 *
 * @param {import('express').Request} request - query.article is optional.
 * @param {import('express').Response} response - Renders views/editor/analytics.ejs.
 * @returns {Promise<void>}
 */
async function showAnalyticsPage(request, response) {
  let initialArticle = null;
  let notice = '';

  const articleId = request.query.article;
  if (articleId !== undefined) {
    // isValidObjectId also checks the type: ?article=a&article=b arrives as an array, never a valid id.
    const article = isValidObjectId(articleId)
      ? await Article.findById(articleId).select({ 'draft.title': 1, 'published.title': 1 }).lean()
      : null;
    if (article) {
      // The live title if there is one; a never-published article only has its working title.
      const title = (article.published && article.published.title) || article.draft.title || '(untitled)';
      initialArticle = { id: article._id.toString(), title: title };
    } else {
      notice = 'That article was not found (it may have been deleted). Search for another one below.';
    }
  }

  response.render('editor/analytics', {
    title: 'Impact Analytics - Editor - The Daily Web',
    rangeOptions: RANGE_OPTIONS,
    defaultRangeDays: DEFAULT_RANGE_DAYS,
    initialArticle: initialArticle,
    notice: notice,
  });
}

/**
 * GET /api/editor/articles/:id/views?from=&to= - the chart data: views for every hour
 * in the range (0 where there were none) and the publish times. Default: the last 30 days.
 *
 * Answers 200 { success: true, data: { buckets: [{ hourStart, views }], publishEvents:
 * [{ publishedAt }] } }, 400 for a malformed id or range, 404 if the article doesn't exist.
 *
 * @param {import('express').Request} request - params.id, query.from, query.to.
 * @param {import('express').Response} response - The JSON answer.
 * @returns {Promise<void>}
 */
async function getArticleViews(request, response) {
  if (!isValidObjectId(request.params.id)) {
    sendError(response, 400, 'Invalid article id');
    return;
  }

  const range = readDateRange(request.query);
  if (range.error) {
    sendError(response, 400, range.error);
    return;
  }

  const viewsOverTime = await getViewsOverTime(request.params.id, range.from, range.to);
  if (!viewsOverTime) {
    sendError(response, 404, 'Article not found');
    return;
  }

  response.json({ success: true, data: viewsOverTime });
}

/**
 * DELETE /api/editor/articles/:id/views - resets an article's statistics: deletes its
 * hourly counters and sets totalViews to 0. The publish history stays (the chart keeps
 * its markers), and so do the devices' "viewed" marks, which are each reader's own filter.
 *
 * Known limit: two separate writes (no transactions), so a view arriving in between
 * could leave the total and the counters one apart.
 *
 * Answers 200 { success: true, data: { id, deletedViewStats } }, 400 for a malformed id,
 * 404 if the article doesn't exist.
 *
 * @param {import('express').Request} request - params.id; session.user is the editor.
 * @param {import('express').Response} response - The JSON answer.
 * @returns {Promise<void>}
 */
async function resetArticleViews(request, response) {
  if (!isValidObjectId(request.params.id)) {
    sendError(response, 400, 'Invalid article id');
    return;
  }

  // matchedCount 0 means no article has this id.
  const articleUpdate = await Article.updateOne({ _id: request.params.id }, { $set: { totalViews: 0 } });
  if (articleUpdate.matchedCount === 0) {
    sendError(response, 404, 'Article not found');
    return;
  }

  const deleteResult = await ArticleViewStats.deleteMany({ article: request.params.id });

  logger.info(
    `View statistics of article ${request.params.id} reset by editor "${request.session.user.displayName}" ` +
    `(${deleteResult.deletedCount} hourly counters deleted)`
  );
  response.json({
    success: true,
    data: { id: request.params.id, deletedViewStats: deleteResult.deletedCount },
  });
}

module.exports = { showAnalyticsPage, getArticleViews, resetArticleViews };
