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

// Name of the session cookie. Written once here, because logging out must clear
// the cookie by the same name (controllers/authController.js imports it).
// The default name, "connect.sid", would also tell visitors which library we use.
const SESSION_COOKIE_NAME = 'sessionId';

// How long a login lasts without logging in again: 7 days, in milliseconds.
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Mongoose's readyState value meaning "connected".
const MONGOOSE_CONNECTED = 1;

/**
 * Waits until Mongoose is connected, then gives back the MongoDB driver client
 * inside it, which is what connect-mongo needs. This lets the session store reuse
 * Mongoose's connection instead of opening a second one.
 *
 * Why we need to wait: app.js (and so this file) is loaded before server.js connects
 * to the database. If we asked for the client right away, it wouldn't exist yet.
 * (Mongoose's own asPromise() doesn't help here: before connect() has been called it
 * resolves immediately, with no client.)
 *
 * @returns {Promise<import('mongodb').MongoClient>} Resolves once Mongoose is connected.
 */
function waitForDatabaseClient() {
  return new Promise((resolve) => {
    if (mongoose.connection.readyState === MONGOOSE_CONNECTED) {
      resolve(mongoose.connection.getClient());
      return;
    }
    // "connected" fires when config/database.js finishes connecting.
    mongoose.connection.once('connected', () => {
      resolve(mongoose.connection.getClient());
    });
  });
}

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

  return session({
    name: SESSION_COOKIE_NAME,

    // Signs the session id cookie. Without the secret nobody can forge a valid cookie.
    secret: sessionSecret,

    // Sessions are saved in the "sessions" collection, through Mongoose's connection.
    store: MongoStore.create({ clientPromise: waitForDatabaseClient() }),

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

module.exports = { createSessionMiddleware, SESSION_COOKIE_NAME };
