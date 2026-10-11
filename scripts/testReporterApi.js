/**
 * scripts/testReporterApi.js
 *
 * A self-check for the reporter's routes, run against a REAL running server. It sends
 * about a hundred and fifty requests, many of them deliberately wrong, and checks that
 * every one gets the right clean answer (200, 201, 400, 401, 403, 404, 409) and that
 * none of them ever gets a 500. It also checks, directly in the database, that a
 * request can never change what it must not change (the owner, the status, `published`).
 *
 * Requirements it checks (in our own words): permissions are checked on the server
 * (guest, editor, another reporter); the status rules hold (a pending article is
 * read-only, only a finished article can be submitted); wrong or hostile input never
 * crashes the server; text written by users is shown as text, not as HTML.
 *
 * How to run it (three steps, always with a TEST database, see "Safety" below):
 *   1. Seed the test database. In Git Bash:
 *        MONGODB_URI=mongodb://127.0.0.1:27017/the-web-daily-test PORT=3098 npm run seed
 *      In PowerShell:
 *        $env:MONGODB_URI='mongodb://127.0.0.1:27017/the-web-daily-test'; $env:PORT='3098'; npm run seed
 *   2. In a second terminal start the server with the SAME two values:
 *        MONGODB_URI=mongodb://127.0.0.1:27017/the-web-daily-test PORT=3098 npm start
 *   3. In the first terminal run this script with the same two values:
 *        MONGODB_URI=mongodb://127.0.0.1:27017/the-web-daily-test PORT=3098 node scripts/testReporterApi.js
 * The logins use the seeded users reporter1, reporter2 and editor, with the password
 * SEED_DEMO_PASSWORD from your .env (it is never written in this file).
 * It needs no test library (the work plan allows only plain console.assert), the same as
 * scripts/testWorkflow.js. It prints one line per failed check and a summary, and exits with
 * a non-zero code if anything failed.
 *
 * Safety (why this script can't damage your real data). It creates and changes articles, so
 * three guards run BEFORE the first request that writes anything:
 *   1. It refuses to start unless the database name in MONGODB_URI ends with "-test".
 *   2. It writes a marker article straight into that database and asks the server (a
 *      read-only request) whether it can see it. If the server answers "not found", the
 *      server is using a different database, so the script stops before logging in or writing.
 *   3. At the end it deletes every article it created.
 * (npm run seed wipes the database it is pointed at, which is why the "-test" name matters.)
 *
 * Known issue it reports without failing: see checkKnownIssue (the bad-URL 500 that belongs
 * to middleware/errorHandler.js, owned by OS). When OS fixes it, those checks start to pass
 * and the script tells you to turn them into normal checks.
 *
 * Not tested here on purpose: two requests at the same instant (a race between autosave and
 * submit). The result of a race is not the same every time, so it can't be a reliable check; it
 * is listed as a known limit in the pull request instead.
 *
 * Used by: run by hand (EZ's acceptance checks for the reporter area).
 * Related: controllers/reporterController.js, routes/apiRoutes/reporterApiRoutes.js,
 * routes/pageRoutes/reporterPageRoutes.js, services/articleWorkflow.js, scripts/seed.js.
 * Owner: EZ.
 */

require('dotenv').config({ quiet: true });

const mongoose = require('mongoose');
const { connectToDatabase, disconnectFromDatabase } = require('../config/database');
const User = require('../models/User');
const Article = require('../models/Article');
const { STATUS } = require('../services/articleWorkflow');

const SERVER_PORT = Number(process.env.PORT) || 3000;
const BASE_URL = `http://localhost:${SERVER_PORT}`;
const API = '/api/reporter/articles';

let checkCount = 0;
let failedCount = 0;
let knownIssueOpenCount = 0;
let knownIssueFixedCount = 0;

// Ids of every article this script created, so the end of the run can delete exactly those.
const createdArticleIds = [];

// A complete, valid draft. Each test copies it and spoils one field.
const GOOD_DRAFT = { title: 'API test', summary: 'A short summary', category: 'Economy', imageUrl: '', body: 'Some text' };

// The content of a live (published) article. Used for the published copy of the live articles
// the tests create, and, copied into the draft, to make a draft that equals the published text.
const LIVE_CONTENT = { title: 'Live title', summary: 'Live summary', body: 'Live body', category: 'Economy', imageUrl: '' };

// An id that has the right shape (24 hex characters) but belongs to no article.
const MISSING_ID = '000000000000000000000000';

/**
 * Records one check. A failing check prints through console.assert and is counted, so the
 * summary at the end can report it (console.assert only prints; it neither throws nor
 * remembers how many checks failed).
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
 * Checks one request's HTTP status. The expected status is listed explicitly, so a 500 is
 * never "expected": any 5xx answer fails the check, which is how this script enforces
 * "bad input must never crash or break the server".
 *
 * @param {string} description - What was sent, for example "guest PATCH draft".
 * @param {number|number[]} expected - The status, or the statuses that are all acceptable.
 * @param {{status: number}} response - What request() returned.
 * @returns {void}
 */
function checkStatus(description, expected, response) {
  const accepted = Array.isArray(expected) ? expected : [expected];
  check(accepted.includes(response.status), `${description}: expected ${accepted.join(' or ')}, got ${response.status}`);
}

/**
 * A check for a bug we already know about and that is NOT in the reporter's files. It
 * does not count as a failure while the bug is open (the script would then be red for a
 * reason that this branch can't fix), but it is printed so nobody forgets it. When the owner
 * fixes the bug the check passes, and the script says so, so it can become a normal check.
 *
 * @param {string} description - What was sent.
 * @param {number} expected - The status that is correct.
 * @param {{status: number}} response - What request() returned.
 * @param {string} owner - Who owns the file that has to change.
 * @returns {void}
 */
function checkKnownIssue(description, expected, response, owner) {
  if (response.status === expected) {
    knownIssueFixedCount += 1;
    console.log(`KNOWN ISSUE NOW FIXED: ${description} answers ${expected}. Change it to checkStatus.`);
  } else {
    knownIssueOpenCount += 1;
    console.log(`KNOWN ISSUE (waiting for ${owner}): ${description}: expected ${expected}, got ${response.status}`);
  }
}

/**
 * Sends one request to the running server and returns the status and the body. Never
 * throws for an HTTP error (a 4xx or 5xx is a normal answer for this script); it only
 * throws if the server can't be reached at all.
 *
 * @param {string} cookie - The login cookie to send, or '' for a guest.
 * @param {string} method - 'GET', 'POST', 'PATCH', ...
 * @param {string} path - For example '/api/reporter/articles'.
 * @param {Object|string} [body] - An object is sent as JSON. A string is sent exactly as
 *   written (so a test can send broken JSON on purpose).
 * @param {Object} [extraHeaders] - Headers that replace the defaults, for example a different Content-Type.
 * @returns {Promise<{status: number, json: (Object|null), text: string}>}
 */
async function request(cookie, method, path, body, extraHeaders) {
  const headers = { cookie: cookie, ...(extraHeaders || {}) };
  let payload;
  if (body !== undefined) {
    payload = typeof body === 'string' ? body : JSON.stringify(body);
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
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
  return { status: response.status, json, text };
}

/**
 * The error message of an answer, or '' if the answer has none (for example a 200). The checks
 * that look inside a message use this, so an unexpected answer is reported as a failed check
 * instead of crashing the whole script with "cannot read properties of undefined".
 *
 * @param {{json: (Object|null)}} response - What request() returned.
 * @returns {string} The "error" text of the JSON answer, or ''.
 */
function errorOf(response) {
  return (response.json && typeof response.json.error === 'string') ? response.json.error : '';
}

/**
 * Logs in and returns the session cookie ("sessionId=..."), the same cookie a browser keeps.
 *
 * @param {string} username - A seeded user: reporter1, reporter2 or editor.
 * @returns {Promise<string>} The cookie text to send with later requests.
 * @throws {Error} If the login does not work (the database was probably not seeded).
 */
async function login(username) {
  const response = await fetch(BASE_URL + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: process.env.SEED_DEMO_PASSWORD }),
  });
  if (response.status !== 200) {
    throw new Error(`Could not log in as "${username}" (status ${response.status}). Run "npm run seed" on the test database and set SEED_DEMO_PASSWORD in .env.`);
  }
  return response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
}

/**
 * Stops the script with a clear message. Used by the safety guards and the setup. It throws
 * (instead of calling process.exit) so the "finally" in main still runs and deletes the
 * articles the script already created; main prints the message and sets the exit code.
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
 * The name is read from the address text, before any connection is made.
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
    stopWithMessage(`The database "${databaseName}" does not end with "-test", so this script refuses to run. It creates and changes articles. Use a separate test database.`);
  }
}

/**
 * Safety guard 2: proves that the server and this script use the same database. It writes a
 * published marker article into OUR database and asks the server for its comments, which is a
 * public, read-only request (200 only if the server finds a live article with that id).
 *
 * @param {import('mongoose').Types.ObjectId} reporterId - Owner of the marker article.
 * @returns {Promise<void>}
 */
async function requireSameDatabaseAsServer(reporterId) {
  const marker = await Article.create({
    reporter: reporterId,
    status: STATUS.PUBLISHED,
    draft: { title: 'marker' },
    published: { title: 'marker', summary: 'marker', body: 'marker', category: 'Economy', imageUrl: '' },
    lastPublishedAt: new Date(),
  });
  createdArticleIds.push(marker._id);

  let response;
  try {
    response = await request('', 'GET', `/api/articles/${marker._id}/comments`);
  } catch (networkError) {
    stopWithMessage(`Cannot reach the server at ${BASE_URL}. Start it with the same MONGODB_URI and PORT as this script (npm start).`);
  }
  if (response.status !== 200) {
    stopWithMessage(`The server at ${BASE_URL} cannot see the marker article, so it uses a different database than this script. Start the server with the same MONGODB_URI.`);
  }
}

/**
 * Creates an article directly in the database (the reporter routes can only create empty
 * drafts, so the other states have to be written by hand).
 *
 * @param {import('mongoose').Types.ObjectId} reporterId - The owner.
 * @param {string} status - One of STATUS.
 * @param {Object} [extra] - Extra fields: draft, published, editorNote.
 * @returns {Promise<string>} The new article's id as text.
 */
async function createArticleInDatabase(reporterId, status, extra) {
  const article = await Article.create({
    reporter: reporterId,
    status,
    draft: { ...GOOD_DRAFT, title: `${status} article` },
    ...(extra || {}),
  });
  createdArticleIds.push(article._id);
  return article._id.toString();
}

/**
 * Reads one article straight from the database, to check what a request really changed.
 *
 * @param {string} articleId - The article id.
 * @returns {Promise<Object>} The article as a plain object.
 */
async function readArticle(articleId) {
  return Article.findById(articleId).lean();
}

/**
 * A guest (not logged in) must get 401 on every API route and be sent to /login on every page.
 * A cookie that a guest made up (a forged session, a fake "role" cookie) must not help,
 * because the role comes only from the server-side session.
 *
 * @param {Object} fixtures - The ids from setUp.
 * @returns {Promise<void>}
 */
async function testGuestIsBlocked(fixtures) {
  const draftPath = `${API}/${fixtures.draftId}/draft`;
  const submitPath = `${API}/${fixtures.draftId}/submit`;
  checkStatus('guest GET list', 401, await request('', 'GET', API));
  checkStatus('guest POST create', 401, await request('', 'POST', API));
  checkStatus('guest PATCH draft', 401, await request('', 'PATCH', draftPath, GOOD_DRAFT));
  checkStatus('guest POST submit', 401, await request('', 'POST', submitPath, {}));
  checkStatus('guest GET /reporter page', 302, await request('', 'GET', '/reporter'));
  checkStatus('guest GET edit page', 302, await request('', 'GET', `/reporter/articles/${fixtures.draftId}/edit`));

  checkStatus('forged session cookie, PATCH draft', 401, await request('sessionId=s%3Aforged.value', 'PATCH', draftPath, GOOD_DRAFT));
  checkStatus('forged session cookie, page', 302, await request('sessionId=garbage', 'GET', '/reporter'));
  checkStatus('fake role cookie as a guest', 401, await request('role=editor; userRole=editor', 'POST', submitPath, {}));
}

/**
 * An editor is logged in but is not a reporter, so every reporter route answers 403. (An
 * editor edits through the editor routes, which are SM's.)
 *
 * @param {Object} fixtures - The ids from setUp.
 * @param {Object} cookies - The login cookies from setUp.
 * @returns {Promise<void>}
 */
async function testEditorIsBlocked(fixtures, cookies) {
  const draftPath = `${API}/${fixtures.draftId}/draft`;
  const submitPath = `${API}/${fixtures.draftId}/submit`;
  checkStatus('editor GET list', 403, await request(cookies.editor, 'GET', API));
  checkStatus('editor POST create', 403, await request(cookies.editor, 'POST', API));
  checkStatus('editor PATCH draft', 403, await request(cookies.editor, 'PATCH', draftPath, GOOD_DRAFT));
  checkStatus('editor POST submit', 403, await request(cookies.editor, 'POST', submitPath, {}));
  checkStatus('editor GET /reporter page', 403, await request(cookies.editor, 'GET', '/reporter'));
  checkStatus('editor GET edit page', 403, await request(cookies.editor, 'GET', `/reporter/articles/${fixtures.draftId}/edit`));
}

/**
 * A reporter may only touch their own articles (403 for someone else's), and only while the
 * article's status allows it (409 for a pending article, and for submitting an article that
 * is plain "Published"). The database must be unchanged afterwards.
 *
 * @param {Object} fixtures - The ids from setUp.
 * @param {Object} cookies - The login cookies from setUp.
 * @returns {Promise<void>}
 */
async function testOwnershipAndStatus(fixtures, cookies) {
  const otherBefore = await readArticle(fixtures.otherId);
  checkStatus("other reporter's article, PATCH draft", 403, await request(cookies.reporter1, 'PATCH', `${API}/${fixtures.otherId}/draft`, GOOD_DRAFT));
  checkStatus("other reporter's article, POST submit", 403, await request(cookies.reporter1, 'POST', `${API}/${fixtures.otherId}/submit`, {}));
  checkStatus("other reporter's article, edit page", 403, await request(cookies.reporter1, 'GET', `/reporter/articles/${fixtures.otherId}/edit`));
  const otherAfter = await readArticle(fixtures.otherId);
  check(otherBefore.status === otherAfter.status && otherBefore.draft.title === otherAfter.draft.title, "the other reporter's article was not changed");

  const pendingBefore = await readArticle(fixtures.pendingId);
  checkStatus('pending article, PATCH draft', 409, await request(cookies.reporter1, 'PATCH', `${API}/${fixtures.pendingId}/draft`, { ...GOOD_DRAFT, title: 'changed while pending' }));
  checkStatus('pending article, POST submit again', 409, await request(cookies.reporter1, 'POST', `${API}/${fixtures.pendingId}/submit`, {}));
  checkStatus('pending article, edit page', 409, await request(cookies.reporter1, 'GET', `/reporter/articles/${fixtures.pendingId}/edit`));
  const pendingAfter = await readArticle(fixtures.pendingId);
  check(pendingAfter.status === STATUS.PENDING && pendingAfter.draft.title === pendingBefore.draft.title, 'a pending article stays read-only (status and text unchanged)');

  checkStatus('plain published article, POST submit', 409, await request(cookies.reporter1, 'POST', `${API}/${fixtures.publishedId}/submit`, {}));
  // Damaged data: a status that is not one of the four. The model refuses to CREATE such an article,
  // so we make a normal draft and then change the status with the raw driver, which skips the model's
  // checks. This is what a bad manual edit of the database would look like.
  const damaged = await createArticleInDatabase(fixtures.reporter1Id, STATUS.DRAFT);
  await Article.collection.updateOne({ _id: new mongoose.Types.ObjectId(damaged) }, { $set: { status: 'weird-status' } });
  checkStatus('article with an unknown status, PATCH draft', 409, await request(cookies.reporter1, 'PATCH', `${API}/${damaged}/draft`, GOOD_DRAFT));
  checkStatus('article with an unknown status, POST submit', 409, await request(cookies.reporter1, 'POST', `${API}/${damaged}/submit`, {}));
}

/**
 * Ids from the URL: a wrong id must give 400 (never reach the database as a strange query),
 * and a well-formed id that belongs to nobody must give 404.
 *
 * @param {Object} fixtures - The ids from setUp.
 * @param {Object} cookies - The login cookies from setUp.
 * @returns {Promise<void>}
 */
async function testBadIds(fixtures, cookies) {
  const badIds = [
    ['not an id', 'abc'],
    ['24 characters that are not hex', 'zzzzzzzzzzzzzzzzzzzzzzzz'],
    ['12 characters (accepted by isValidObjectId)', 'aaaaaaaaaaaa'],
    ['25 hex characters', '0'.repeat(25)],
    ['5000 characters', 'a'.repeat(5000)],
    ['an encoded null character', '%00'],
    ['text that looks like an operator', '%7B%22%24ne%22%3A1%7D'],
    ['a path trick', '..%2F..%2Fx'],
  ];
  for (const [label, id] of badIds) {
    checkStatus(`PATCH draft, id = ${label}`, 400, await request(cookies.reporter1, 'PATCH', `${API}/${id}/draft`, GOOD_DRAFT));
    checkStatus(`POST submit, id = ${label}`, 400, await request(cookies.reporter1, 'POST', `${API}/${id}/submit`, {}));
    checkStatus(`edit page, id = ${label}`, 400, await request(cookies.reporter1, 'GET', `/reporter/articles/${id}/edit`));
  }

  // The URL "%E0%A4%A" has a broken percent-encoding. The router throws before any of our
  // code runs, and middleware/errorHandler.js (OS) only reads error.statusCode, while the
  // router sets error.status, so the answer is a 500 instead of a 400. Not fixable in the
  // reporter's files, so it is reported as a known issue.
  const brokenEncoding = '%E0%A4%A';
  checkKnownIssue('PATCH draft with a broken percent-encoding in the id', 400, await request(cookies.reporter1, 'PATCH', `${API}/${brokenEncoding}/draft`, GOOD_DRAFT), 'OS (middleware/errorHandler.js)');
  checkKnownIssue('POST submit with a broken percent-encoding in the id', 400, await request(cookies.reporter1, 'POST', `${API}/${brokenEncoding}/submit`, {}), 'OS (middleware/errorHandler.js)');
  checkKnownIssue('edit page with a broken percent-encoding in the id', 400, await request(cookies.reporter1, 'GET', `/reporter/articles/${brokenEncoding}/edit`), 'OS (middleware/errorHandler.js)');

  checkStatus('PATCH draft, id that belongs to nobody', 404, await request(cookies.reporter1, 'PATCH', `${API}/${MISSING_ID}/draft`, GOOD_DRAFT));
  checkStatus('POST submit, id that belongs to nobody', 404, await request(cookies.reporter1, 'POST', `${API}/${MISSING_ID}/submit`, {}));
  checkStatus('edit page, id that belongs to nobody', 404, await request(cookies.reporter1, 'GET', `/reporter/articles/${MISSING_ID}/edit`));
}

/**
 * Submitting needs a complete article. Title, summary, category and text must be filled in
 * (spaces only counts as empty); the image is optional. The check uses the draft stored in
 * the database, so it must also cope with a document that lacks the fields altogether.
 *
 * @param {Object} fixtures - The ids from setUp.
 * @param {Object} cookies - The login cookies from setUp.
 * @returns {Promise<void>}
 */
async function testEmptySubmit(fixtures, cookies) {
  const created = await request(cookies.reporter1, 'POST', API);
  const id = created.json.data.id;
  createdArticleIds.push(id);
  const draftPath = `${API}/${id}/draft`;
  const submitPath = `${API}/${id}/submit`;

  const emptyResult = await request(cookies.reporter1, 'POST', submitPath, {});
  checkStatus('submit a brand-new empty article', 400, emptyResult);
  check(['title', 'summary', 'category', 'article text'].every((name) => errorOf(emptyResult).includes(name)), 'the 400 message names all four missing fields');

  await request(cookies.reporter1, 'PATCH', draftPath, { ...GOOD_DRAFT, title: '   ', summary: '\n\t', body: '  ' });
  checkStatus('submit with title, summary and text made only of spaces', 400, await request(cookies.reporter1, 'POST', submitPath, {}));

  await request(cookies.reporter1, 'PATCH', draftPath, { ...GOOD_DRAFT, category: '' });
  checkStatus('submit without a category', 400, await request(cookies.reporter1, 'POST', submitPath, {}));

  // A damaged document: the fields are missing from the database, not just empty.
  await Article.collection.updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $unset: { 'draft.title': '', 'draft.summary': '', 'draft.body': '' } });
  checkStatus('submit when the draft fields are missing from the document', 400, await request(cookies.reporter1, 'POST', submitPath, {}));
  checkStatus('edit page when the draft fields are missing from the document', 200, await request(cookies.reporter1, 'GET', `/reporter/articles/${id}/edit`));
  checkStatus('autosave repairs that document', 200, await request(cookies.reporter1, 'PATCH', draftPath, GOOD_DRAFT));

  checkStatus('broken JSON as the submit body', 400, await request(cookies.reporter1, 'POST', submitPath, '{not json'));
}

/**
 * Autosave and create must refuse every wrong body with a 400 and never store anything
 * dangerous: values that are not text (they could be MongoDB operators), too long text, an
 * unknown category, an image address that is not http(s), broken JSON, a body over the size limit.
 *
 * @param {Object} fixtures - The ids from setUp.
 * @param {Object} cookies - The login cookies from setUp.
 * @returns {Promise<void>}
 */
async function testBadBodies(fixtures, cookies) {
  const draftPath = `${API}/${fixtures.draftId}/draft`;
  const patch = (description, expected, body, headers) => request(cookies.reporter1, 'PATCH', draftPath, body, headers)
    .then((response) => checkStatus(description, expected, response));

  await patch('no body at all', 400, undefined);
  await patch('body is JSON null', 400, 'null');
  await patch('body is a JSON array', 400, '[]');
  await patch('body is a JSON string', 400, '"abc"');
  await patch('body is a JSON number', 400, '5');
  await patch('broken JSON', 400, '{"title": ');
  await patch('empty object', 400, {});
  await patch('JSON sent with Content-Type text/plain', 400, JSON.stringify(GOOD_DRAFT), { 'Content-Type': 'text/plain' });

  for (const field of ['title', 'summary', 'category', 'imageUrl', 'body']) {
    await patch(`${field} is a number`, 400, { ...GOOD_DRAFT, [field]: 5 });
    await patch(`${field} is null`, 400, { ...GOOD_DRAFT, [field]: null });
    await patch(`${field} is an array`, 400, { ...GOOD_DRAFT, [field]: ['x'] });
    await patch(`${field} is {"$ne":""} (a MongoDB operator)`, 400, { ...GOOD_DRAFT, [field]: { $ne: '' } });
  }

  await patch('title of 201 characters', 400, { ...GOOD_DRAFT, title: 'a'.repeat(201) });
  await patch('summary of 501 characters', 400, { ...GOOD_DRAFT, summary: 'a'.repeat(501) });
  await patch('body of 50,001 characters', 400, { ...GOOD_DRAFT, body: 'a'.repeat(50001) });
  await patch('image address of 2,001 characters', 400, { ...GOOD_DRAFT, imageUrl: 'http://x.com/' + 'a'.repeat(1990) });
  await patch('unknown category', 400, { ...GOOD_DRAFT, category: 'Cooking' });
  await patch('category with the wrong capital letters', 400, { ...GOOD_DRAFT, category: 'economy' });
  await patch('image address javascript:', 400, { ...GOOD_DRAFT, imageUrl: 'javascript:alert(1)' });
  await patch('image address data:', 400, { ...GOOD_DRAFT, imageUrl: 'data:text/html,<script>1</script>' });
  await patch('image address ftp://', 400, { ...GOOD_DRAFT, imageUrl: 'ftp://x.com/a.png' });
  await patch('image address that is plain text', 400, { ...GOOD_DRAFT, imageUrl: 'not a url' });
  await patch('body of 2 MB (over the 1 MB limit)', 400, { ...GOOD_DRAFT, body: 'a'.repeat(2 * 1024 * 1024) });

  const formHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' };
  await patch('form-encoded nested field title[$ne]=', 400, 'title[$ne]=&summary=S&category=Economy&imageUrl=&body=B', formHeaders);

  checkStatus('POST create with broken JSON', 400, await request(cookies.reporter1, 'POST', API, '{oops'));
  checkStatus('POST create with a 2 MB body', 400, await request(cookies.reporter1, 'POST', API, { x: 'a'.repeat(2 * 1024 * 1024) }));
}

/**
 * Reporters can't delete articles or use any other method: those routes don't exist, so the
 * answer is a clean 404 (JSON for /api), not a crash.
 *
 * @param {Object} fixtures - The ids from setUp.
 * @param {Object} cookies - The login cookies from setUp.
 * @returns {Promise<void>}
 */
async function testRoutesThatDoNotExist(fixtures, cookies) {
  const draftPath = `${API}/${fixtures.draftId}/draft`;
  const submitPath = `${API}/${fixtures.draftId}/submit`;
  const routes = [
    ['DELETE', `${API}/${fixtures.draftId}`], ['GET', draftPath], ['PUT', draftPath], ['DELETE', draftPath],
    ['PATCH', submitPath], ['GET', submitPath], ['PATCH', API], ['DELETE', API],
  ];
  for (const [method, path] of routes) {
    checkStatus(`${method} ${path.replace(fixtures.draftId, ':id')} as a reporter`, 404, await request(cookies.reporter1, method, path, method === 'GET' || method === 'DELETE' ? undefined : {}));
  }
}

/**
 * The normal, allowed paths, and what they must and must not change in the database. These
 * make sure the "forbidden" checks above are not passing just because everything fails: here
 * the same routes succeed when they should. It also checks that the owner, the status and the
 * `published` copy can never be set from the request, and that the editor's note and the live
 * version are kept, and that text is shown escaped on the edit page (no HTML injection).
 *
 * @param {Object} fixtures - The ids from setUp.
 * @param {Object} cookies - The login cookies from setUp.
 * @returns {Promise<void>}
 */
async function testAllowedPaths(fixtures, cookies) {
  // Create: the body is ignored, the server decides owner, status and published.
  const junk = { reporter: fixtures.otherReporterId, status: 'published', published: { title: 'hacked' } };
  const created = await request(cookies.reporter1, 'POST', API, junk);
  checkStatus('POST create (with junk fields in the body)', 201, created);
  const newId = created.json && created.json.data && created.json.data.id;
  createdArticleIds.push(newId);
  const newArticle = await readArticle(newId);
  check(String(newArticle.reporter) === String(fixtures.reporter1Id), 'a new article belongs to the logged-in reporter, not to the one named in the body');
  check(newArticle.status === STATUS.DRAFT && newArticle.published === null, 'a new article is "draft" and not published, whatever the body says');

  // Autosave with extra fields: only the five draft fields are used.
  const extra = '{"title":"T","summary":"S","category":"Economy","imageUrl":"","body":"B","status":"published","reporter":"' + fixtures.otherReporterId + '","published":{"title":"hacked"},"__proto__":{"status":"published"}}';
  checkStatus('PATCH draft with status, reporter, published and __proto__ in the body', 200, await request(cookies.reporter1, 'PATCH', `${API}/${newId}/draft`, extra));
  const afterExtra = await readArticle(newId);
  check(afterExtra.status === STATUS.DRAFT && afterExtra.published === null && String(afterExtra.reporter) === String(fixtures.reporter1Id), 'status, published and owner cannot be set through autosave');
  checkStatus('PATCH draft with the 50,000-character limit', 200, await request(cookies.reporter1, 'PATCH', `${API}/${newId}/draft`, { ...GOOD_DRAFT, body: 'a'.repeat(50000) }));
  checkStatus('PATCH draft with the 200-character title limit', 200, await request(cookies.reporter1, 'PATCH', `${API}/${newId}/draft`, { ...GOOD_DRAFT, title: 'a'.repeat(200) }));
  checkStatus('PATCH draft with a null character in the title', [200, 400], await request(cookies.reporter1, 'PATCH', `${API}/${newId}/draft`, { ...GOOD_DRAFT, title: 'a\u0000b' }));

  // Text with HTML in it is stored as text and shown escaped.
  const hostileTitle = '<script>alert(1)</script> שלום \u{1F600}';
  checkStatus('PATCH draft with a script tag, Hebrew and an emoji in the title', 200, await request(cookies.reporter1, 'PATCH', `${API}/${newId}/draft`, { ...GOOD_DRAFT, title: hostileTitle }));
  const editPage = await request(cookies.reporter1, 'GET', `/reporter/articles/${newId}/edit`);
  checkStatus('edit page of that article', 200, editPage);
  check(!editPage.text.includes('<script>alert(1)</script>') && editPage.text.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'the edit page shows the script tag as text (escaped), not as HTML');

  // Submit: allowed for a complete draft, then the article is read-only and `published` is untouched.
  await request(cookies.reporter1, 'PATCH', `${API}/${newId}/draft`, GOOD_DRAFT);
  const submitted = await request(cookies.reporter1, 'POST', `${API}/${newId}/submit`, { status: 'published', reporter: fixtures.otherReporterId });
  checkStatus('POST submit of a complete draft (with junk fields in the body)', 200, submitted);
  check(Boolean(submitted.json && submitted.json.data && submitted.json.data.status === STATUS.PENDING), 'the answer says "pending"');
  const afterSubmit = await readArticle(newId);
  check(afterSubmit.status === STATUS.PENDING && afterSubmit.published === null && String(afterSubmit.reporter) === String(fixtures.reporter1Id), 'submit sets "pending" and nothing else, whatever the body says');
  checkStatus('autosave after submit', 409, await request(cookies.reporter1, 'PATCH', `${API}/${newId}/draft`, GOOD_DRAFT));
  checkStatus('edit page after submit', 409, await request(cookies.reporter1, 'GET', `/reporter/articles/${newId}/edit`));

  // A returned article: the note is shown on the edit page, and is kept when it is resubmitted.
  const returnedBefore = await readArticle(fixtures.returnedId);
  const returnedEdit = await request(cookies.reporter1, 'GET', `/reporter/articles/${fixtures.returnedId}/edit`);
  checkStatus('edit page of a returned article', 200, returnedEdit);
  check(returnedEdit.text.includes(returnedBefore.editorNote), "the returned article's edit page shows the editor's note");
  checkStatus('POST submit of a returned article', 200, await request(cookies.reporter1, 'POST', `${API}/${fixtures.returnedId}/submit`, {}));
  const returnedAfter = await readArticle(fixtures.returnedId);
  check(returnedAfter.status === STATUS.PENDING && returnedAfter.editorNote === returnedBefore.editorNote, 'resubmitting keeps the editor note (only the editor approve clears it)');
  const listed = await request(cookies.reporter1, 'GET', API);
  const listedItem = listed.json && listed.json.data.articles.find((item) => item.id === fixtures.returnedId);
  check(listedItem && listedItem.editorNote === returnedBefore.editorNote, 'the dashboard list still carries the note while the article is pending');

  // Editing a live article: the working copy goes back to "draft", the live text is untouched.
  const liveBefore = await readArticle(fixtures.publishedId);
  checkStatus('PATCH draft of a published article', 200, await request(cookies.reporter1, 'PATCH', `${API}/${fixtures.publishedId}/draft`, { ...GOOD_DRAFT, title: 'New version of a live article' }));
  const liveAfter = await readArticle(fixtures.publishedId);
  check(liveAfter.status === STATUS.DRAFT, 'editing a published article moves the working copy to "draft"');
  check(liveAfter.published && liveAfter.published.title === liveBefore.published.title && liveAfter.published.body === liveBefore.published.body, 'the published (public) text is untouched by the edit');
  check(liveAfter.draft.title === 'New version of a live article', 'the new text went into the draft');
}

/**
 * Submitting a LIVE article whose draft is identical to the published text would send the
 * editor an update that changes nothing (and add a pointless publish marker to the analytics
 * chart), so the server answers 409 "There are no changes to submit". The comparison is exact,
 * it only applies to live articles, and it comes after the other checks (required fields first,
 * then the status). The article must stay exactly as it was after the refused request.
 *
 * @param {Object} fixtures - The ids from setUp.
 * @param {Object} cookies - The login cookies from setUp.
 * @returns {Promise<void>}
 */
async function testSubmitWithoutChanges(fixtures, cookies) {
  const liveWithDraft = (status, draft, extra) => createArticleInDatabase(fixtures.reporter1Id, status, {
    draft, published: LIVE_CONTENT, lastPublishedAt: new Date(), ...(extra || {}),
  });
  const submit = (id) => request(cookies.reporter1, 'POST', `${API}/${id}/submit`, {});

  // The main case: a live article that is back in "draft" with the same text as the published one.
  const sameId = await liveWithDraft(STATUS.DRAFT, LIVE_CONTENT);
  const sameAnswer = await submit(sameId);
  checkStatus('submit a live article whose draft equals the published text', 409, sameAnswer);
  check(errorOf(sameAnswer).includes('There are no changes to submit'), 'the 409 message says "There are no changes to submit"');
  const sameAfter = await readArticle(sameId);
  check(sameAfter.status === STATUS.DRAFT && sameAfter.published.title === LIVE_CONTENT.title && sameAfter.publishHistory.length === 0, 'the refused submit changed nothing (status, published text, publish history)');

  // Exact comparison: one extra space is a change, and so is any other field.
  const spaceId = await liveWithDraft(STATUS.DRAFT, { ...LIVE_CONTENT, body: LIVE_CONTENT.body + ' ' });
  checkStatus('submit when the text differs only by a trailing space', 200, await submit(spaceId));
  const titleId = await liveWithDraft(STATUS.DRAFT, { ...LIVE_CONTENT, title: 'A new title' });
  checkStatus('submit when only the title changed', 200, await submit(titleId));
  const categoryId = await liveWithDraft(STATUS.DRAFT, { ...LIVE_CONTENT, category: 'Science' });
  checkStatus('submit when only the category changed', 200, await submit(categoryId));
  const imageId = await liveWithDraft(STATUS.DRAFT, { ...LIVE_CONTENT, imageUrl: 'https://example.com/a.png' });
  checkStatus('submit when only the image address changed', 200, await submit(imageId));
  check((await readArticle(titleId)).status === STATUS.PENDING, 'an article with real changes becomes "pending"');

  // A returned live article whose draft was put back to the published text: nothing to review.
  const returnedId = await liveWithDraft(STATUS.RETURNED, LIVE_CONTENT, { editorNote: 'Please check the numbers.' });
  checkStatus('resubmit a returned live article with no changes', 409, await submit(returnedId));
  check((await readArticle(returnedId)).editorNote === 'Please check the numbers.', 'the editor note is kept after the refused resubmit');

  // The order of the checks: required fields (400) and status (409 "waiting") come first.
  const emptyTitleId = await liveWithDraft(STATUS.DRAFT, { ...LIVE_CONTENT, title: '' });
  const emptyTitleAnswer = await submit(emptyTitleId);
  checkStatus('a live article with an empty title', 400, emptyTitleAnswer);
  check(errorOf(emptyTitleAnswer).includes('title'), 'the empty field is reported before the "no changes" rule');
  const waitingId = await liveWithDraft(STATUS.PENDING, LIVE_CONTENT);
  const waitingAnswer = await submit(waitingId);
  checkStatus('a pending live article with no changes', 409, waitingAnswer);
  check(errorOf(waitingAnswer).includes('already waiting'), 'the status message wins ("already waiting for the editor")');

  // An article that was never published has nothing to compare with: its first submit works.
  const neverId = await createArticleInDatabase(fixtures.reporter1Id, STATUS.DRAFT, { draft: LIVE_CONTENT });
  checkStatus('first submit of an article that was never published (text equal to a live one)', 200, await submit(neverId));

  // What the editor page really does for a live article nobody changed: its final save sends the
  // unchanged text (the first save moves the working copy to "draft"), then it submits.
  const untouchedId = await createArticleInDatabase(fixtures.reporter1Id, STATUS.PUBLISHED, { draft: LIVE_CONTENT, published: LIVE_CONTENT, lastPublishedAt: new Date() });
  checkStatus('editor page, step 1: save the unchanged text of a published article', 200, await request(cookies.reporter1, 'PATCH', `${API}/${untouchedId}/draft`, LIVE_CONTENT));
  const untouchedAnswer = await submit(untouchedId);
  checkStatus('editor page, step 2: submit the unchanged article', 409, untouchedAnswer);
  check(errorOf(untouchedAnswer).includes('There are no changes to submit'), 'the editor page would show "There are no changes to submit"');
  check((await readArticle(untouchedId)).published.body === LIVE_CONTENT.body, 'the published text is still untouched');
}

/**
 * Prepares everything the tests need: finds the seeded users, runs the two safety guards,
 * logs in, and creates articles in each state directly in the database.
 *
 * @returns {Promise<{fixtures: Object, cookies: Object}>}
 */
async function setUp() {
  const reporter1 = await User.findOne({ username: 'reporter1' });
  const reporter2 = await User.findOne({ username: 'reporter2' });
  if (!reporter1 || !reporter2) {
    stopWithMessage('The users reporter1 and reporter2 are missing. Run "npm run seed" on the test database first.');
  }

  await requireSameDatabaseAsServer(reporter1._id);

  const cookies = {
    reporter1: await login('reporter1'),
    reporter2: await login('reporter2'),
    editor: await login('editor'),
  };

  const livePublished = LIVE_CONTENT;
  const fixtures = {
    reporter1Id: reporter1._id,
    otherReporterId: reporter2._id.toString(),
    draftId: await createArticleInDatabase(reporter1._id, STATUS.DRAFT),
    pendingId: await createArticleInDatabase(reporter1._id, STATUS.PENDING),
    returnedId: await createArticleInDatabase(reporter1._id, STATUS.RETURNED, { editorNote: 'Please add a source for the numbers.' }),
    publishedId: await createArticleInDatabase(reporter1._id, STATUS.PUBLISHED, { published: livePublished, lastPublishedAt: new Date() }),
    otherId: await createArticleInDatabase(reporter2._id, STATUS.DRAFT),
  };
  return { fixtures, cookies };
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
    const { fixtures, cookies } = await setUp();
    await testGuestIsBlocked(fixtures);
    await testEditorIsBlocked(fixtures, cookies);
    await testOwnershipAndStatus(fixtures, cookies);
    await testBadIds(fixtures, cookies);
    await testEmptySubmit(fixtures, cookies);
    await testBadBodies(fixtures, cookies);
    await testRoutesThatDoNotExist(fixtures, cookies);
    await testAllowedPaths(fixtures, cookies);
    await testSubmitWithoutChanges(fixtures, cookies);
  } finally {
    // Safety guard 3: delete exactly the articles this script created.
    await Article.deleteMany({ _id: { $in: createdArticleIds.filter(Boolean) } });
  }

  console.log(`${checkCount - failedCount} of ${checkCount} checks passed.`);
  if (knownIssueOpenCount > 0) {
    console.log(`${knownIssueOpenCount} known issue(s) still open (not counted as failures, see the KNOWN ISSUE lines above).`);
  }
  if (knownIssueFixedCount > 0) {
    console.log(`${knownIssueFixedCount} known issue(s) are fixed now: change checkKnownIssue to checkStatus for them.`);
  }
  if (failedCount > 0) {
    console.log(`${failedCount} FAILED.`);
    // Exit code 1 means "failed" to the shell. We set process.exitCode instead of calling
    // process.exit(1) so Node can finish printing and closing the database first.
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    // A StopError is a planned stop (a safety guard or a missing setup step); anything else is a bug.
    console.error(error.name === 'StopError' ? `STOPPED: ${error.message}` : `The test script crashed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => {
    // Only disconnect if we connected: a guard can stop the script before the connection is made,
    // and "Disconnected from MongoDB" in the log would then be misleading.
    if (mongoose.connection.readyState === 1) {
      return disconnectFromDatabase();
    }
    return undefined;
  });
