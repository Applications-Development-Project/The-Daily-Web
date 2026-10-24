/**
 * app.js
 *
 * Builds the Express application: body parsing, static files, EJS views, sessions, the
 * device cookie, the current user, every router, the 404 handler and the error handler.
 * It does not listen: server.js starts it after the database is connected.
 *
 * Express runs app.use() in the order written, so the order matters:
 *   1. body parsers   (req.body must exist before any controller reads it)
 *   2. static files   (answered before the session, so a stylesheet never costs a MongoDB lookup)
 *   3. session        (req.session)
 *   4. device id      (req.deviceId, for guests too)
 *   5. currentUser    (needs the session; refreshes the role before any permission check)
 *   6. the routers    (pages at "/", APIs at "/api")
 *   7. 404 handler    (reached only if no router answered)
 *   8. errorHandler   (last, so it catches errors from everything above)
 *
 * Called by: server.js.
 * Owner: OS. Shared file.
 */

const path = require('path');
const express = require('express');
const { createSessionMiddleware } = require('./config/session');
const assignDeviceId = require('./middleware/assignDeviceId');
const setCurrentUser = require('./middleware/setCurrentUser');

// Page routers (HTML pages), mounted at "/".
const feedPageRoutes = require('./routes/pageRoutes/feedPageRoutes');
const articlePageRoutes = require('./routes/pageRoutes/articlePageRoutes');
const authPageRoutes = require('./routes/pageRoutes/authPageRoutes');
const reporterPageRoutes = require('./routes/pageRoutes/reporterPageRoutes');
const editorPageRoutes = require('./routes/pageRoutes/editorPageRoutes');
const analyticsPageRoutes = require('./routes/pageRoutes/analyticsPageRoutes');
const userPageRoutes = require('./routes/pageRoutes/userPageRoutes');
const commentPageRoutes = require('./routes/pageRoutes/commentPageRoutes');

// API routers (JSON), mounted at "/api".
const feedApiRoutes = require('./routes/apiRoutes/feedApiRoutes');
const weatherApiRoutes = require('./routes/apiRoutes/weatherApiRoutes');
const authApiRoutes = require('./routes/apiRoutes/authApiRoutes');
const reporterApiRoutes = require('./routes/apiRoutes/reporterApiRoutes');
const editorApiRoutes = require('./routes/apiRoutes/editorApiRoutes');
const analyticsApiRoutes = require('./routes/apiRoutes/analyticsApiRoutes');
const userApiRoutes = require('./routes/apiRoutes/userApiRoutes');
const commentApiRoutes = require('./routes/apiRoutes/commentApiRoutes');

const handleNotFound = require('./middleware/notFoundHandler');
const handleError = require('./middleware/errorHandler');

const app = express();

// res.render('public/feed') loads views/public/feed.ejs.
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// JSON bodies from fetch(). 1mb instead of the default 100kb: an article body may have
// 50,000 characters, and a character can take up to 4 bytes.
app.use(express.json({ limit: '1mb' }));
// Plain HTML form posts (for example the logout form).
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// /css/main.css is answered with public/css/main.css, without reaching any router.
app.use(express.static(path.join(__dirname, 'public')));

app.use(createSessionMiddleware());

// req.deviceId for every request, for the comment limit and the viewed filter.
app.use(assignDeviceId);

// currentUser (or null) for every view, for the header's login state.
app.use(setCurrentUser);

// Router paths are written without the mount prefix: "/articles" in feedApiRoutes.js
// answers "/api/articles".
app.use('/', feedPageRoutes);
app.use('/', articlePageRoutes);
app.use('/', authPageRoutes);
app.use('/', reporterPageRoutes);
app.use('/', editorPageRoutes);
app.use('/', analyticsPageRoutes);
app.use('/', userPageRoutes);
app.use('/', commentPageRoutes);

app.use('/api', feedApiRoutes);
app.use('/api', weatherApiRoutes);
app.use('/api', authApiRoutes);
app.use('/api', reporterApiRoutes);
app.use('/api', editorApiRoutes);
app.use('/api', analyticsApiRoutes);
app.use('/api', userApiRoutes);
app.use('/api', commentApiRoutes);

// These two must stay last. No route matched: a 404 error.
app.use(handleNotFound);
// Every error from above is answered here. Express knows it is an error handler because
// the function has four parameters.
app.use(handleError);

module.exports = app;
