/**
 * controllers/feedController.js
 *
 * The home page feed: GET / (the page, with the first 20 articles rendered on the server),
 * GET /api/articles (the next pages, search, filters and sorting) and
 * DELETE /api/articles/viewed (forget this device's viewed marks).
 *
 * "Live" is published not null, never status: a live article being edited again has status
 * "draft" but stays in the feed with its approved text. Only the card fields are loaded,
 * never the body, and each sort matches an index, so it stays fast with thousands of articles.
 *
 * Known limits: a "contains" search can't use an index (a text index matches whole words
 * only); if the order shifts while a reader scrolls, the browser drops a card it already
 * shows; "viewed" means viewed from this browser (the deviceId cookie).
 *
 * Used by: routes/pageRoutes/feedPageRoutes.js, routes/apiRoutes/feedApiRoutes.js.
 * Owner: SH.
 */

const Article = require('../models/Article');
const DeviceArticleView = require('../models/DeviceArticleView');
const { createHttpError } = require('../utils/httpErrors');
const { escapeRegExp, readSearchText, readPageNumber } = require('../utils/requestValidation');

const ARTICLES_PER_PAGE = 20;

// The search looks in the title (max 200) and summary (max 500): longer can't match.
const MAX_SEARCH_LENGTH = 500;

// Each matches an index in models/Article.js; _id breaks ties, so paging never repeats or skips.
const SORT_ORDERS = {
  newest: { lastPublishedAt: -1, _id: -1 },
  popular: { totalViews: -1, _id: -1 },
};
const DEFAULT_SORT = 'newest';

const VIEWED_FILTERS = ['viewed', 'unviewed'];

// Only what a card shows: published.body (up to 50,000 characters) is left out.
const CARD_FIELDS = 'published.title published.summary published.imageUrl published.category lastPublishedAt totalViews reporter';

/**
 * Reads an optional query value that must be one of a fixed list.
 *
 * @param {*} value - For example request.query.sort.
 * @param {string[]} allowedValues - The values the API accepts.
 * @param {string} name - The parameter's name, for the error message.
 * @returns {string} The value, or '' when it wasn't sent (or was empty: "All categories").
 * @throws {Error} 400 if it isn't a single text value from the list (?sort=a&sort=b is an array).
 */
function readChoice(value, allowedValues, name) {
  if (value === undefined || value === '') {
    return '';
  }
  if (typeof value !== 'string' || !allowedValues.includes(value)) {
    throw createHttpError(400, `Unknown ${name}. Use one of: ${allowedValues.join(', ')}.`);
  }
  return value;
}

/**
 * Checks the query string of GET /api/articles.
 *
 * @param {Object} query - request.query: ?search=&category=&viewed=&sort=&page=
 * @returns {{search: string, category: string, viewed: string, sort: string, page: number}}
 *   Clean values; '' means "no filter".
 * @throws {Error} 400 for any invalid value.
 */
function readFeedQuery(query) {
  return {
    search: readSearchText(query.search, MAX_SEARCH_LENGTH),
    category: readChoice(query.category, Article.CATEGORIES, 'category'),
    viewed: readChoice(query.viewed, VIEWED_FILTERS, 'viewed filter'),
    sort: readChoice(query.sort, Object.keys(SORT_ORDERS), 'sort') || DEFAULT_SORT,
    page: readPageNumber(query.page),
  };
}

/**
 * Builds the MongoDB filter for one feed request.
 *
 * @param {{search: string, category: string, viewed: string}} feedQuery - From readFeedQuery.
 * @param {string} deviceId - request.deviceId, from the httpOnly cookie (never from the request).
 * @returns {Promise<Object>} The filter for Article.find().
 */
async function buildFeedFilter(feedQuery, deviceId) {
  // Only live articles.
  const filter = { published: { $ne: null } };

  if (feedQuery.category !== '') {
    filter['published.category'] = feedQuery.category;
  }

  if (feedQuery.search !== '') {
    // escapeRegExp: "C++" is searched as typed; 'i' ignores capitals.
    const searchPattern = new RegExp(escapeRegExp(feedQuery.search), 'i');
    filter.$or = [{ 'published.title': searchPattern }, { 'published.summary': searchPattern }];
  }

  if (feedQuery.viewed !== '') {
    // As long as the articles this browser has read, not the size of the site.
    const viewedRecords = await DeviceArticleView.find({ deviceId: deviceId }).select('article').lean();
    const viewedArticleIds = viewedRecords.map((record) => record.article);
    filter._id = feedQuery.viewed === 'viewed' ? { $in: viewedArticleIds } : { $nin: viewedArticleIds };
  }

  return filter;
}

/**
 * Turns an article into one feed card ("Feed card fields" contract), the same shape for the
 * server-rendered page and the API.
 *
 * @param {Object} article - A lean article with reporter populated.
 * @returns {{id: string, title: string, summary: string, imageUrl: string, category: string,
 *   reporterName: string, publishedAt: Date, totalViews: number}}
 */
function toFeedCard(article) {
  return {
    id: article._id.toString(),
    title: article.published.title,
    summary: article.published.summary,
    imageUrl: article.published.imageUrl,
    category: article.published.category,
    // Still works if the reporter was ever deleted.
    reporterName: article.reporter ? article.reporter.displayName : 'Unknown reporter',
    // When the version readers see was approved.
    publishedAt: article.lastPublishedAt,
    totalViews: article.totalViews || 0,
  };
}

/**
 * Loads one page of feed cards.
 *
 * @param {{search: string, category: string, viewed: string, sort: string, page: number}} feedQuery
 * @param {string} deviceId - request.deviceId.
 * @returns {Promise<{articles: Object[], hasMore: boolean}>}
 */
async function findFeedPage(feedQuery, deviceId) {
  const filter = await buildFeedFilter(feedQuery, deviceId);

  const articles = await Article.find(filter)
    .sort(SORT_ORDERS[feedQuery.sort])
    .skip((feedQuery.page - 1) * ARTICLES_PER_PAGE)
    // One more than a page tells us if there is more, without a second "count" query.
    .limit(ARTICLES_PER_PAGE + 1)
    .select(CARD_FIELDS)
    .populate('reporter', 'displayName')
    .lean();

  return {
    articles: articles.slice(0, ARTICLES_PER_PAGE).map(toFeedCard),
    hasMore: articles.length > ARTICLES_PER_PAGE,
  };
}

/**
 * GET / - the feed page with the newest 20 articles already in the HTML (seen at once,
 * and readable by search engines). public/js/public/feed.js loads the rest.
 *
 * @param {import('express').Request} request - request.deviceId identifies the browser.
 * @param {import('express').Response} response - Renders views/public/feed.ejs.
 * @returns {Promise<void>}
 */
async function showFeedPage(request, response) {
  const firstPage = await findFeedPage(
    { search: '', category: '', viewed: '', sort: DEFAULT_SORT, page: 1 },
    request.deviceId
  );

  response.render('public/feed', {
    title: 'The Daily Web - Latest News',
    articles: firstPage.articles,
    hasMore: firstPage.hasMore,
    // From the model, so the filter offers exactly what the API accepts.
    categories: Article.CATEGORIES,
  });
}

/**
 * GET /api/articles?search=&category=&viewed=&sort=&page= - one page of 20 live articles.
 *
 * Answers 200 { success: true, data: { articles, hasMore } }, or 400 for an invalid parameter.
 *
 * @param {import('express').Request} request - The query string holds the options.
 * @param {import('express').Response} response - The JSON answer.
 * @returns {Promise<void>}
 * @throws {Error} 400 from readFeedQuery.
 */
async function listFeedArticles(request, response) {
  const feedQuery = readFeedQuery(request.query);
  const feedPage = await findFeedPage(feedQuery, request.deviceId);
  response.json({ success: true, data: feedPage });
}

/**
 * DELETE /api/articles/viewed - forgets every article this device has opened ("Reset
 * viewed marks"). Only the device in the cookie, never another one.
 *
 * Answers 200 { success: true, data: { deletedCount } }.
 *
 * @param {import('express').Request} request - request.deviceId identifies the browser.
 * @param {import('express').Response} response - The JSON answer.
 * @returns {Promise<void>}
 */
async function resetViewedMarks(request, response) {
  const result = await DeviceArticleView.deleteMany({ deviceId: request.deviceId });
  response.json({ success: true, data: { deletedCount: result.deletedCount } });
}

module.exports = { showFeedPage, listFeedArticles, resetViewedMarks };
