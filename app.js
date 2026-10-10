/**
 * app.js
 *
 * Builds and configures the Express application: how request bodies are read,
 * where static files and EJS views live, the 404 handler and the error handler,
 * and (in later steps) sessions, the device cookie and every router.
 * It does NOT start listening; server.js does that after the database is connected.
 * Keeping the two apart means the app can be loaded without opening a port.
 *
 * Express runs app.use() middleware in the order it is written in this file,
 * so the order below matters.
 *
 * Called by: server.js.
 * Owner: OS. Shared file: after phase 0, change it only in a small, separate pull request.
 */

const path = require('path');
const express = require('express');
const handleNotFound = require('./middleware/notFoundHandler');
const handleError = require('./middleware/errorHandler');

const app = express();

// Views: res.render('public/feed') loads views/public/feed.ejs.
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Request bodies.
// express.json() reads JSON bodies sent by fetch() into req.body. The default size
// limit is 100kb; an article body may have up to 50,000 characters, and a non-English
// character can take up to 4 bytes, so we allow 1mb to be safe.
app.use(express.json({ limit: '1mb' }));
// express.urlencoded() reads plain HTML form posts (for example the logout form).
// extended: false is enough because our forms only send simple name=value fields.
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Static files: a request for /css/main.css is answered with public/css/main.css,
// without reaching any router.
app.use(express.static(path.join(__dirname, 'public')));

// The last two must stay at the end, after every router:
// 1. No route matched: turn the request into a 404 error.
app.use(handleNotFound);
// 2. Every error from anywhere above (including that 404) is answered here.
//    Express knows it is an error handler because the function has four parameters.
app.use(handleError);

module.exports = app;
