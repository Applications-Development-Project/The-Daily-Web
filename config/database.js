/**
 * config/database.js
 *
 * Connects the app to MongoDB through Mongoose, using MONGODB_URI from .env.
 * Mongoose keeps one shared connection for the whole process, so after this runs
 * every model (User, Article, Comment...) can read and write without connecting again.
 *
 * Called by: server.js, before the server starts listening.
 * Related: services/logger.js (logs the result), .env.example (MONGODB_URI).
 * Owner: OS.
 */

const mongoose = require('mongoose');
const logger = require('../services/logger');

// How long to keep trying to reach MongoDB before giving up. The default is
// 30 seconds; 5 seconds makes "MongoDB is not running" show up quickly.
const SERVER_SELECTION_TIMEOUT_MS = 5000;

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
  mongoose.connection.on('disconnected', () => {
    logger.error('Lost connection to MongoDB');
  });
}

module.exports = { connectToDatabase };
