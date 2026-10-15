/**
 * config/session.js
 *
 * The session middleware: how the server remembers who is logged in. The browser holds
 * only a signed, random session id; the data (req.session.user = { id, role, displayName })
 * stays on the server, so the role can't be changed in the browser.
 *
 * Sessions are stored in MongoDB, not in memory, so a server restart doesn't log anyone
 * out (a requirement).
 *
 * Used by: app.js.
 * Owner: OS.
 */

const session = require('express-session');
// connect-mongo 6 exports an object; the old "require('connect-mongo')" form no longer works.
const { MongoStore } = require('connect-mongo');
const mongoose = require('mongoose');

// Written once: logging out must clear the cookie by the same name (authController.js).
// The default "connect.sid" would also tell visitors which library we use.
const SESSION_COOKIE_NAME = 'sessionId';

// A login lasts 7 days.
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Mongoose's readyState for "connected".
const MONGOOSE_CONNECTED = 1;

/**
 * Waits until Mongoose is connected, then gives its driver client to connect-mongo, so
 * sessions reuse the same connection instead of opening a second one. It must wait:
 * app.js loads before server.js connects.
 *
 * @returns {Promise<import('mongodb').MongoClient>}
 */
function waitForDatabaseClient() {
  return new Promise((resolve) => {
    if (mongoose.connection.readyState === MONGOOSE_CONNECTED) {
      resolve(mongoose.connection.getClient());
      return;
    }
    mongoose.connection.once('connected', () => {
      resolve(mongoose.connection.getClient());
    });
  });
}

/**
 * Builds the session middleware.
 *
 * @returns {import('express').RequestHandler}
 * @throws {Error} If SESSION_SECRET is missing (the server must not start without it).
 */
function createSessionMiddleware() {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error('SESSION_SECRET is not set. Copy .env.example to .env and fill it in.');
  }

  return session({
    name: SESSION_COOKIE_NAME,

    // Signs the cookie, so nobody can forge one. Only in .env, never in the repo.
    secret: sessionSecret,

    store: MongoStore.create({ clientPromise: waitForDatabaseClient() }),

    // Don't save an unchanged session on every request.
    resave: false,

    // No session until login, so thousands of guest readers create no sessions at all.
    saveUninitialized: false,

    cookie: {
      // Page JavaScript can't read it, so an injected script can't steal it.
      httpOnly: true,
      // Not sent with requests started by other websites (for example a hidden form).
      sameSite: 'lax',
      // connect-mongo also deletes the session in MongoDB at this date.
      maxAge: SESSION_MAX_AGE_MS,
      // true would send it only over HTTPS; we run on http://localhost.
      secure: false,
    },
  });
}

module.exports = { createSessionMiddleware, SESSION_COOKIE_NAME };
