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
const Comment = require('../models/Comment');
const { STATUS } = require('../services/articleWorkflow');

const DAY_MS = 24 * 60 * 60 * 1000;

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

// Fictional headlines and summaries, 7 for each of the 8 categories in
// Article.CATEGORIES. The article body is built from them by buildArticleBody().
const SAMPLE_STORIES = {
  Politics: [
    ['City council approves new public transport budget', 'The plan adds night buses and two light-rail stops, funded over the next four years.'],
    ['Parliament committee debates changes to the election law', 'Members disagree on how to count absentee votes; a final vote is expected next month.'],
    ['First-time voters turn out in record numbers', 'Young voters led the rise in turnout, according to the central elections committee.'],
    ['Government plans to cut paperwork for small businesses', 'Owners will be able to file most permits online starting next year.'],
    ['Opposition calls for a review of housing policy', 'Rents rose faster than wages for the third year in a row.'],
    ['New law requires public bodies to publish their budgets online', 'Every ministry and city must post its spending data in an open format.'],
    ['Mayors meet to coordinate a regional water plan', 'Seven cities agree to share the cost of a new pipeline.'],
  ],
  Economy: [
    ['Central bank keeps interest rate unchanged', 'Inflation slowed for a second month, but the bank says it is too early to cut.'],
    ['Unemployment falls to its lowest level in five years', 'Hiring was strongest in technology, health care and construction.'],
    ['Food prices rise ahead of the holiday season', 'Fruit and vegetables cost on average 6% more than a year ago.'],
    ['Start-up funding recovers after a slow year', 'Local companies raised more in the last quarter than in the first half of the year.'],
    ['New port terminal expected to shorten import times', 'Shipping companies say waiting times could fall by half.'],
    ['Survey: more workers choose hybrid jobs', 'Two out of three office workers now spend at least one day a week at home.'],
    ['Electricity prices to drop slightly next year', 'The regulator points to cheaper solar power and lower gas costs.'],
  ],
  World: [
    ['Climate summit ends with new emissions targets', 'More than 100 countries agree to report their progress every year.'],
    ['Neighbouring countries sign a cross-border rail agreement', 'Passenger trains could run between the two capitals within five years.'],
    ['Aid groups warn of food shortages after floods', 'Heavy rains destroyed crops across a wide region.'],
    ['Space station welcomes a new international crew', 'Four astronauts from three countries will stay for six months.'],
    ['Global tourism returns to pre-pandemic levels', 'Airlines report full flights on most long-haul routes.'],
    ['Ocean treaty enters into force', 'The agreement protects marine life in international waters.'],
    ['World leaders discuss rules for artificial intelligence', 'The talks focus on safety testing and transparency.'],
  ],
  Technology: [
    ['New smartphone battery promises two days of use', 'Engineers say the design charges fully in 20 minutes.'],
    ['Schools add coding classes from first grade', 'The program teaches problem solving through simple games.'],
    ["Cyber attack hits a regional hospital's booking system", 'Patient records were not affected, the hospital says.'],
    ['Electric car sales double in a year', 'Lower prices and more charging stations are behind the jump.'],
    ['City launches free Wi-Fi in public parks', 'The service covers twenty parks and will expand next year.'],
    ['Study: most people reuse the same password', 'Experts recommend a password manager and two-step login.'],
    ['Local start-up builds drones to inspect power lines', 'The drones can find damage before it causes power cuts.'],
  ],
  Science: [
    ["Astronomers find a planet in its star's habitable zone", 'The planet is about one and a half times the size of Earth.'],
    ['Researchers map the brain of a fruit fly in full detail', 'The map shows every one of its 140,000 nerve cells.'],
    ['Ancient village uncovered during road works', 'Archaeologists date the site to about 7,000 years ago.'],
    ['New material pulls drinking water from desert air', 'A prototype produced several litres a day.'],
    ['Coral reefs show signs of recovery', 'Divers counted more young coral than in any year since monitoring began.'],
    ['Scientists grow a tomato that needs less water', 'The plant kept its yield with a third less irrigation.'],
    ['Rare comet visible to the naked eye this week', 'It is best seen just after sunset, low in the western sky.'],
  ],
  Health: [
    ['Flu vaccine campaign starts in clinics', 'Vaccines are free for children, pregnant women and people over 65.'],
    ['Study links short walks after meals to lower blood sugar', 'Ten minutes of walking was enough to see a difference.'],
    ['Hospitals cut emergency room waiting times', 'A new system sends minor cases to nearby clinics.'],
    ['Doctors warn about heat stroke as temperatures climb', 'Drink water often and avoid the sun at midday.'],
    ['New app lets patients book appointments in minutes', 'Over a million people used it in its first month.'],
    ['Researchers test a blood test for early cancer detection', 'Early results are promising, but more trials are needed.'],
    ['Survey: teenagers get too little sleep', 'Most sleep fewer than the recommended eight hours a night.'],
  ],
  Sports: [
    ['National team qualifies for the European championship', 'A late goal sealed a 2-1 win in the final qualifier.'],
    ['City marathon breaks its participation record', 'More than 40,000 runners took part this year.'],
    ['Basketball club signs a young star from the youth league', 'The 19-year-old guard averaged 25 points last season.'],
    ["Women's football league gets a new TV deal", 'Every match will be shown live for the first time.'],
    ['Tennis player wins her first major title', 'She won the final in three sets after losing the first.'],
    ["Mountain stage added to next year's cycling tour", 'The race will finish in the mountains for the first time.'],
    ['Swimmer sets a new national record', 'She broke a record that had stood for twelve years.'],
  ],
  Culture: [
    ['Film festival opens with a record number of premieres', 'Sixty new films will be shown over ten days.'],
    ['City museum reopens after a two-year renovation', 'The new wing doubles the space for modern art.'],
    ['Bestselling novelist announces a new trilogy', 'The first book is due out next spring.'],
    ['Street music festival returns to the old city', 'More than 200 musicians will play on 30 stages.'],
    ['National theatre stages a modern version of a classic', 'The play is set in a present-day tech company.'],
    ['Library launches late-night reading evenings', 'The main branch will stay open until midnight on Thursdays.'],
    ['Photography exhibition shows everyday life in the city', 'The photos were taken by residents over one year.'],
  ],
};

// How many never-published articles of each status to create.
const UNPUBLISHED_ARTICLE_COUNTS = {
  [STATUS.DRAFT]: 6,
  [STATUS.PENDING]: 5,
  [STATUS.RETURNED]: 4,
};

// Live articles (published is not null), grouped by the status of their working
// copy. "status" describes the draft, not whether readers can see the article
// ("Article status rules"), so a live article can also be in draft, pending or returned
// while the reporter works on an update and readers keep seeing the approved version.
const LIVE_ARTICLE_COUNTS = {
  [STATUS.PUBLISHED]: 25, // no update in progress: draft is the same as published
  [STATUS.DRAFT]: 4, // the reporter is editing an update
  [STATUS.PENDING]: 3, // an update is waiting for the editor
  [STATUS.RETURNED]: 3, // the update was returned to the reporter with a note
};

// Notes the editor left on returned articles.
const RETURN_NOTES = [
  'Please add a source for the numbers in the second paragraph.',
  'The title is too long for the front page. Please shorten it to one line.',
  'Add a quote from someone directly involved in the story.',
  'Check the spelling of the names and choose a clearer main image.',
];

/**
 * Picks a random moment between two dates.
 *
 * @param {Date} earliest - The earliest allowed moment.
 * @param {Date} latest - The latest allowed moment.
 * @returns {Date}
 */
function randomDateBetween(earliest, latest) {
  const range = latest.getTime() - earliest.getTime();
  return new Date(earliest.getTime() + Math.random() * range);
}

/**
 * Returns the moment a number of days before now.
 *
 * @param {number} days - How many days back.
 * @returns {Date}
 */
function daysAgo(days) {
  return new Date(Date.now() - days * DAY_MS);
}

/**
 * Builds the full text of a sample article: four paragraphs, separated by a blank
 * line. The body is plain text; the article page decides how to show paragraphs.
 *
 * @param {string} title - The article title.
 * @param {string} summary - The article summary, used as the opening paragraph.
 * @param {string} category - The article category.
 * @returns {string}
 */
function buildArticleBody(title, summary, category) {
  const paragraphs = [
    summary,
    `"${title}" is one of the most discussed ${category.toLowerCase()} stories this week. ` +
      'Our reporters spoke with the people directly involved, and with independent experts, ' +
      'to understand what changed and why it matters.',
    'Supporters say the step is overdue and will make a real difference in daily life. ' +
      'Critics agree the problem is real, but question the timing and the cost, ' +
      'and ask for clear ways to measure the results.',
    'What happens next depends on decisions expected in the coming weeks. ' +
      'We will keep following the story and update this article as new details become available.',
  ];
  return paragraphs.join('\n\n');
}

/**
 * Builds the content object { title, summary, body, imageUrl, category } for
 * sample article number articleNumber.
 *
 * Numbers go round the categories in order (0 Politics, 1 Economy, ... 8 Politics
 * again), so every category gets a similar share, and each number in a category
 * gets the next story, so titles don't repeat until all 56 are used.
 *
 * @param {number} articleNumber - 0, 1, 2... one per article the seed creates.
 * @returns {{title: string, summary: string, body: string, imageUrl: string, category: string}}
 */
function buildArticleContent(articleNumber) {
  const categories = Article.CATEGORIES;
  const category = categories[articleNumber % categories.length];
  const stories = SAMPLE_STORIES[category];
  const [title, summary] = stories[Math.floor(articleNumber / categories.length) % stories.length];

  return {
    title: title,
    summary: summary,
    body: buildArticleBody(title, summary, category),
    // A free placeholder photo service. "seed" makes each article always get the
    // same photo. Images need internet; the site shows a fallback image without it.
    imageUrl: `https://picsum.photos/seed/web-daily-${articleNumber}/800/450`,
    category: category,
  };
}

/**
 * Builds (does not save) one article that was never published: a draft, an
 * article waiting for the editor, or one returned with a note.
 *
 * @param {number} articleNumber - Which sample story to use.
 * @param {string} status - STATUS.DRAFT, STATUS.PENDING or STATUS.RETURNED.
 * @param {Object} reporter - The User who owns the article.
 * @returns {Object} A plain object ready for Article.insertMany().
 */
function buildUnpublishedArticle(articleNumber, status, reporter) {
  const draft = buildArticleContent(articleNumber);

  // Every third draft is left half-written, the way autosave stores them:
  // only a title and an opening paragraph, no summary, image or category yet.
  // (Every third, not every second: reporters also alternate by even/odd number,
  // so "every second" would give all the half-written drafts to the same reporter.)
  if (status === STATUS.DRAFT && articleNumber % 3 === 0) {
    draft.summary = '';
    draft.body = draft.body.split('\n\n')[0];
    draft.imageUrl = '';
    draft.category = '';
  }

  const createdAt = randomDateBetween(daysAgo(14), daysAgo(1));
  return {
    reporter: reporter._id,
    status: status,
    draft: draft,
    published: null,
    editorNote: status === STATUS.RETURNED ? RETURN_NOTES[articleNumber % RETURN_NOTES.length] : '',
    createdAt: createdAt,
    updatedAt: randomDateBetween(createdAt, new Date()),
  };
}

/**
 * Creates the articles that were never published, in the numbers given by
 * UNPUBLISHED_ARTICLE_COUNTS, shared between the reporters in turn.
 *
 * @param {Object[]} reporters - The demo reporters.
 * @param {number} firstArticleNumber - The sample story number to start from.
 * @returns {Promise<number>} How many articles were created.
 */
async function createUnpublishedArticles(reporters, firstArticleNumber) {
  const articles = [];
  let articleNumber = firstArticleNumber;

  for (const [status, count] of Object.entries(UNPUBLISHED_ARTICLE_COUNTS)) {
    for (let i = 0; i < count; i++) {
      const reporter = reporters[articleNumber % reporters.length];
      articles.push(buildUnpublishedArticle(articleNumber, status, reporter));
      articleNumber++;
    }
  }

  // One insertMany is one trip to the database for all the articles, instead of
  // one trip per article. It still checks every article against the schema.
  await Article.insertMany(articles);
  return articles.length;
}

/**
 * Builds the list of approvals of one live article: the first publish and then
 * each update, oldest first, each 1 to 4 days after the previous one.
 * The first publish is 20 to 30 days ago, so even 4 publishes end at least
 * 8 days ago, never in the future, and all fall inside the analytics chart's
 * default 30-day window.
 *
 * @param {number} publishCount - How many times the article was approved (1 to 4).
 * @param {Object} editor - The User who approved it.
 * @returns {{publishedAt: Date, editor: mongoose.Types.ObjectId}[]}
 */
function buildPublishHistory(publishCount, editor) {
  const publishHistory = [];
  let publishedAt = randomDateBetween(daysAgo(30), daysAgo(20));

  for (let i = 0; i < publishCount; i++) {
    if (i > 0) {
      const previous = publishedAt.getTime();
      publishedAt = randomDateBetween(new Date(previous + DAY_MS), new Date(previous + 4 * DAY_MS));
    }
    publishHistory.push({ publishedAt: publishedAt, editor: editor._id });
  }
  return publishHistory;
}

/**
 * Builds the reporter's next version of a live article: a new title and an extra
 * paragraph, so the editor's review page has visible differences to show.
 *
 * @param {Object} publishedContent - The content readers see now.
 * @returns {Object} A new content object; publishedContent is not changed.
 */
function buildUpdatedDraft(publishedContent) {
  // { ...publishedContent } copies the fields into a NEW object. Changing the copy
  // must not change the published version readers see.
  const draft = { ...publishedContent };
  draft.title = `Update: ${publishedContent.title}`;
  draft.body = publishedContent.body +
    '\n\nNew: the reporter is adding the latest developments to this story.';
  return draft;
}

/**
 * Builds (does not save) one live article, with its publish history and, for
 * every status except published, an update in progress in its draft.
 *
 * @param {number} articleNumber - Which sample story to use.
 * @param {string} status - The status of the working copy (see LIVE_ARTICLE_COUNTS).
 * @param {Object} reporter - The User who owns the article.
 * @param {Object} editor - The User who approved it.
 * @returns {Object} A plain object ready for Article.insertMany().
 */
function buildLiveArticle(articleNumber, status, reporter, editor) {
  // About every fourth live article was updated after publishing: published 2 to 4
  // times in total. The rest were published once.
  const publishCount = articleNumber % 4 === 0 ? 2 + (articleNumber % 3) : 1;
  const publishHistory = buildPublishHistory(publishCount, editor);
  const firstPublishedAt = publishHistory[0].publishedAt;
  const lastPublishedAt = publishHistory[publishHistory.length - 1].publishedAt;

  // Each approved update added a short dated paragraph to the live text.
  const published = buildArticleContent(articleNumber);
  for (const publishEvent of publishHistory.slice(1)) {
    const date = publishEvent.publishedAt.toISOString().slice(0, 10);
    published.body += `\n\nUpdated ${date}: new details were added to this story.`;
  }

  // With no update in progress, the working copy equals what readers see.
  const draft = status === STATUS.PUBLISHED ? { ...published } : buildUpdatedDraft(published);

  return {
    reporter: reporter._id,
    status: status,
    draft: draft,
    published: published,
    editorNote: status === STATUS.RETURNED ? RETURN_NOTES[articleNumber % RETURN_NOTES.length] : '',
    firstPublishedAt: firstPublishedAt,
    lastPublishedAt: lastPublishedAt,
    publishHistory: publishHistory,
    // Written up to 2 days before it first went live; last changed at its last
    // approval, or later if the reporter has been working on an update since.
    createdAt: new Date(firstPublishedAt.getTime() - Math.random() * 2 * DAY_MS),
    updatedAt: status === STATUS.PUBLISHED ? lastPublishedAt : randomDateBetween(lastPublishedAt, new Date()),
  };
}

/**
 * Creates the live articles, in the numbers given by LIVE_ARTICLE_COUNTS,
 * shared between the reporters in turn.
 *
 * @param {Object[]} reporters - The demo reporters.
 * @param {Object} editor - The demo editor, recorded as the approver.
 * @param {number} firstArticleNumber - The sample story number to start from.
 * @returns {Promise<number>} How many articles were created.
 */
async function createLiveArticles(reporters, editor, firstArticleNumber) {
  const articles = [];
  let articleNumber = firstArticleNumber;

  for (const [status, count] of Object.entries(LIVE_ARTICLE_COUNTS)) {
    for (let i = 0; i < count; i++) {
      const reporter = reporters[articleNumber % reporters.length];
      articles.push(buildLiveArticle(articleNumber, status, reporter, editor));
      articleNumber++;
    }
  }

  await Article.insertMany(articles);
  return articles.length;
}

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
  await Comment.createIndexes();
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
 * Prints the demo accounts, so whoever ran the seed knows how to log in.
 * The password itself is never printed: terminal output gets copied into chats
 * and screenshots, and the password must stay only in each person's .env.
 *
 * @returns {void}
 */
function printDemoLogins() {
  logger.info('Demo logins (password: SEED_DEMO_PASSWORD from your .env):');
  for (const demoUser of DEMO_USERS) {
    logger.info(`  ${demoUser.username.padEnd(10)} ${demoUser.role.padEnd(9)} ${demoUser.displayName}`);
  }
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

  const unpublishedCount = await createUnpublishedArticles(users.reporters, 0);
  logger.info(`Created ${unpublishedCount} articles that were never published (draft, pending, returned)`);

  // Continue the story numbers after the unpublished articles, so no title repeats.
  const liveCount = await createLiveArticles(users.reporters, users.editor, unpublishedCount);
  logger.info(`Created ${liveCount} live articles`);

  logger.info(`Seed finished: ${unpublishedCount + liveCount} articles in total`);
  printDemoLogins();
}

// We set process.exitCode instead of calling process.exit(), so the "finally"
// step still runs and closes the database connection before Node exits.
runSeed()
  .catch((error) => {
    logger.error('Seed failed', error);
    process.exitCode = 1;
  })
  .finally(disconnectFromDatabase);
