/**
 * config/database.js
 *
 * Opens and closes the MongoDB connection (Mongoose, MONGODB_URI from .env). Mongoose
 * keeps one shared connection, so every model can use it after connectToDatabase().
 *
 * Called by: server.js, scripts/seed.js and the test scripts.
 * Owner: OS.
 */

const mongoose = require('mongoose');
const logger = require('../services/logger');

// 5 seconds instead of the default 30, so "MongoDB is not running" shows up quickly.
const SERVER_SELECTION_TIMEOUT_MS = 5000;

/**
 * Logs an unexpected lost connection. A named function, so it can be removed exactly.
 *
 * @returns {void}
 */
function logLostConnection() {
  logger.error('Lost connection to MongoDB');
}

/**
 * Opens the connection. Only the database name is logged, never the connection string
 * (an Atlas string contains a password).
 *
 * @returns {Promise<void>}
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

  // Added only after a successful connect: Mongoose also fires "disconnected" when the
  // first attempt fails, and "lost connection" would then be misleading. Mongoose
  // reconnects by itself.
  mongoose.connection.on('disconnected', logLostConnection);
}

/**
 * Closes the connection on purpose (for example at the end of the seed). Our listener is
 * removed first, so a planned disconnect isn't logged as "Lost connection".
 *
 * @returns {Promise<void>}
 */
async function disconnectFromDatabase() {
  mongoose.connection.off('disconnected', logLostConnection);
  await mongoose.disconnect();
  logger.info('Disconnected from MongoDB');
}

module.exports = { connectToDatabase, disconnectFromDatabase };
