/**
 * server.js
 *
 * The entry point ("npm start"): loads .env, connects to MongoDB, then starts listening.
 * It connects first because every page, API and login session needs the database.
 * app.js builds the app and this file runs it, so a script can load the app without
 * opening a port.
 *
 * Related: app.js, config/database.js, services/logger.js.
 * Owner: OS. Shared file.
 */

// First: the files required below read process.env. quiet: no dotenv message.
require('dotenv').config({ quiet: true });

const app = require('./app');
const { connectToDatabase } = require('./config/database');
const logger = require('./services/logger');

const DEFAULT_PORT = 3000;

/**
 * Connects to the database, then listens. If either step fails, logs why and exits with
 * code 1 (anything but 0 tells whoever started the process that startup failed).
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

  // Express 5 passes an error here if the port can't be used (for example it is taken).
  app.listen(port, (error) => {
    if (error) {
      logger.error(`Server not started: could not listen on port ${port}`, error);
      process.exit(1);
    }
    logger.info(`Server listening on http://localhost:${port}`);
  });
}

startServer();
