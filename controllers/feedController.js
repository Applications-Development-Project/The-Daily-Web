/**
 * controllers/feedController.js
 *
 * The home page news feed:
 * - GET /                     the feed page, with the first 20 articles rendered on the server
 * - GET /api/articles         the next pages, for infinite scroll, search, filters and sorting
 * - DELETE /api/articles/viewed  forget which articles this device has opened
 *
 * Requirements this serves (in our own words): the home page is open to everyone and shows
 * only approved, published articles; 20 more load automatically near the bottom; readers
 * can search, filter by category and by viewed / not viewed, and sort by publish date or
 * popularity, all without reloading the page; each card shows title, image, summary,
 * category, reporter and publish date, and links to the full article.
 *
 * Choices a lecturer may ask about:
 * - "Live" is published not null, never status === 'published'. status describes the
 *   reporter's working copy: a live article that is being edited again has status "draft"
 *   but must stay in the feed with its last approved text (the draft / published split in
 *   models/Article.js). The feed reads only the published copy.
 * - Only the card fields are loaded (.select) as plain objects (.lean): never the body,
 *   which can be 50,000 characters, so a page of 20 cards stays small with any number of
 *   articles.
 * - Each sort matches an index in models/Article.js exactly, so MongoDB reads the articles
 *   already in order instead of sorting thousands of them: newest uses
 *   { lastPublishedAt: -1, _id: -1 }, popular uses { totalViews: -1, _id: -1 }. _id is the
 *   tie-breaker: articles with the same date or view count still have one fixed order, so
 *   page 2 never repeats or skips an article of page 1.
 * - Popularity is Article.totalViews, a running total kept by services/viewTracker.js, so
 *   sorting never has to add up the hourly statistics.
 * - Paging: page N skips the first (N-1) x 20. We fetch 21 to know whether there is more
 *   (hasMore) without a second "count" query.
 * - Every query value is checked first (utils/requestValidation.js): it must be a single
 *   text value from a fixed list, otherwise 400. Repeating a parameter (?sort=a&sort=b)
 *   gives an array, which used to crash the search with a 500.
 * - Search text is escaped before it becomes a RegExp (escapeRegExp), so "C++" or "((("
 *   are searched as plain characters and can't break or slow down the query.
 *
 * Known limits (accepted, worth knowing for the defense):
 * - A "contains" search ('i' RegExp anywhere in the text) can't use an index, so MongoDB
 *   checks the live articles one by one. That is fast for the thousands of articles the
 *   requirements mention. A MongoDB text index would be faster, but it matches whole
 *   words only ("market" would not find "supermarket").
 * - Page numbers (skip) are simple, but if an article is published, or its view count
 *   changes, while a reader scrolls, the order shifts by one. The browser drops a card it
 *   already shows (public/js/public/feed.js), so nothing appears twice. A cursor ("the
 *   20 after this article") would avoid the shift, at the cost of a more complex API.
 * - "Viewed" means viewed from this browser (the deviceId cookie), because readers don't
 *   log in. Clearing cookies starts the marks again from nothing.
 *
 * No try/catch: we use Express 5, where an error thrown in an async controller (for example
 * a 400 from the checks below, or a database failure) goes to errorHandler by itself.
 *
 * Used by: routes/pageRoutes/feedPageRoutes.js, routes/apiRoutes/feedApiRoutes.js.
 * Related: views/public/feed.ejs, public/js/public/feed.js, models/Article.js,
 * models/DeviceArticleView.js, services/viewTracker.js (totalViews and the viewed marks).
 * Owner: SH.
 */

const Article = require('../models/Article');
const DeviceArticleView = require('../models/DeviceArticleView');
const { createHttpError } = require('../utils/httpErrors');
const { escapeRegExp, readSearchText, readPageNumber } = require('../utils/requestValidation');

// The requirements: "20 more articles load automatically". The first page has 20 too.
const ARTICLES_PER_PAGE = 20;

// The search looks in the title (at most 200 characters) and the summary (at most 500),
// so a longer search can never match.
const MAX_SEARCH_LENGTH = 500;

// The two sort orders, each exactly matching an index in models/Article.js (see the header).
const SORT_ORDERS = {
  newest: { lastPublishedAt: -1, _id: -1 },
  popular: { totalViews: -1, _id: -1 },
};
const DEFAULT_SORT = 'newest';

const VIEWED_FILTERS = ['viewed', 'unviewed'];

// Only what a card shows. published.body is deliberately missing (see the header).
const CARD_FIELDS = 'published.title published.summary published.imageUrl published.category lastPublishedAt totalViews reporter';

/**
 * Reads an optional query value that must be one of a fixed list.
 *
 * @param {*} value - For example request.query.sort.
 * @param {string[]} allowedValues - The values the API accepts.
 * @param {string} name - The parameter's name, for the error message.
 * @returns {string} The value, or '' when it wasn't sent (or was sent empty, as the
 *   page's "All categories" option does).
 * @throws {Error} 400 if it isn't a single text value from the list.
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
 * Checks the whole query string of GET /api/articles.
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
 * @param {string} deviceId - request.deviceId, from the httpOnly deviceId cookie (never
 *   from the URL or the body, so a page can't read another device's marks).
 * @returns {Promise<Object>} The filter for Article.find().
 */
async function buildFeedFilter(feedQuery, deviceId) {
  // Only live articles: those an editor has approved at least once.
  const filter = { published: { $ne: null } };

  if (feedQuery.category !== '') {
    filter['published.category'] = feedQuery.category;
  }

  if (feedQuery.search !== '') {
    // 'i' = ignore capital letters. Title or summary, as readers expect from a search box.
    const searchPattern = new RegExp(escapeRegExp(feedQuery.search), 'i');
    filter.$or = [{ 'published.title': searchPattern }, { 'published.summary': searchPattern }];
  }

  if (feedQuery.viewed !== '') {
    // The articles this device has opened, recorded by services/viewTracker.js. The query is
    // answered from the unique { deviceId, article } index, and the list is as long as the
    // number of articles this one browser has read, not the size of the site.
    const viewedRecords = await DeviceArticleView.find({ deviceId: deviceId }).select('article').lean();
    const viewedArticleIds = viewedRecords.map((record) => record.article);
    filter._id = feedQuery.viewed === 'viewed' ? { $in: viewedArticleIds } : { $nin: viewedArticleIds };
  }

  return filter;
}

/**
 * Turns an article from the database into one feed card, with exactly the fields of the
 * "Feed card fields" contract: { id, title, summary, imageUrl, category, reporterName,
 * publishedAt, totalViews }. The same shape feeds the server-rendered page and the API,
 * so a card looks the same however it was loaded.
 *
 * @param {Object} article - A lean article with reporter populated (displayName only).
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
    // reporter is null only if the user was deleted; user management prevents deleting a
    // reporter who has articles, but the feed must not break if it ever happens.
    reporterName: article.reporter ? article.reporter.displayName : 'Unknown reporter',
    // "Publish date" is when the version readers see was approved.
    publishedAt: article.lastPublishedAt,
    totalViews: article.totalViews || 0,
  };
}

/**
 * Loads one page of feed cards.
 *
 * @param {{search: string, category: string, viewed: string, sort: string, page: number}} feedQuery
 * @param {string} deviceId - request.deviceId.
 * @returns {Promise<{articles: Object[], hasMore: boolean}>} Up to 20 cards, and whether
 *   there is at least one more page.
 */
async function findFeedPage(feedQuery, deviceId) {
  const filter = await buildFeedFilter(feedQuery, deviceId);

  const articles = await Article.find(filter)
    .sort(SORT_ORDERS[feedQuery.sort])
    .skip((feedQuery.page - 1) * ARTICLES_PER_PAGE)
    // One more than a page: if it comes back, there is more to load.
    .limit(ARTICLES_PER_PAGE + 1)
    .select(CARD_FIELDS)
    // populate replaces the reporter's id with { displayName }, in one extra query for the
    // whole page (not one per card).
    .populate('reporter', 'displayName')
    .lean();

  return {
    articles: articles.slice(0, ARTICLES_PER_PAGE).map(toFeedCard),
    hasMore: articles.length > ARTICLES_PER_PAGE,
  };
}

/**
 * GET / - the feed page, with the newest 20 articles already in the HTML.
 *
 * Why render the first page on the server: the reader sees articles as soon as the page
 * arrives, without waiting for a second request, and the links to the articles are in the
 * HTML that search engines read. The page's script (public/js/public/feed.js) then loads
 * pages 2, 3... and any search or filter through GET /api/articles.
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
    title: 'The Web Daily - Latest News',
    articles: firstPage.articles,
    hasMore: firstPage.hasMore,
    // The category list comes from the model, so the filter offers exactly the
    // categories the API accepts.
    categories: Article.CATEGORIES,
  });
}

/**
 * GET /api/articles?search=&category=&viewed=&sort=&page= - one page of 20 live articles.
 * Open to everyone.
 *
 * Answers 200 { success: true, data: { articles: [cards], hasMore } }, or 400 with a
 * message for an invalid parameter (unknown sort, category or viewed value, page below 1,
 * a repeated parameter, a search that is too long).
 *
 * @param {import('express').Request} request - The query string holds the options.
 * @param {import('express').Response} response - The JSON answer.
 * @returns {Promise<void>}
 * @throws {Error} 400 from readFeedQuery (errorHandler sends it as JSON).
 */
async function listFeedArticles(request, response) {
  const feedQuery = readFeedQuery(request.query);
  const feedPage = await findFeedPage(feedQuery, request.deviceId);
  response.json({ success: true, data: feedPage });
}

/**
 * DELETE /api/articles/viewed - forgets every article this device has opened, so the
 * "not viewed" filter shows them all again ("Reset viewed marks" in the feed). This is the
 * Delete of the full CRUD on DeviceArticleView. Open to everyone; it only ever touches the
 * marks of the device in the cookie, never another device's.
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
