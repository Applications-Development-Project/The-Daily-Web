/**
 * scripts/seed.js
 *
 * Fills the database with demo data, so every student can run the site with
 * realistic content from day one: "npm run seed".
 *
 * WARNING: it first deletes EVERYTHING in the database named in MONGODB_URI
 * (articles, users, comments, statistics, sessions), then creates fresh data.
 *
 * Version 1 (SM, phase 0): demo users and articles in every status.
 * In phase 2 OS extends it to the full demo data (500+ articles, comments,
 * view statistics for the analytics chart).
 *
 * No password is written in this file or anywhere in the repo: every demo user
 * gets the password from SEED_DEMO_PASSWORD in your own .env, and the script
 * refuses to run without it.
 *
 * Run by: "npm run seed" (see package.json).
 * Related: models/*.js, services/articleWorkflow.js (STATUS), config/database.js.
 * Owner: OS (first version by SM).
 */

// Must run first, so process.env is filled before the files below read it.
require('dotenv').config({ quiet: true });

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { connectToDatabase } = require('../config/database');
const logger = require('../services/logger');
const User = require('../models/User');
const Article = require('../models/Article');
const ArticleViewStats = require('../models/ArticleViewStats');
const DeviceArticleView = require('../models/DeviceArticleView');

// How much work bcrypt does per hash. Each +1 doubles the time, which slows down
// anyone trying to guess passwords from a stolen hash. 10 is the value the whole
// team uses (also in the Users API).
const BCRYPT_ROUNDS = 10;

// The demo accounts. Usernames are simple so they're easy to type in a demo;
// display names are what readers see on articles. The requirements ask for one
// editor and several reporters.
const DEMO_USERS = [
  { username: 'editor', displayName: 'Maya Cohen', role: 'editor' },
  { username: 'reporter1', displayName: 'Dana Levi', role: 'reporter' },
  { username: 'reporter2', displayName: 'Omer Ben-David', role: 'reporter' },
];

/**
 * Deletes every document in every collection of the connected database.
 *
 * We loop over the collections that actually exist instead of listing our models,
 * so data from models this script doesn't import (comments, sessions) is cleared too.
 * We use deleteMany rather than dropping the collections, because dropping would
 * also delete their indexes, including the unique ones.
 *
 * @returns {Promise<void>}
 */
async function clearDatabase() {
  const collections = await mongoose.connection.db.collections();
  for (const collection of collections) {
    await collection.deleteMany({});
  }
}

/**
 * Makes sure every index defined in our models exists before we insert data.
 * On a brand-new database the collections don't exist yet; createIndexes()
 * creates them with their indexes, so for example the unique username rule
 * already applies to the users this script creates.
 *
 * @returns {Promise<void>}
 */
async function createAllIndexes() {
  await User.createIndexes();
  await Article.createIndexes();
  await ArticleViewStats.createIndexes();
  await DeviceArticleView.createIndexes();
}

/**
 * Creates the demo users from DEMO_USERS, all with the same demo password.
 *
 * Only a bcrypt hash is stored, never the password. We hash separately for each
 * user, so even with the same password every user gets a different random salt
 * and therefore a different hash: two equal hashes would reveal equal passwords.
 *
 * @param {string} demoPassword - The password from SEED_DEMO_PASSWORD.
 * @returns {Promise<{editor: Object, reporters: Object[]}>} The saved users,
 *   so the articles can point to their reporter and editor.
 */
async function createDemoUsers(demoPassword) {
  const createdUsers = [];
  for (const demoUser of DEMO_USERS) {
    const passwordHash = await bcrypt.hash(demoPassword, BCRYPT_ROUNDS);
    const user = await User.create({
      username: demoUser.username,
      displayName: demoUser.displayName,
      role: demoUser.role,
      passwordHash: passwordHash,
    });
    createdUsers.push(user);
  }

  return {
    editor: createdUsers.find((user) => user.role === 'editor'),
    reporters: createdUsers.filter((user) => user.role === 'reporter'),
  };
}

/**
 * Closes the database connection so the script can end.
 *
 * @returns {Promise<void>}
 */
async function disconnectFromDatabase() {
  // TEMP until OS changes config/database.js: its "disconnected" listener logs
  // "ERROR Lost connection to MongoDB" even when we disconnect on purpose, which
  // would make every successful seed look like it failed.
  mongoose.connection.removeAllListeners('disconnected');
  await mongoose.disconnect();
}

/**
 * Runs the whole seed: check settings, connect, clear, create indexes.
 *
 * @returns {Promise<void>}
 * @throws {Error} If the database can't be reached or a step fails.
 */
async function runSeed() {
  // Check before touching the database, so a missing setting never leaves
  // the database half cleared.
  if (!process.env.SEED_DEMO_PASSWORD) {
    throw new Error('SEED_DEMO_PASSWORD is not set in .env. Add it, then run "npm run seed" again.');
  }

  await connectToDatabase();

  logger.info(`Clearing database "${mongoose.connection.name}"`);
  await clearDatabase();
  await createAllIndexes();

  const users = await createDemoUsers(process.env.SEED_DEMO_PASSWORD);
  logger.info(`Created 1 editor and ${users.reporters.length} reporters`);

  logger.info('Seed finished');
}

// We set process.exitCode instead of calling process.exit(), so the "finally"
// step still runs and closes the database connection before Node exits.
runSeed()
  .catch((error) => {
    logger.error('Seed failed', error);
    process.exitCode = 1;
  })
  .finally(disconnectFromDatabase);
