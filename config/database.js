/**
 * config/database.js
 *
 * Opens and closes the app's connection to MongoDB through Mongoose, using
 * MONGODB_URI from .env. Mongoose keeps one shared connection for the whole process,
 * so after connectToDatabase() runs every model (User, Article, Comment...) can read
 * and write without connecting again.
 *
 * Called by: server.js (connect, before the server starts listening) and
 * scripts/seed.js (connect, then disconnect when the seed is done).
 * Related: services/logger.js (logs the result), .env.example (MONGODB_URI).
 * Owner: OS.
 */

const mongoose = require('mongoose');
const logger = require('../services/logger');

// How long to keep trying to reach MongoDB before giving up. The default is
// 30 seconds; 5 seconds makes "MongoDB is not running" show up quickly.
const SERVER_SELECTION_TIMEOUT_MS = 5000;

/**
 * Logs that the connection to MongoDB was lost unexpectedly. It is a named function
 * (not an inline arrow) so disconnectFromDatabase() can remove exactly this listener.
 *
 * @returns {void}
 */
function logLostConnection() {
  logger.error('Lost connection to MongoDB');
}

/**
 * Opens the Mongoose connection to MongoDB.
 *
 * We never log the connection string itself, because an Atlas string contains
 * a password. We log only the database name.
 *
 * @returns {Promise<void>} Resolves once the connection is open.
 * @throws {Error} If MONGODB_URI is missing, or MongoDB can't be reached in time.
 */
async function connectToDatabase() {
  const databaseUri = process.env.MONGODB_URI;
  if (!databaseUri) {
    throw new Error('MONGODB_URI is not set. Copy .env.example to .env and fill it in.');
  }

  await mongoose.connect(databaseUri, {
    serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
  });
  logger.info(`Connected to MongoDB (database "${mongoose.connection.name}")`);

  // A lost connection while the server runs is an important operational event,
  // so we log it. Mongoose reconnects by itself when MongoDB comes back.
  // We add this listener only after a successful connect, because Mongoose also
  // fires "disconnected" when the very first attempt fails, and "lost connection"
  // would be a misleading message in that case.
  mongoose.connection.on('disconnected', logLostConnection);
}

/**
 * Closes the connection on purpose, for example when the seed script is done.
 *
 * Mongoose fires "disconnected" for a planned disconnect too, so we first remove
 * our own listener; otherwise every successful seed would end with a false
 * "ERROR Lost connection to MongoDB". We remove only our listener (not all
 * "disconnected" listeners), so we never switch off something another file added.
 *
 * @returns {Promise<void>} Resolves once the connection is closed.
 */
async function disconnectFromDatabase() {
  mongoose.connection.off('disconnected', logLostConnection);
  await mongoose.disconnect();
  logger.info('Disconnected from MongoDB');
}

module.exports = { connectToDatabase, disconnectFromDatabase };
