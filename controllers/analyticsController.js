/**
 * controllers/analyticsController.js
 *
 * Impact Analytics for the editor: the analytics page, the hourly views of one article
 * with the moments it was published (the data behind the chart), and resetting an
 * article's statistics.
 *
 * The routes are protected with requireRole('editor'), so request.session.user is
 * always a logged-in editor here. The statistics themselves are read and written in
 * services/viewTracker.js; this file only checks the request and sends the answer
 * (the conventions: controllers handle request and response, logic lives in services).
 *
 * Requirements this serves: the editor picks an article and sees a chart of its views
 * over time, with a clear mark at each moment an update was published, to compare
 * views before and after. The site may have thousands of readers at once, and we had
 * to decide how to collect and store the data: one counter per article per hour
 * (models/ArticleViewStats.js), so the chart reads at most 24 small documents per
 * day per article, however many readers there are.
 *
 * Built step by step from OS's phase 0 placeholders. Only showAnalyticsPage is still
 * a PLACEHOLDER answering 501. The function names must stay the same (the routes
 * call them).
 *
 * Used by: routes/pageRoutes/analyticsPageRoutes.js, routes/apiRoutes/analyticsApiRoutes.js.
 * Related: services/viewTracker.js, models/ArticleViewStats.js, models/Article.js.
 * Owner: SM.
 */

const mongoose = require('mongoose');
const Article = require('../models/Article');
const ArticleViewStats = require('../models/ArticleViewStats');
const { getViewsOverTime, DEFAULT_RANGE_DAYS, MAX_RANGE_DAYS } = require('../services/viewTracker');
const logger = require('../services/logger');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Sends an error answer in the shape every API uses: { success: false, error }.
 *
 * @param {import('express').Response} response - The response to send.
 * @param {number} statusCode - 400, 404...
 * @param {string} message - A message the editor can read.
 * @returns {void}
 */
function sendError(response, statusCode, message) {
  response.status(statusCode).json({ success: false, error: message });
}

/**
 * Reads one optional date from the query string, for example
 * ?from=2026-10-01T00:00:00.000Z. Anything JavaScript's Date understands is accepted;
 * the analytics page sends full ISO dates. A date without a time ("2026-10-01") is
 * read by JavaScript as midnight UTC, which is why the page sends full timestamps.
 *
 * @param {*} value - request.query.from or request.query.to.
 * @param {string} name - 'from' or 'to', for the error message.
 * @returns {{date: (Date|null)}|{error: string}} date is null when the value wasn't sent.
 */
function readDateQuery(value, name) {
  if (value === undefined || value === '') {
    return { date: null };
  }
  // ?from=a&from=b arrives as an array: refuse it instead of guessing.
  if (typeof value !== 'string') {
    return { error: `"${name}" can be given only once` };
  }
  const date = new Date(value);
  // An unreadable text gives an "Invalid Date", whose time is NaN (not a number).
  if (Number.isNaN(date.getTime())) {
    return { error: `"${name}" is not a valid date` };
  }
  return { date: date };
}

/**
 * Works out the date range for the chart from ?from=&to=, with defaults:
 * no "to" means now, no "from" means DEFAULT_RANGE_DAYS before "to".
 * A "to" in the future is moved back to now, because no views can exist there yet.
 *
 * Why there is a maximum range: getViewsOverTime returns one point for EVERY hour in
 * the range, so the answer's size depends on the range the browser sends. Without a
 * limit, a request like "since 1970" would make the server build half a million
 * points (invalid input must not hurt the server). 366 days is 8,784 points.
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
  // Every hour in the range becomes one point on the chart, so the range is limited.
  // One extra hour of grace: the page computes "from" a moment before the server
  // computes "to" (now), so "exactly the last 366 days" arrives a few milliseconds
  // longer than 366 days and would otherwise be refused.
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS + HOUR_MS) {
    return { error: `The range can be at most ${MAX_RANGE_DAYS} days` };
  }
  return { from: from, to: to };
}

/**
 * GET /editor/analytics - the Impact Analytics page. PLACEHOLDER.
 *
 * Planned (work plan, SM phase 2): pick an article by title, choose a date range, and
 * draw a Chart.js line of views per hour from GET /api/editor/articles/:id/views.
 * The x-axis will be a "linear" axis of millisecond timestamps with labels formatted in
 * a callback, because Chart.js's "time" axis needs an extra date-adapter package we
 * don't use. Each publish event will be a dashed vertical line drawn by our own small
 * Chart.js plugin (afterDraw), so the editor sees the views before and after each update.
 * Waiting for the team's decision on how Chart.js is loaded (a CDN link or a file in
 * the repo).
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function showAnalyticsPage(request, response) {
  response.status(501).render('public/error', { statusCode: 501, message: 'Impact Analytics is not built yet.' });
}

/**
 * GET /api/editor/articles/:id/views?from=&to= - the data for the Impact Analytics
 * chart: the article's views for every hour in the range, and the moments the editor
 * published it (the chart's markers). Without from/to it covers the last 30 days.
 *
 * Answers 200 { success: true, data: { buckets: [{ hourStart, views }],
 * publishEvents: [{ publishedAt }] } }, both oldest first (the response shape in the
 * routes table of "Shared contracts"); 400 for a malformed id or an invalid range;
 * 404 if the article doesn't exist (for example it was deleted). These are the
 * edge cases the work plan lists for the chart.
 * Database errors go to errorHandler (Express 5 passes them on from async functions).
 *
 * An article with no views still gets every hour, with views: 0, so the page can
 * show "no views in this period" and still draw the publish markers.
 *
 * @param {import('express').Request} request - params.id, query.from, query.to.
 * @param {import('express').Response} response - The JSON answer.
 * @returns {Promise<void>}
 */
async function getArticleViews(request, response) {
  if (!mongoose.isValidObjectId(request.params.id)) {
    sendError(response, 400, 'Invalid article id');
    return;
  }

  const range = readDateRange(request.query);
  if (range.error) {
    sendError(response, 400, range.error);
    return;
  }

  // getViewsOverTime returns null when no article has this id.
  const viewsOverTime = await getViewsOverTime(request.params.id, range.from, range.to);
  if (!viewsOverTime) {
    sendError(response, 404, 'Article not found');
    return;
  }

  response.json({ success: true, data: viewsOverTime });
}

/**
 * DELETE /api/editor/articles/:id/views - resets an article's view statistics:
 * deletes all its hourly counters and sets its totalViews back to 0, so the chart
 * starts again from nothing. The page asks the editor to confirm first.
 *
 * The devices' "viewed" marks (DeviceArticleView) are not touched: they are not
 * statistics but each reader's own viewed / not-viewed filter in the feed. The
 * publish history is not touched either, so the chart keeps its update markers.
 * This is the Delete of full CRUD on the statistics model (requirements).
 *
 * Known limit: the two steps (total, then counters) are separate writes, because our
 * single MongoDB server has no transactions. A view arriving between them could leave
 * totalViews and the counters one apart, which is harmless for a reset button.
 *
 * Answers 200 { success: true, data: { id, deletedViewStats } }, 400 for a malformed
 * id, 404 if the article doesn't exist.
 *
 * @param {import('express').Request} request - params.id; session.user is the editor.
 * @param {import('express').Response} response - The JSON answer.
 * @returns {Promise<void>}
 */
async function resetArticleViews(request, response) {
  if (!mongoose.isValidObjectId(request.params.id)) {
    sendError(response, 400, 'Invalid article id');
    return;
  }

  // Setting totalViews to 0 also tells us whether the article exists:
  // matchedCount is 0 when no article has this id.
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
