/**
 * config/session.js
 *
 * Creates the express-session middleware: how the server remembers who is logged in
 * between requests. After login, req.session.user = { id, role, displayName }
 * (see "Session and device identity" in "Shared contracts").
 *
 * How it works: the browser only holds a cookie with a random, signed session id.
 * The session data itself (who the user is, their role) stays on the server, in the
 * MongoDB "sessions" collection, so the browser can't read or change the role.
 *
 * Why MongoDB and not the default in-memory store: memory is wiped when the server
 * restarts, which would log everyone out. The requirements say a logged-in user must
 * keep working after a server restart without logging in again.
 *
 * Used by: app.js.
 * Related: config/database.js (we reuse its MongoDB connection), .env.example (SESSION_SECRET).
 * Owner: OS.
 */

const session = require('express-session');
// connect-mongo 6 exports an object, so we take MongoStore out of it with { }.
// (The "const MongoStore = require('connect-mongo')" form from older versions no longer works.)
const { MongoStore } = require('connect-mongo');
const mongoose = require('mongoose');

// How long a login lasts without logging in again: 7 days, in milliseconds.
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Builds the session middleware for app.js.
 *
 * @returns {import('express').RequestHandler} The express-session middleware.
 * @throws {Error} If SESSION_SECRET is missing from .env (the server must not start
 *   with a missing or guessable secret).
 */
function createSessionMiddleware() {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error('SESSION_SECRET is not set. Copy .env.example to .env and fill it in.');
  }

  // Reuse Mongoose's connection instead of opening a second one. asPromise() waits
  // until server.js has connected, then gives us the connection; getClient() is the
  // MongoDB driver client inside it, which is what connect-mongo needs.
  const clientPromise = mongoose.connection.asPromise().then((connection) => connection.getClient());

  return session({
    // Signs the session id cookie. Without the secret nobody can forge a valid cookie.
    secret: sessionSecret,

    store: MongoStore.create({ clientPromise }),

    // Don't save the session again on every request if nothing in it changed.
    resave: false,

    // Don't create a session (or a database document) until something is stored in it,
    // which happens only at login. Thousands of guest readers therefore create no
    // sessions at all; guests are recognised by the separate deviceId cookie instead.
    saveUninitialized: false,

    cookie: {
      // JavaScript in the page can't read the cookie, so an injected script can't steal it.
      httpOnly: true,
      // The browser doesn't send the cookie with requests started by other websites
      // (for example a hidden form that posts to our /api), only with normal links to us.
      sameSite: 'lax',
      // The cookie, and the session in MongoDB, expire after 7 days.
      // connect-mongo uses this same date to delete expired sessions by itself.
      maxAge: SESSION_MAX_AGE_MS,
      // secure: true would send the cookie only over HTTPS. We run on http://localhost,
      // where a secure cookie would never be sent, so it stays false.
      secure: false,
    },
  });
}

module.exports = { createSessionMiddleware };
