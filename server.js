/**
 * server.js
 *
 * Entry point of the application ("npm start" runs this file). It does three
 * things, in this order:
 *   1. Loads settings from .env into process.env.
 *   2. Connects to MongoDB.
 *   3. Starts the HTTP server.
 * We connect before listening because every page and API reads the database
 * (and, from phase 2, every session is stored there too), so there is no point
 * accepting requests we can't answer.
 *
 * Related: app.js (the Express app), config/database.js, services/logger.js.
 * Owner: OS. Shared file: after phase 0, change it only in a small, separate pull request.
 */

// Must run first: the files required below read process.env, so .env has to be
// loaded before them. quiet: true stops dotenv from printing its own message.
require('dotenv').config({ quiet: true });

const app = require('./app');
const { connectToDatabase } = require('./config/database');
const logger = require('./services/logger');

const DEFAULT_PORT = 3000;

/**
 * Connects to the database, then starts listening for HTTP requests.
 * If either step fails we log why and stop the process with exit code 1,
 * because a server without a database or without a port can't do anything useful.
 *
 * @returns {Promise<void>}
 */
async function startServer() {
  const port = Number(process.env.PORT) || DEFAULT_PORT;

  try {
    await connectToDatabase();
  } catch (error) {
    logger.error('Server not started: could not connect to MongoDB. Is MongoDB running?', error);
    process.exit(1);
  }

  // In Express 5 this callback also receives an error if the port can't be used,
  // for example when another server is already running on it.
  app.listen(port, (error) => {
    if (error) {
      logger.error(`Server not started: could not listen on port ${port}`, error);
      process.exit(1);
    }
    logger.info(`Server listening on http://localhost:${port}`);
  });
}

startServer();
