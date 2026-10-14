/**
 * tests/testEditorApi.js
 *
 * A self-check for the editor's routes and the view counting, run against a REAL running
 * server. It sends many requests, a lot of them deliberately wrong, and checks that each one
 * gets the right clean answer (200, 302, 400, 401, 403, 404, 409) and that none of them ever
 * gets a 500. It also checks, directly in the database, what each request really changed.
 *
 * What it covers (SM's area):
 * - GET  /api/editor/articles             the dashboard list: status filter, title search, paging
 * - POST /api/editor/articles/:id/approve publish the working copy
 * - POST /api/editor/articles/:id/return  return with a required note
 * - PATCH /api/editor/articles/:id/draft  the editor's own edit of any article
 * - DELETE /api/editor/articles/:id       delete with its comments and statistics
 * - GET and DELETE /api/editor/articles/:id/views  the chart data and the reset
 * - GET /editor and GET /editor/articles/:id       the dashboard and review pages
 * - GET /editor/analytics?article=                  the Impact Analytics page (the server side;
 *                                                    its chart runs in the browser, see below)
 * - recordView() in services/viewTracker.js         called directly, it is not a route
 *
 * Requirements it checks (in our own words): permissions are checked on the server (guest,
 * reporter); only an editor publishes, and only a pending article; a returned article comes
 * with a note; readers keep the old version until an update is approved; deleting removes
 * everything related; invalid input never crashes the server; text written by users is shown
 * as text, never as HTML or script.
 *
 * How to run it (three steps, always with a TEST database, see "Safety" below):
 *   1. Seed the test database. In PowerShell:
 *        $env:MONGODB_URI='mongodb://127.0.0.1:27017/the-web-daily-test'; $env:PORT='3098'; npm run seed
 *      In Git Bash:
 *        MONGODB_URI=mongodb://127.0.0.1:27017/the-web-daily-test PORT=3098 npm run seed
 *   2. In a second terminal start the server with the SAME two values (npm start).
 *   3. In the first terminal (the two values are still set there) run:
 *        node tests/testEditorApi.js
 * The logins use the seeded users editor and reporter1, with the password SEED_DEMO_PASSWORD
 * from your .env (it is never written in this file).
 * It needs no test library (the work plan allows only plain console.assert). It prints one line
 * per failed check and a summary, and exits with a non-zero code if anything failed.
 *
 * Safety (why this script can't damage real data). It approves, returns and deletes articles,
 * so it follows the same three guards as EZ's tests/testReporterApi.js:
 *   1. It refuses to start unless the database name in MONGODB_URI ends with "-test".
 *   2. It writes a marker article and asks the server (a read-only request) whether it can see
 *      it. If not, the server uses a different database, and the script stops before writing more.
 *   3. It works ONLY on articles it created itself, and at the end deletes them together with
 *      their comments, view counters and device marks. The seeded articles are never touched.
 * Every created title starts with a tag that includes the start time (RUN_TAG), so the search
 * checks can count exactly our own articles even though the seed has 50 others.
 *
 * Why the small helpers (check, request, login) are written again here instead of imported
 * from testReporterApi.js: each script must run on its own, and a script is not a module the
 * team agreed to share. They are a few lines each.
 *
 * Not tested here on purpose:
 * - Two editors deciding at the same instant (a race): the result is not the same every time,
 *   so it can't be a reliable check. It is listed as a known limit in editorController.js.
 * - The Edit form on the review page runs in the browser; its API is fully checked here.
 *
 * Used by: run by hand (SM's acceptance checks for the editor area).
 * Related: controllers/editorController.js, controllers/analyticsController.js,
 * services/viewTracker.js, routes/apiRoutes/editorApiRoutes.js,
 * routes/apiRoutes/analyticsApiRoutes.js, routes/pageRoutes/editorPageRoutes.js, scripts/seed.js.
 * Owner: SM.
 */

require('dotenv').config({ quiet: true });

const mongoose = require('mongoose');
const { connectToDatabase, disconnectFromDatabase } = require('../config/database');
const User = require('../models/User');
const Article = require('../models/Article');
const Comment = require('../models/Comment');
const ArticleViewStats = require('../models/ArticleViewStats');
const DeviceArticleView = require('../models/DeviceArticleView');
const { STATUS } = require('../services/articleWorkflow');
const { recordView, getHourStart, MAX_RANGE_DAYS } = require('../services/viewTracker');

const SERVER_PORT = Number(process.env.PORT) || 3000;
const BASE_URL = `http://localhost:${SERVER_PORT}`;
const API = '/api/editor/articles';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Starts every title this script creates. Date.now() makes it different on every run, so an
// article left over from a crashed earlier run can't change this run's search counts.
const RUN_TAG = `EditorApiTest ${Date.now()}`;

// A complete, valid article content. Each fixture copies it and changes what it needs.
const GOOD_CONTENT = { title: `${RUN_TAG} article`, summary: 'A short summary', category: 'Economy', imageUrl: '', body: 'First paragraph.\n\nSecond paragraph.' };

// A title that is also an HTML tag with a script in it. If the review page printed it without
// escaping, the browser would run alert(1). It also has the regex characters "+" and "(".
const HOSTILE_TITLE = `${RUN_TAG} C++ (test) <img src=x onerror=alert(1)>`;

// An id that has the right shape (24 hex characters) but belongs to no article.
const MISSING_ID = '000000000000000000000000';

let checkCount = 0;
let failedCount = 0;

// Ids of every article this script created, so the end of the run can delete exactly those.
const createdArticleIds = [];

/**
 * Records one check. A failing check prints through console.assert and is counted, so the
 * summary at the end can report it (console.assert only prints; it doesn't count).
 *
 * @param {boolean} condition - true if the behaviour is correct.
 * @param {string} description - What was checked, shown when it fails.
 * @returns {void}
 */
function check(condition, description) {
  checkCount += 1;
  if (!condition) {
    failedCount += 1;
  }
  console.assert(condition, `FAILED: ${description}`);
}

/**
 * Checks one request's HTTP status. A 5xx is never in the expected list, so any server
 * crash fails the check: that is how "invalid input must not crash the server" is enforced.
 *
 * @param {string} description - What was sent, for example "guest approve".
 * @param {number} expected - The correct status.
 * @param {{status: number}} response - What request() returned.
 * @returns {void}
 */
function checkStatus(description, expected, response) {
  check(response.status === expected, `${description}: expected ${expected}, got ${response.status}`);
}

/**
 * Sends one request to the running server. Never throws for an HTTP error (a 4xx is a normal
 * answer here); it only throws if the server can't be reached at all.
 *
 * @param {string} cookie - The login cookie, or '' for a guest.
 * @param {string} method - 'GET', 'POST', 'DELETE', ...
 * @param {string} path - For example '/api/editor/articles'.
 * @param {Object|string} [body] - An object is sent as JSON; a string is sent exactly as
 *   written (so a test can send broken JSON on purpose); undefined sends no body at all.
 * @returns {Promise<{status: number, json: (Object|null), text: string, location: (string|null)}>}
 */
async function request(cookie, method, path, body) {
  const headers = { cookie: cookie };
  let payload;
  if (body !== undefined) {
    payload = typeof body === 'string' ? body : JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }

  // redirect: 'manual' so a redirect to /login is reported as a 302, not followed.
  const response = await fetch(BASE_URL + path, { method, headers, body: payload, redirect: 'manual' });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (parseError) {
    // Not JSON: the answer is an HTML page. That is normal for the page routes.
  }
  return { status: response.status, json, text, location: response.headers.get('location') };
}

/**
 * The "data" of a successful JSON answer, or an empty object, so a check on a wrong answer
 * fails cleanly instead of crashing the script with "cannot read properties of null".
 *
 * @param {{json: (Object|null)}} response - What request() returned.
 * @returns {Object}
 */
function dataOf(response) {
  return (response.json && response.json.data) || {};
}

/**
 * Logs in and returns the session cookie, the same cookie a browser keeps.
 *
 * @param {string} username - A seeded user: editor or reporter1.
 * @returns {Promise<string>} The cookie text to send with later requests.
 * @throws {Error} If the login fails (the database was probably not seeded).
 */
async function login(username) {
  const response = await fetch(BASE_URL + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: process.env.SEED_DEMO_PASSWORD }),
  });
  if (response.status !== 200) {
    stopWithMessage(`Could not log in as "${username}" (status ${response.status}). Run "npm run seed" on the test database and set SEED_DEMO_PASSWORD in .env.`);
  }
  return response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
}

/**
 * Stops the script with a clear message. It throws (instead of calling process.exit) so the
 * "finally" in main still runs and deletes what the script already created.
 *
 * @param {string} message - Why the script can't continue.
 * @returns {never}
 * @throws {Error} Always, with the name "StopError".
 */
function stopWithMessage(message) {
  const error = new Error(message);
  error.name = 'StopError';
  throw error;
}

/**
 * Safety guard 1: the database name in MONGODB_URI must end with "-test".
 * It reads the name from the address text, before any connection is made.
 *
 * @param {string|undefined} databaseUri - process.env.MONGODB_URI.
 * @returns {void}
 */
function requireTestDatabase(databaseUri) {
  if (!databaseUri) {
    stopWithMessage('MONGODB_URI is not set. Set it to a TEST database, for example mongodb://127.0.0.1:27017/the-web-daily-test');
  }
  // The database name is the last part of the path, before any "?options".
  const databaseName = databaseUri.split('?')[0].split('/').pop();
  if (!databaseName.endsWith('-test')) {
    stopWithMessage(`The database "${databaseName}" does not end with "-test", so this script refuses to run. It approves and deletes articles. Use a separate test database.`);
  }
}

/**
 * Creates an article directly in the database and remembers its id for the cleanup.
 * The editor routes never create articles, so every state has to be written by hand.
 *
 * @param {import('mongoose').Types.ObjectId} reporterId - The owner.
 * @param {string} status - One of STATUS.
 * @param {Object} [extra] - Fields that replace the defaults: draft, published, publishHistory, ...
 * @returns {Promise<string>} The new article's id as text.
 */
async function createArticleInDatabase(reporterId, status, extra) {
  const article = await Article.create({
    reporter: reporterId,
    status,
    draft: { ...GOOD_CONTENT, title: `${RUN_TAG} ${status}` },
    ...(extra || {}),
  });
  createdArticleIds.push(article._id);
  return article._id.toString();
}

/**
 * The fields of a live article: its published copy and a publish history of one approval,
 * as approveArticle would have saved them.
 *
 * @param {Object} content - The published content.
 * @param {import('mongoose').Types.ObjectId} editorId - The editor who "approved" it.
 * @param {Date} publishedAt - When.
 * @returns {Object} Fields for createArticleInDatabase's "extra".
 */
function liveFields(content, editorId, publishedAt) {
  return {
    published: content,
    firstPublishedAt: publishedAt,
    lastPublishedAt: publishedAt,
    publishHistory: [{ publishedAt, editor: editorId }],
  };
}

/**
 * Reads one article straight from the database, to check what a request really changed.
 *
 * @param {string} articleId - The article id.
 * @returns {Promise<Object|null>} The article as a plain object, or null if it is gone.
 */
async function readArticle(articleId) {
  return Article.findById(articleId).lean();
}

/**
 * Safety guard 2: proves that the server and this script use the same database. It writes a
 * live marker article into OUR database and asks the server for its comments, a public and
 * read-only request that answers 200 only if the server finds a live article with that id.
 *
 * @param {import('mongoose').Types.ObjectId} reporterId - Owner of the marker.
 * @param {import('mongoose').Types.ObjectId} editorId - "Approver" of the marker.
 * @returns {Promise<void>}
 */
async function requireSameDatabaseAsServer(reporterId, editorId) {
  // Both titles are "marker" (no RUN_TAG), so the search checks don't count it.
  const markerContent = { ...GOOD_CONTENT, title: 'marker' };
  const markerId = await createArticleInDatabase(reporterId, STATUS.PUBLISHED, { draft: markerContent, ...liveFields(markerContent, editorId, new Date()) });
  let response;
  try {
    response = await request('', 'GET', `/api/articles/${markerId}/comments`);
  } catch (networkError) {
    stopWithMessage(`Cannot reach the server at ${BASE_URL}. Start it with the same MONGODB_URI and PORT as this script (npm start).`);
  }
  if (response.status !== 200) {
    stopWithMessage(`The server at ${BASE_URL} cannot see the marker article, so it uses a different database than this script. Start the server with the same MONGODB_URI.`);
  }
}

/**
 * A guest must get 401 on every editor API and be sent to /login on every editor page; a
 * reporter is logged in but is not an editor, so they get 403 everywhere. Afterwards the
 * articles must be exactly as before: hiding buttons is not the protection, the server is.
 *
 * @param {Object} fixtures - The ids from setUp.
 * @param {Object} cookies - The login cookies from setUp.
 * @returns {Promise<void>}
 */
async function testOnlyEditorsGetIn(fixtures, cookies) {
  const id = fixtures.newPendingId;
  const apiCalls = [
    ['GET list', 'GET', API, undefined],
    ['PATCH draft', 'PATCH', `${API}/${id}/draft`, GOOD_CONTENT],
    ['POST approve', 'POST', `${API}/${id}/approve`, undefined],
    ['POST return', 'POST', `${API}/${id}/return`, { note: 'Fix it' }],
    ['DELETE article', 'DELETE', `${API}/${id}`, undefined],
    ['GET views', 'GET', `${API}/${id}/views`, undefined],
    ['DELETE views', 'DELETE', `${API}/${id}/views`, undefined],
  ];
  for (const [name, method, path, body] of apiCalls) {
    checkStatus(`guest ${name}`, 401, await request('', method, path, body));
    checkStatus(`reporter ${name}`, 403, await request(cookies.reporter, method, path, body));
  }
  // A role cookie a guest made up must not help: the role comes only from the server-side session.
  checkStatus('fake role cookie, approve', 401, await request('role=editor; userRole=editor', 'POST', `${API}/${id}/approve`));

  for (const path of ['/editor', `/editor/articles/${id}`, '/editor/analytics']) {
    const guestPage = await request('', 'GET', path);
    checkStatus(`guest page ${path}`, 302, guestPage);
    check(String(guestPage.location).startsWith('/login'), `guest page ${path} should redirect to /login, got ${guestPage.location}`);
    checkStatus(`reporter page ${path}`, 403, await request(cookies.reporter, 'GET', path));
  }

  const article = await readArticle(id);
  check(article !== null && article.status === STATUS.PENDING && article.published === null,
    'after the refused requests the pending article must be unchanged (still there, still pending, not live)');
}

/**
 * GET /api/editor/articles: the status filter, the title search (any capitals, both titles,
 * special characters taken literally), paging, and a 400 for every invalid parameter.
 *
 * @param {Object} fixtures - The ids from setUp.
 * @param {Object} cookies - The login cookies from setUp.
 * @returns {Promise<void>}
 */
async function testArticleList(fixtures, cookies) {
  const list = (query) => request(cookies.editor, 'GET', API + query);
  const search = (text, extraQuery) => list(`?search=${encodeURIComponent(text)}${extraQuery || ''}`);
  // Every fixture except the marker has RUN_TAG in its working title or its live title.
  const ourArticleCount = Object.keys(fixtures).length;

  const firstPage = await list('');
  checkStatus('editor list, no filters', 200, firstPage);
  const firstData = dataOf(firstPage);
  const rows = firstData.articles || [];
  check(rows.length === 20, `page 1 should have 20 rows, got ${rows.length}`);
  check(firstData.totalPages === Math.ceil(firstData.totalArticles / 20), 'totalPages should be totalArticles / 20, rounded up');
  check(rows.every((row, index) => index === 0 || row.updatedAt <= rows[index - 1].updatedAt), 'rows should be newest change first');
  const expectedKeys = ['id', 'isLive', 'reporterName', 'status', 'statusLabel', 'title', 'updatedAt'];
  check(rows.length > 0 && JSON.stringify(Object.keys(rows[0]).sort()) === JSON.stringify(expectedKeys),
    `each row should have exactly ${expectedKeys.join(', ')} (no article body or user data)`);

  // Moving between pages must neither repeat nor skip an article.
  const secondRows = dataOf(await list('?page=2')).articles || [];
  const firstIds = new Set(rows.map((row) => row.id));
  check(secondRows.length > 0 && secondRows.every((row) => !firstIds.has(row.id)), 'page 2 should not repeat rows from page 1');
  const pastTheEnd = await list('?page=99');
  checkStatus('page past the end', 200, pastTheEnd);
  check((dataOf(pastTheEnd).articles || []).length === 0, 'a page past the end should be an empty list, not an error');

  for (const status of Object.values(STATUS)) {
    const statusRows = dataOf(await list(`?status=${status}`)).articles || [];
    check(statusRows.length > 0 && statusRows.every((row) => row.status === status), `?status=${status} should return only ${status} rows`);
  }

  const ourRows = dataOf(await search(RUN_TAG)).articles || [];
  check(ourRows.length === ourArticleCount, `search by the run tag should find our ${ourArticleCount} articles, got ${ourRows.length}`);
  check((dataOf(await search(RUN_TAG.toUpperCase())).articles || []).length === ourArticleCount, 'search should ignore capitals');
  const renamedRow = ourRows.find((row) => row.id === fixtures.renamedLiveId);
  check(renamedRow !== undefined && renamedRow.isLive === true, 'search should also match the live title of an article whose working title was renamed');
  // Our pending articles: newPending, pendingForReturn, incompletePending, livePending,
  // livePendingForReturn, hostileTitle and editPending.
  check((dataOf(await search(RUN_TAG, `&status=${STATUS.PENDING}`)).articles || []).length === 7, 'search together with status=pending should find our 7 pending articles');

  // Regex characters are searched as plain text (escapeRegex): "C++ (" must find the one
  // title that really contains it, and ".*" must not mean "anything".
  const hostileRows = dataOf(await search(`${RUN_TAG} C++ (test)`)).articles || [];
  check(hostileRows.length === 1 && hostileRows[0].id === fixtures.hostileTitleId, 'search with + and ( should find the one title that contains them');
  check((dataOf(await search(`${RUN_TAG}.*`)).articles || []).length === 0, 'search ".*" should be taken literally and match nothing');

  const badQueries = [
    ['unknown status', '?status=live'],
    ['status given twice', '?status=draft&status=pending'],
    ['search too long', `?search=${'x'.repeat(201)}`],
    // Express 5's default query parser turns a repeated name into an array, not text.
    // (It does NOT turn "search[$ne]=x" into an object, so that form can't reach the query.)
    ['search given twice', '?search=a&search=b'],
    ['page 0', '?page=0'],
    ['page -1', '?page=-1'],
    ['page 2.5', '?page=2.5'],
    ['page abc', '?page=abc'],
  ];
  for (const [name, query] of badQueries) {
    const response = await list(query);
    checkStatus(`list with ${name}`, 400, response);
    check(response.json !== null && typeof response.json.error === 'string', `list with ${name} should explain the error in JSON`);
  }
}

/**
 * GET /editor and GET /editor/articles/:id: the pages render for the editor, a bad id shows a
 * clean error page, a live article with changes shows both versions, and text a reporter
 * typed is printed escaped (as text), so it can never run as script on the editor's page.
 *
 * @param {Object} fixtures - The ids from setUp.
 * @param {Object} cookies - The login cookies from setUp.
 * @returns {Promise<void>}
 */
async function testPages(fixtures, cookies) {
  checkStatus('editor dashboard page', 200, await request(cookies.editor, 'GET', '/editor'));

  const hostilePage = await request(cookies.editor, 'GET', `/editor/articles/${fixtures.hostileTitleId}`);
  checkStatus('review page of the hostile title', 200, hostilePage);
  check(hostilePage.text.includes('&lt;img src=x onerror=alert(1)&gt;'), 'the hostile title should appear escaped (&lt;img ...)');
  check(!hostilePage.text.includes('<img src=x onerror'), 'the hostile title must never appear as a real HTML tag');

  const comparePage = await request(cookies.editor, 'GET', `/editor/articles/${fixtures.livePendingId}`);
  checkStatus('review page of a live article with an update', 200, comparePage);
  check(comparePage.text.includes('Currently live') && comparePage.text.includes('Submitted changes'), 'a live article with an update should show both versions side by side');
  check(comparePage.text.includes('Approve and publish'), 'a pending article should show the decision buttons');

  const publishedPage = await request(cookies.editor, 'GET', `/editor/articles/${fixtures.publishedId}`);
  check(!publishedPage.text.includes('Approve and publish'), 'a published article with no update should not show the decision buttons');

  // For a page, a malformed id and an unknown id both mean "not found" to the editor.
  checkStatus('review page, malformed id', 404, await request(cookies.editor, 'GET', '/editor/articles/abc'));
  checkStatus('review page, unknown id', 404, await request(cookies.editor, 'GET', `/editor/articles/${MISSING_ID}`));
  checkStatus('review page, broken % encoding', 400, await request(cookies.editor, 'GET', '/editor/articles/%E0%A4%A'));
}

/**
 * Reads the value of one data-* attribute from a page's HTML, as the browser would see it
 * before decoding entities (so an escaped value is still escaped here).
 *
 * @param {string} html - The page.
 * @param {string} attributeName - For example 'data-initial-article-id'.
 * @returns {string|null} The raw value, or null if the attribute is missing.
 */
function readAttribute(html, attributeName) {
  const match = html.match(new RegExp(`${attributeName}="([^"]*)"`));
  return match ? match[1] : null;
}

/**
 * GET /editor/analytics: the page renders for the editor with Chart.js and its integrity hash;
 * ?article= opens a live article's chart (its id and title reach the script through data-*
 * attributes, escaped); a malformed, unknown or repeated ?article= gives a notice, never an
 * error page; and only a live article's review page links to its chart.
 *
 * Only the server side is checked here. The chart itself is drawn by public/js/editor/analytics.js
 * in the browser, which a Node script can't run; it was checked in a real browser (see the pull
 * request of the analytics page).
 *
 * Runs before testApprove, while the fixtures still have their starting statuses.
 *
 * @param {Object} fixtures - The ids from setUp.
 * @param {Object} cookies - The login cookies from setUp.
 * @returns {Promise<void>}
 */
async function testAnalyticsPage(fixtures, cookies) {
  const analyticsPage = (query) => request(cookies.editor, 'GET', `/editor/analytics${query}`);

  const plainPage = await analyticsPage('');
  checkStatus('analytics page', 200, plainPage);
  check(plainPage.text.includes('id="views-chart"') && plainPage.text.includes('/js/editor/analytics.js'), 'the analytics page should have the chart canvas and its script');
  check(/chart\.umd\.min\.js"\s+integrity="sha512-/.test(plainPage.text), 'Chart.js should be loaded with an integrity hash');
  check(readAttribute(plainPage.text, 'data-initial-article-id') === '', 'without ?article= no article should be preselected');

  const livePage = await analyticsPage(`?article=${fixtures.publishedId}`);
  checkStatus('analytics page with ?article= of a live article', 200, livePage);
  check(readAttribute(livePage.text, 'data-initial-article-id') === fixtures.publishedId, '?article= should pass the article id to the script');
  check(readAttribute(livePage.text, 'data-initial-article-title') === `${RUN_TAG} ${STATUS.PUBLISHED}`, '?article= should pass the live title to the script');

  // The hostile title, inside an attribute: escaped, it can't close the attribute or open a tag.
  const hostilePage = await analyticsPage(`?article=${fixtures.hostileTitleId}`);
  check(readAttribute(hostilePage.text, 'data-initial-article-title') === `${RUN_TAG} C++ (test) &lt;img src=x onerror=alert(1)&gt;`,
    'a title with HTML should reach the data attribute escaped');
  check(!hostilePage.text.includes('<img src=x onerror'), 'the hostile title must never appear as a real HTML tag on the analytics page');

  const badArticles = [
    ['malformed', 'abc'],
    ['unknown', MISSING_ID],
    ['given twice', `${fixtures.publishedId}&article=${fixtures.publishedId}`],
  ];
  for (const [name, value] of badArticles) {
    const page = await analyticsPage(`?article=${value}`);
    checkStatus(`analytics page with a ${name} ?article=`, 200, page);
    check(page.text.includes('was not found') && readAttribute(page.text, 'data-initial-article-id') === '',
      `a ${name} ?article= should show a notice and preselect nothing`);
  }

  const chartLink = (id) => `/editor/analytics?article=${id}`;
  const liveReview = await request(cookies.editor, 'GET', `/editor/articles/${fixtures.publishedId}`);
  check(liveReview.text.includes(chartLink(fixtures.publishedId)), 'a live article\'s review page should link to its chart');
  const draftReview = await request(cookies.editor, 'GET', `/editor/articles/${fixtures.draftId}`);
  check(!draftReview.text.includes('/editor/analytics?article='), 'a never-published article\'s review page should not link to a chart');
}

/**
 * POST /api/editor/articles/:id/approve: only a complete pending article is published, the
 * request body is ignored (nobody can publish other content than the draft), an update keeps
 * the first publish date, and every approval is added to the publish history.
 *
 * @param {Object} fixtures - The ids from setUp, plus editorId (the seeded editor).
 * @param {Object} cookies - The login cookies from setUp.
 * @returns {Promise<void>}
 */
async function testApprove(fixtures, cookies) {
  const approve = (id, body) => request(cookies.editor, 'POST', `${API}/${id}/approve`, body);

  // A hostile body: if the controller read it, readers would see "HACKED".
  const beforeApprove = Date.now();
  const firstApproval = await approve(fixtures.newPendingId, { published: { title: 'HACKED' }, status: STATUS.DRAFT });
  checkStatus('approve a new pending article', 200, firstApproval);
  const approved = await readArticle(fixtures.newPendingId);
  check(approved.status === STATUS.PUBLISHED, 'after approve the status should be published');
  check(approved.published !== null && approved.published.title === approved.draft.title && approved.published.body === approved.draft.body,
    'the published copy should be exactly the draft (the request body is ignored)');
  check(approved.publishHistory.length === 1 && String(approved.publishHistory[0].editor) === String(fixtures.editorId),
    'the first approval should be in the history with the editor who approved');
  check(+approved.firstPublishedAt === +approved.lastPublishedAt && +approved.lastPublishedAt >= beforeApprove,
    'a first approval should set firstPublishedAt and lastPublishedAt to now');
  check(dataOf(firstApproval).status === STATUS.PUBLISHED, 'the answer should include the new status');
  checkStatus('approve the same article again', 409, await approve(fixtures.newPendingId));

  const liveBefore = await readArticle(fixtures.livePendingId);
  checkStatus('approve an update of a live article', 200, await approve(fixtures.livePendingId));
  const liveAfter = await readArticle(fixtures.livePendingId);
  check(liveAfter.published.title === liveBefore.draft.title, 'after approving the update, readers should see the new title');
  check(+liveAfter.firstPublishedAt === +liveBefore.firstPublishedAt, 'approving an update should keep the first publish date');
  check(liveAfter.publishHistory.length === liveBefore.publishHistory.length + 1, 'approving an update should add one entry to the publish history');

  checkStatus('approve a pending article with no category', 409, await approve(fixtures.incompletePendingId));
  check((await readArticle(fixtures.incompletePendingId)).published === null, 'an incomplete article must stay unpublished');

  // Only "pending" can be published (EZ's canTransition).
  checkStatus('approve a draft', 409, await approve(fixtures.draftId));
  checkStatus('approve a returned article', 409, await approve(fixtures.returnedId));
  checkStatus('approve a published article', 409, await approve(fixtures.publishedId));

  checkStatus('approve, malformed id', 400, await approve('abc'));
  checkStatus('approve, unknown id', 404, await approve(MISSING_ID));
}

/**
 * POST /api/editor/articles/:id/return: the note is required, must be text and at most 2,000
 * characters; a refused request changes nothing; returning a live update keeps the live version
 * online; and a note containing HTML is shown as text on the review page.
 *
 * @param {Object} fixtures - The ids from setUp.
 * @param {Object} cookies - The login cookies from setUp.
 * @returns {Promise<void>}
 */
async function testReturn(fixtures, cookies) {
  const returnArticle = (id, body) => request(cookies.editor, 'POST', `${API}/${id}/return`, body);
  const id = fixtures.pendingForReturnId;

  const badBodies = [
    ['no body at all', undefined],
    ['empty JSON', {}],
    ['note of spaces only', { note: '   ' }],
    ['note is a number', { note: 5 }],
    ['note is an object (NoSQL injection attempt)', { note: { $ne: '' } }],
    ['note too long', { note: 'x'.repeat(2001) }],
    ['broken JSON', '{"note": '],
  ];
  for (const [name, body] of badBodies) {
    checkStatus(`return with ${name}`, 400, await returnArticle(id, body));
  }
  check((await readArticle(id)).status === STATUS.PENDING, 'after the refused returns the article should still be pending');

  // Spaces around the note are trimmed; the HTML in it must stay text.
  const note = 'Please add a source. <script>alert(1)</script>';
  checkStatus('return with a valid note', 200, await returnArticle(id, { note: `  ${note}  ` }));
  const returned = await readArticle(id);
  check(returned.status === STATUS.RETURNED && returned.editorNote === note, 'the article should be returned with the trimmed note');
  checkStatus('return the same article again', 409, await returnArticle(id, { note }));

  const reviewPage = await request(cookies.editor, 'GET', `/editor/articles/${id}`);
  check(reviewPage.text.includes('&lt;script&gt;alert(1)&lt;/script&gt;') && !reviewPage.text.includes('<script>alert(1)</script>'),
    'the note should be shown escaped on the review page, never as a real script tag');

  const liveBefore = await readArticle(fixtures.livePendingForReturnId);
  checkStatus('return an update of a live article', 200, await returnArticle(fixtures.livePendingForReturnId, { note: 'Shorter title please' }));
  const liveAfter = await readArticle(fixtures.livePendingForReturnId);
  check(liveAfter.published.title === liveBefore.published.title && +liveAfter.lastPublishedAt === +liveBefore.lastPublishedAt,
    'returning an update should keep the live version online, unchanged');
  check(liveAfter.draft.title === liveBefore.draft.title, 'returning should keep the reporter\'s work (the draft)');

  checkStatus('return a draft', 409, await returnArticle(fixtures.draftId, { note }));
  checkStatus('return, malformed id', 400, await returnArticle('abc', { note }));
  checkStatus('return, unknown id', 404, await returnArticle(MISSING_ID, { note }));
}

/**
 * recordView() (services/viewTracker.js), called directly: a view of a live article adds one to
 * totalViews and to the current hour's counter, and marks the device once; an article that is
 * not live is not counted; and a broken id never throws (a failed count must not break the
 * article page a reader is opening).
 *
 * @param {Object} fixtures - The ids from setUp.
 * @returns {Promise<void>}
 */
async function testRecordView(fixtures) {
  const id = fixtures.viewsId;
  const deviceId = `${RUN_TAG}-device-a`;
  const before = await readArticle(id);
  await recordView(id, deviceId);
  await recordView(id, deviceId);
  const after = await readArticle(id);
  check(after.totalViews === before.totalViews + 2, 'two views should add 2 to totalViews');
  const thisHour = await ArticleViewStats.findOne({ article: id, hourStart: getHourStart(new Date()) }).lean();
  check(thisHour !== null && thisHour.views === 2, 'two views should be counted in this hour\'s counter');
  check((await DeviceArticleView.countDocuments({ article: id, deviceId })) === 1, 'the same device should be marked only once');

  await recordView(fixtures.draftId, deviceId);
  check((await readArticle(fixtures.draftId)).totalViews === 0, 'a view of an article that is not live should not be counted');
  check((await ArticleViewStats.countDocuments({ article: fixtures.draftId })) === 0, 'an article that is not live should get no counter');

  let threw = false;
  // recordView logs the failure (it doesn't hide it), so an ERROR line is printed here on purpose.
  console.log('Expected next: an ERROR log line "Could not record a view of article abc".');
  try {
    await recordView('abc', deviceId);
  } catch (error) {
    threw = true;
  }
  check(!threw, 'recordView should never throw, even for a broken id');
}

/**
 * GET /api/editor/articles/:id/views: one point per hour with no gaps, the views counted in
 * the range, the publish markers, and a 400 for every invalid date range.
 * Runs after testRecordView, so the article has 2 views this hour; this adds 40 three days ago.
 *
 * @param {Object} fixtures - The ids from setUp.
 * @param {Object} cookies - The login cookies from setUp.
 * @returns {Promise<void>}
 */
async function testViewsChartData(fixtures, cookies) {
  const id = fixtures.viewsId;
  const views = (query) => request(cookies.editor, 'GET', `${API}/${id}/views${query || ''}`);
  const isoDaysAgo = (days) => encodeURIComponent(new Date(Date.now() - days * DAY_MS).toISOString());
  await ArticleViewStats.create({ article: id, hourStart: getHourStart(new Date(Date.now() - 3 * DAY_MS)), views: 40 });

  const defaultRange = await views();
  checkStatus('views, default range', 200, defaultRange);
  const buckets = dataOf(defaultRange).buckets || [];
  const totalInRange = buckets.reduce((sum, bucket) => sum + bucket.views, 0);
  check(totalInRange === 42, `the last 30 days should hold 42 views (40 + 2), got ${totalInRange}`);
  check(buckets.length >= 30 * 24 && buckets.every((bucket, index) => index === 0 || new Date(bucket.hourStart) - new Date(buckets[index - 1].hourStart) === HOUR_MS),
    'there should be one point for every hour, oldest first, with no gaps (empty hours are 0)');
  check((dataOf(defaultRange).publishEvents || []).length === 1, 'the publish inside the range should be one marker');

  const lastTwoDays = dataOf(await views(`?from=${isoDaysAgo(2)}`)).buckets || [];
  check(lastTwoDays.reduce((sum, bucket) => sum + bucket.views, 0) === 2, 'the last 2 days should hold only the 2 recent views');
  checkStatus(`views, exactly ${MAX_RANGE_DAYS} days`, 200, await views(`?from=${isoDaysAgo(MAX_RANGE_DAYS)}`));

  const badRanges = [
    ['"from" not a date', '?from=yesterday'],
    ['"to" not a date', '?to=abc'],
    ['"from" after "to"', `?from=${isoDaysAgo(1)}&to=${isoDaysAgo(2)}`],
    [`range longer than ${MAX_RANGE_DAYS} days`, `?from=${isoDaysAgo(MAX_RANGE_DAYS + 1)}`],
    ['"from" given twice', '?from=2026-10-01&from=2026-10-02'],
  ];
  for (const [name, query] of badRanges) {
    checkStatus(`views with ${name}`, 400, await views(query));
  }
  checkStatus('views, malformed id', 400, await request(cookies.editor, 'GET', `${API}/abc/views`));
  checkStatus('views, unknown id', 404, await request(cookies.editor, 'GET', `${API}/${MISSING_ID}/views`));
}

/**
 * DELETE /api/editor/articles/:id/views: the reset clears the counters and totalViews of ONE
 * article, keeps the device marks (the "already viewed" filter stays true), and leaves every
 * other article untouched.
 *
 * @param {Object} fixtures - The ids from setUp.
 * @param {Object} cookies - The login cookies from setUp.
 * @returns {Promise<void>}
 */
async function testResetViews(fixtures, cookies) {
  const id = fixtures.viewsId;
  // Another live article with views, which the reset must not touch.
  await recordView(fixtures.publishedId, `${RUN_TAG}-device-b`);
  const otherBefore = await readArticle(fixtures.publishedId);

  const reset = await request(cookies.editor, 'DELETE', `${API}/${id}/views`);
  checkStatus('reset views', 200, reset);
  check(dataOf(reset).deletedViewStats === 2, `the reset should delete the 2 hourly counters, answered ${dataOf(reset).deletedViewStats}`);
  check((await readArticle(id)).totalViews === 0, 'after the reset totalViews should be 0');
  check((await ArticleViewStats.countDocuments({ article: id })) === 0, 'after the reset no counters should be left');
  check((await DeviceArticleView.countDocuments({ article: id })) === 1, 'the reset should keep the device marks on purpose');

  const otherAfter = await readArticle(fixtures.publishedId);
  check(otherAfter.totalViews === otherBefore.totalViews && otherAfter.totalViews > 0, 'the reset should not touch another article');

  checkStatus('reset views again (nothing left)', 200, await request(cookies.editor, 'DELETE', `${API}/${id}/views`));
  checkStatus('reset views, malformed id', 400, await request(cookies.editor, 'DELETE', `${API}/abc/views`));
  checkStatus('reset views, unknown id', 404, await request(cookies.editor, 'DELETE', `${API}/${MISSING_ID}/views`));
}

/**
 * DELETE /api/editor/articles/:id: the article goes together with its comments, view counters
 * and device marks, and nothing that belongs to another article is deleted.
 *
 * @param {Object} fixtures - The ids from setUp.
 * @param {Object} cookies - The login cookies from setUp.
 * @returns {Promise<void>}
 */
async function testDelete(fixtures, cookies) {
  const id = fixtures.returnedId;
  const relatedCounts = async (articleId) => [
    await Comment.countDocuments({ article: articleId }),
    await ArticleViewStats.countDocuments({ article: articleId }),
    await DeviceArticleView.countDocuments({ article: articleId }),
  ].join(',');

  // Related data, written directly (a returned article is not live, so it can't get them through the site).
  await Comment.create([
    { article: id, authorName: 'Guest', text: 'First comment', deviceId: `${RUN_TAG}-device-c` },
    { article: id, authorName: 'Guest 2', text: 'Second comment', deviceId: `${RUN_TAG}-device-d` },
  ]);
  await ArticleViewStats.create({ article: id, hourStart: getHourStart(new Date()), views: 5 });
  await DeviceArticleView.create({ article: id, deviceId: `${RUN_TAG}-device-c` });
  const otherBefore = await relatedCounts(fixtures.publishedId);

  const deleted = await request(cookies.editor, 'DELETE', `${API}/${id}`);
  checkStatus('delete an article', 200, deleted);
  const data = dataOf(deleted);
  check(data.deletedComments === 2 && data.deletedViewStats === 1 && data.deletedDeviceViews === 1,
    `the answer should count 2 comments, 1 counter, 1 device mark; got ${data.deletedComments}, ${data.deletedViewStats}, ${data.deletedDeviceViews}`);
  check((await readArticle(id)) === null, 'the article should be gone');
  check((await relatedCounts(id)) === '0,0,0', 'its comments, counters and device marks should be gone');
  check((await relatedCounts(fixtures.publishedId)) === otherBefore, 'another article\'s data should be untouched');

  checkStatus('delete the same article again', 404, await request(cookies.editor, 'DELETE', `${API}/${id}`));
  checkStatus('delete, malformed id', 400, await request(cookies.editor, 'DELETE', `${API}/abc`));
}

/**
 * PATCH /api/editor/articles/:id/draft: the editor edits any article (requirements: the editor
 * can edit all articles). A draft or returned article: only the working copy changes, the status
 * stays, and empty fields are allowed (it is still being written). A pending article: every
 * invalid field gets 400 and nothing changes; a valid edit replaces only the working copy, keeps
 * the status pending, ignores any other field in the body, and leaves the live version untouched;
 * and the edited version is what an approval then publishes. A live article with no update in
 * progress: saving publishes the edit at once (with a history entry), saving it unchanged gets
 * 409, and empty fields get 400. (Guest 401 and reporter 403 are checked in testOnlyEditorsGetIn.)
 *
 * @param {Object} fixtures - The ids from setUp.
 * @param {Object} cookies - The login cookies from setUp.
 * @returns {Promise<void>}
 */
async function testEditDraft(fixtures, cookies) {
  const edit = (id, body) => request(cookies.editor, 'PATCH', `${API}/${id}/draft`, body);
  const id = fixtures.editPendingId;
  const editedContent = { ...GOOD_CONTENT, title: `${RUN_TAG} edited by the editor`, body: 'Corrected first paragraph.\n\nSecond paragraph.' };

  // Work in progress: only the working copy changes, and the status stays.
  for (const [name, otherId] of [['a draft', fixtures.draftId], ['a returned article', fixtures.returnedId]]) {
    const before = await readArticle(otherId);
    const content = { ...editedContent, title: `${RUN_TAG} ${name}, edited by the editor` };
    checkStatus(`edit ${name}`, 200, await edit(otherId, content));
    const after = await readArticle(otherId);
    check(after.draft.title === content.title && after.status === before.status && after.published === null,
      `editing ${name} should change only its working copy, not its status`);
  }
  checkStatus('edit a draft with an empty summary (still being written)', 200, await edit(fixtures.draftId, { ...editedContent, summary: '' }));

  // A live article with no update in progress: saving publishes the edit at once.
  const liveId = fixtures.editLiveId;
  const liveBeforeEdit = await readArticle(liveId);
  const { title, summary, category, imageUrl, body } = liveBeforeEdit.published;
  checkStatus('save a live article without any change', 409, await edit(liveId, { title, summary, category, imageUrl, body }));
  checkStatus('edit a live article with an empty summary', 400, await edit(liveId, { ...editedContent, summary: ' ' }));
  const correctedContent = { ...GOOD_CONTENT, title: `${RUN_TAG} live, corrected by the editor` };
  const publishedEdit = await edit(liveId, correctedContent);
  checkStatus('edit a live article', 200, publishedEdit);
  check(dataOf(publishedEdit).published === true && dataOf(publishedEdit).status === STATUS.PUBLISHED, 'the answer should say the edit was published');
  const liveAfterEdit = await readArticle(liveId);
  check(liveAfterEdit.published.title === correctedContent.title && liveAfterEdit.status === STATUS.PUBLISHED
    && liveAfterEdit.publishHistory.length === liveBeforeEdit.publishHistory.length + 1,
    'editing a live article should publish it at once and add a publish to its history');
  checkStatus('edit, malformed id', 400, await edit('abc', editedContent));
  checkStatus('edit, unknown id', 404, await edit(MISSING_ID, editedContent));

  const beforeBadEdits = await readArticle(id);
  const badBodies = [
    ['no body at all', undefined],
    ['a missing field', { title: 'Only a title' }],
    ['a title that is a number', { ...editedContent, title: 5 }],
    ['a title that is an object (NoSQL injection attempt)', { ...editedContent, title: { $ne: '' } }],
    ['a title over 200 characters', { ...editedContent, title: 'x'.repeat(201) }],
    ['an unknown category', { ...editedContent, category: 'Gossip' }],
    ['a javascript: image address', { ...editedContent, imageUrl: 'javascript:alert(1)' }],
    ['an empty summary (spaces only)', { ...editedContent, summary: '   ' }],
    ['an empty category', { ...editedContent, category: '' }],
    ['broken JSON', '{"title": '],
  ];
  for (const [name, body] of badBodies) {
    checkStatus(`edit with ${name}`, 400, await edit(id, body));
  }
  const afterBadEdits = await readArticle(id);
  check(afterBadEdits.draft.title === beforeBadEdits.draft.title && afterBadEdits.draft.body === beforeBadEdits.draft.body,
    'the refused edits must leave the draft unchanged');

  // A valid edit, with extra fields that must be ignored (they would change the status,
  // publish directly, or change the owner if the controller read them).
  const liveBefore = await readArticle(id);
  const saved = await edit(id, { ...editedContent, status: STATUS.PUBLISHED, published: { title: 'HACKED' }, reporter: MISSING_ID });
  checkStatus('a valid edit', 200, saved);
  check(dataOf(saved).status === STATUS.PENDING, 'the answer should say the article is still pending');
  const liveAfter = await readArticle(id);
  check(liveAfter.status === STATUS.PENDING, 'after the edit the article should still await approval');
  check(liveAfter.draft.title === editedContent.title && liveAfter.draft.body === editedContent.body, 'the draft should hold the editor\'s version');
  check(liveAfter.published.title === liveBefore.published.title && +liveAfter.lastPublishedAt === +liveBefore.lastPublishedAt,
    'readers must keep seeing the live version until an approval');
  check(String(liveAfter.reporter) === String(liveBefore.reporter), 'the owner must not change');

  const reviewPage = await request(cookies.editor, 'GET', `/editor/articles/${id}`);
  check(reviewPage.text.includes(`${RUN_TAG} edited by the editor`) && reviewPage.text.includes('Edit the working version'),
    'the review page should show the edited version and still offer the Edit form');
  const publishedReview = await request(cookies.editor, 'GET', `/editor/articles/${fixtures.publishedId}`);
  check(publishedReview.text.includes('Edit the live article') && publishedReview.text.includes('Save and publish'),
    'a published article should offer an Edit form that says it publishes at once');

  // The point of the edit: approving now publishes the editor's version.
  checkStatus('approve after the edit', 200, await request(cookies.editor, 'POST', `${API}/${id}/approve`));
  check((await readArticle(id)).published.title === editedContent.title, 'approving after the edit should publish the editor\'s version');
}

/**
 * Prepares everything: finds the seeded users, runs safety guard 2, logs in, and creates one
 * article for each situation the tests need. Each test uses its own articles, so the order of
 * the tests matters only where a comment says so.
 *
 * @returns {Promise<{fixtures: Object, cookies: Object}>}
 */
async function setUp() {
  const reporter = await User.findOne({ username: 'reporter1' });
  const editor = await User.findOne({ username: 'editor' });
  if (!reporter || !editor) {
    stopWithMessage('The users reporter1 and editor are missing. Run "npm run seed" on the test database first.');
  }

  await requireSameDatabaseAsServer(reporter._id, editor._id);

  const cookies = {
    editor: await login('editor'),
    reporter: await login('reporter1'),
  };

  const twoDaysAgo = new Date(Date.now() - 2 * DAY_MS);
  const liveContent = (title) => ({ ...GOOD_CONTENT, title: `${RUN_TAG} ${title}` });
  const make = (status, extra) => createArticleInDatabase(reporter._id, status, extra);

  // Every key here is an article with RUN_TAG in its working title or its live title;
  // testArticleList counts them. The editor's id is returned separately for that reason.
  const fixtures = {
    newPendingId: await make(STATUS.PENDING),
    pendingForReturnId: await make(STATUS.PENDING, { draft: liveContent('pending for return') }),
    incompletePendingId: await make(STATUS.PENDING, { draft: { ...GOOD_CONTENT, title: `${RUN_TAG} incomplete`, category: '' } }),
    livePendingId: await make(STATUS.PENDING, {
      draft: liveContent('live, new title'),
      ...liveFields(liveContent('live, old title'), editor._id, twoDaysAgo),
    }),
    livePendingForReturnId: await make(STATUS.PENDING, {
      draft: liveContent('live for return, new title'),
      ...liveFields(liveContent('live for return, old title'), editor._id, twoDaysAgo),
    }),
    draftId: await make(STATUS.DRAFT),
    returnedId: await make(STATUS.RETURNED, { editorNote: 'Please add a source.' }),
    publishedId: await make(STATUS.PUBLISHED, liveFields(liveContent(STATUS.PUBLISHED), editor._id, twoDaysAgo)),
    viewsId: await make(STATUS.PUBLISHED, { draft: liveContent('views'), ...liveFields(liveContent('views'), editor._id, twoDaysAgo) }),
    // The reporter renamed the working copy: only the live title has the tag.
    renamedLiveId: await make(STATUS.DRAFT, { draft: { ...GOOD_CONTENT, title: 'Renamed working title' }, ...liveFields(liveContent('renamed live'), editor._id, twoDaysAgo) }),
    hostileTitleId: await make(STATUS.PENDING, { draft: { ...GOOD_CONTENT, title: HOSTILE_TITLE } }),
    // A live article with a pending update, for the editor's edit: the live copy must not change.
    editPendingId: await make(STATUS.PENDING, {
      draft: liveContent('edit, submitted title'),
      ...liveFields(liveContent('edit, live title'), editor._id, twoDaysAgo),
    }),
    // A live article with no update in progress, for the editor's edit that publishes at once.
    editLiveId: await make(STATUS.PUBLISHED, { draft: liveContent('edit live'), ...liveFields(liveContent('edit live'), editor._id, twoDaysAgo) }),
  };
  return { fixtures, cookies, editorId: editor._id };
}

/**
 * Runs everything, then always cleans up and disconnects, even if a test threw.
 *
 * @returns {Promise<void>}
 */
async function main() {
  requireTestDatabase(process.env.MONGODB_URI);
  await connectToDatabase();

  try {
    const { fixtures, cookies, editorId } = await setUp();
    await testOnlyEditorsGetIn(fixtures, cookies);
    // The list runs before approve, return and delete change the statuses it counts.
    await testArticleList(fixtures, cookies);
    await testPages(fixtures, cookies);
    await testAnalyticsPage(fixtures, cookies);
    await testApprove({ ...fixtures, editorId }, cookies);
    await testReturn(fixtures, cookies);
    // Before testDelete, which deletes the returned article this test also uses.
    await testEditDraft(fixtures, cookies);
    // recordView first: the chart and reset checks count the views it adds.
    await testRecordView(fixtures);
    await testViewsChartData(fixtures, cookies);
    await testResetViews(fixtures, cookies);
    await testDelete(fixtures, cookies);
  } finally {
    // Safety guard 3: delete exactly the articles this script created, and everything that
    // points at them, so the test database is left as the seed made it.
    const ids = createdArticleIds.filter(Boolean);
    await Promise.all([
      Article.deleteMany({ _id: { $in: ids } }),
      Comment.deleteMany({ article: { $in: ids } }),
      ArticleViewStats.deleteMany({ article: { $in: ids } }),
      DeviceArticleView.deleteMany({ article: { $in: ids } }),
    ]);
  }

  console.log(`${checkCount - failedCount} of ${checkCount} checks passed.`);
  if (failedCount > 0) {
    console.log(`${failedCount} FAILED.`);
    // process.exitCode instead of process.exit(1), so Node can finish printing and closing
    // the database connection first.
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    // A StopError is a planned stop (a safety guard or a missing setup step); anything else is a bug.
    console.error(error.name === 'StopError' ? `STOPPED: ${error.message}` : `The test script crashed: ${error.stack}`);
    process.exitCode = 1;
  })
  .finally(() => {
    // Only disconnect if we connected: guard 1 can stop the script before any connection.
    if (mongoose.connection.readyState === 1) {
      return disconnectFromDatabase();
    }
    return undefined;
  });
