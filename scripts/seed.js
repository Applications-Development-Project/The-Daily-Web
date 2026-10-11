/**
 * scripts/seed.js
 *
 * Fills the database with demo data, so every student can run the site with
 * realistic content from day one: "npm run seed".
 *
 * WARNING: it first deletes EVERYTHING in the database named in MONGODB_URI
 * (articles, users, comments, statistics, sessions), then creates fresh data.
 *
 * Version 1 (SM, phase 0): demo users and about 50 articles in every status.
 * Version 2 (OS, phase 2): the full demo data the requirements ask for: one editor,
 * several reporters and 500+ articles in every status and category, so search, the
 * filters and infinite scroll can be shown on a realistic amount of data; live articles
 * updated several times after publishing; guest comments on most live articles; and
 * hourly view statistics for the last 30 days, with a clear jump after every publish,
 * for the Impact Analytics chart. It takes a few seconds (about 226,000 view counters).
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

const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { connectToDatabase, disconnectFromDatabase } = require('../config/database');
const logger = require('../services/logger');
const User = require('../models/User');
const Article = require('../models/Article');
const ArticleViewStats = require('../models/ArticleViewStats');
const DeviceArticleView = require('../models/DeviceArticleView');
const Comment = require('../models/Comment');
const { STATUS } = require('../services/articleWorkflow');
// getHourStart is the same function recordView uses to round a real view down to its
// hour (UTC), so seeded counters and counters from real visits use the same hourStart
// values and add up in the same documents.
const { getHourStart, DEFAULT_RANGE_DAYS } = require('../services/viewTracker');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// How much work bcrypt does per hash. Each +1 doubles the time, which slows down
// anyone trying to guess passwords from a stolen hash. 10 is the value the whole
// team uses (also in the Users API).
const BCRYPT_ROUNDS = 10;

// The demo accounts. Usernames are simple so they're easy to type in a demo;
// display names are what readers see on articles. The requirements ask for one
// editor and several reporters. scripts/testReporterApi.js (EZ) logs in as editor,
// reporter1 and reporter2, so those three usernames must stay.
const DEMO_USERS = [
  { username: 'editor', displayName: 'Maya Cohen', role: 'editor' },
  { username: 'reporter1', displayName: 'Dana Levi', role: 'reporter' },
  { username: 'reporter2', displayName: 'Omer Ben-David', role: 'reporter' },
  { username: 'reporter3', displayName: 'Noa Friedman', role: 'reporter' },
  { username: 'reporter4', displayName: 'Yossi Mizrahi', role: 'reporter' },
  { username: 'reporter5', displayName: 'Tamar Avraham', role: 'reporter' },
];

// Places put in front of a sample headline ("Haifa: City council approves ..."), the
// way news sites mark local stories. There are 56 sample stories, so without this a
// 500-article seed would repeat each headline about nine times, and searching for one
// would show nine identical results. 10 places x 56 stories = 560 different titles.
const STORY_PLACES = [
  'Jerusalem', 'Tel Aviv', 'Haifa', 'Beersheba', 'Eilat',
  'Nazareth', 'Ashdod', 'Netanya', 'Tiberias', 'Rishon LeZion',
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
// Together with LIVE_ARTICLE_COUNTS: 70 + 440 = 510 articles, above the 500 the
// requirements ask for, most of them published (as on a real news site).
const UNPUBLISHED_ARTICLE_COUNTS = {
  [STATUS.DRAFT]: 30,
  [STATUS.PENDING]: 25,
  [STATUS.RETURNED]: 15,
};

// Live articles (published is not null), grouped by the status of their working
// copy. "status" describes the draft, not whether readers can see the article
// ("Article status rules"), so a live article can also be in draft, pending or returned
// while the reporter works on an update and readers keep seeing the approved version.
const LIVE_ARTICLE_COUNTS = {
  [STATUS.PUBLISHED]: 400, // no update in progress: draft is the same as published
  [STATUS.DRAFT]: 15, // the reporter is editing an update
  [STATUS.PENDING]: 15, // an update is waiting for the editor
  [STATUS.RETURNED]: 10, // the update was returned to the reporter with a note
};

// Notes the editor left on returned articles.
const RETURN_NOTES = [
  'Please add a source for the numbers in the second paragraph.',
  'The title is too long for the front page. Please shorten it to one line.',
  'Add a quote from someone directly involved in the story.',
  'Check the spelling of the names and choose a clearer main image.',
];

// Names readers typed on their comments. Guests have no accounts, so a comment only
// stores the name as typed (see models/Comment.js).
const COMMENT_AUTHOR_NAMES = [
  'Noa', 'Avi', 'Shira K.', 'Daniel', 'Michal', 'Eitan', 'Rina', 'Yonatan', 'Lea',
  'Amir', 'Talia', 'Guy', 'Hila B.', 'Ron', 'Maya', 'Itai', 'Dafna', 'Oren',
];

// Comment texts, general enough to fit any article.
const COMMENT_TEXTS = [
  'Great article, thank you for the clear explanation.',
  'I did not know about this. Thanks for sharing!',
  'Interesting, but I would like to see more numbers.',
  'Finally someone is writing about this.',
  'I disagree with the second paragraph, but the reporting is good.',
  'Can you write a follow-up when there is news?',
  'This affects my family directly. Thank you for covering it.',
  'Well written and to the point.',
  'Is there an official source for this?',
  'I hope the decision makers read this.',
  'My neighbours were talking about this just yesterday.',
  'Short and clear, exactly what I needed.',
  'The photo says it all.',
  'Let us see what happens next month.',
];

// One seeded comment contains HTML on purpose, so the defense can show that text
// typed by readers is always displayed as plain text and never runs: the article page
// prints comments with the escaping <%= %> tag, and the browser scripts use
// textContent (public/js/articleComments.js, public/js/commentModeration.js).
const XSS_DEMO_COMMENT = {
  authorName: '<b>Test reader</b>',
  text: '<script>alert("hacked")</script> If you can read this tag, the page is safe.',
};

// About 7 in 10 live articles get comments; the rest have none, so the article page's
// "No comments yet." state can be shown too. Most get a few, every 25th a lot.
const SHARE_OF_ARTICLES_WITH_COMMENTS = 0.7;
const MAX_COMMENTS_ON_A_NORMAL_ARTICLE = 6;
const COMMENTS_ON_A_POPULAR_ARTICLE = 25;

// View statistics: hourly counters (models/ArticleViewStats.js) for the analytics
// chart's default range (DEFAULT_RANGE_DAYS in services/viewTracker.js, 30 days).
// The counters are counted back from the moment the seed runs, so the chart shows
// data right up to that moment, which is why the plan says to re-seed shortly before
// the defense.
const VIEW_STATS_DAYS = DEFAULT_RANGE_DAYS;

// The shape of one article's views per hour (see expectedViewsInHour):
// - an everyday level of 1 to 5 views an hour, and every 10th article 5 times that,
//   so "sort by popularity" has clear winners;
// - a jump after each publish that fades by half about every 12 hours, so the chart
//   shows a clear change around every publish marker. An update gets a smaller jump
//   than the first publish, but still easy to see.
const MIN_BASE_VIEWS_PER_HOUR = 1;
const MAX_BASE_VIEWS_PER_HOUR = 5;
const POPULAR_ARTICLE_FACTOR = 5;
const FIRST_PUBLISH_JUMP = 40;
const UPDATE_JUMP = 25;
const JUMP_HALF_LIFE_HOURS = 12;

// Israel is 2 or 3 hours ahead of UTC; 3 is close enough for a day/night rhythm.
const LOCAL_TIME_OFFSET_HOURS = 3;

// The counters are saved in batches of this many documents. One insertMany per batch
// keeps the number of trips to the database small, while no single request to MongoDB
// gets too big.
const VIEW_STATS_BATCH_SIZE = 10000;

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
 * gets the next story. After all 56 stories are used, the next round puts the next
 * place from STORY_PLACES in front of the title, so titles don't repeat until 560
 * articles (the first round has no place, so the original headlines stay too).
 *
 * @param {number} articleNumber - 0, 1, 2... one per article the seed creates.
 * @returns {{title: string, summary: string, body: string, imageUrl: string, category: string}}
 */
function buildArticleContent(articleNumber) {
  const categories = Article.CATEGORIES;
  const category = categories[articleNumber % categories.length];
  const stories = SAMPLE_STORIES[category];
  const storyNumber = Math.floor(articleNumber / categories.length);
  const [headline, summary] = stories[storyNumber % stories.length];

  // Which round of the 56 stories this is: 0 for the first, 1 for the second...
  const round = Math.floor(storyNumber / stories.length);
  const title = round === 0 ? headline : `${STORY_PLACES[(round - 1) % STORY_PLACES.length]}: ${headline}`;

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
  // (Reporters take articles in turn by number, so every reporter gets some.)
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
 *
 * An article with updates is first published 17 to 27 days ago, so even 4 publishes
 * (at most 3 x 4 days later) end at least 5 days ago, never in the future, and all of
 * them fall inside the analytics chart's default 30-day window, where the editor can
 * see each one. 27, not 30, leaves a few days of margin: the chart counts its 30 days
 * back from when it is opened, which can be a day or two after the seed ran.
 * An article published only once can be from any moment in the last 60 days (up to
 * an hour ago), so sorting the feed by date shows a realistic spread of old and new.
 *
 * @param {number} publishCount - How many times the article was approved (1 to 4).
 * @param {Object} editor - The User who approved it.
 * @returns {{publishedAt: Date, editor: mongoose.Types.ObjectId}[]}
 */
function buildPublishHistory(publishCount, editor) {
  const publishHistory = [];
  let publishedAt = publishCount === 1
    ? randomDateBetween(daysAgo(60), new Date(Date.now() - HOUR_MS))
    : randomDateBetween(daysAgo(27), daysAgo(17));

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
 * Picks a random item of a list.
 *
 * @param {Array} list - A list with at least one item.
 * @returns {*} One of its items.
 */
function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * Builds (does not save) one comment on a live article, written by a guest at a
 * random moment between the article's first publish and now. A comment can only be
 * posted on a live article, so it can never be older than the article's first publish.
 *
 * @param {Object} article - A live article (needs _id and firstPublishedAt).
 * @param {{authorName: string, text: string}} [content] - Fixed name and text; random if left out.
 * @returns {Object} A plain object ready for Comment.insertMany().
 */
function buildComment(article, content) {
  const createdAt = randomDateBetween(article.firstPublishedAt, new Date());
  return {
    article: article._id,
    authorName: content ? content.authorName : pickRandom(COMMENT_AUTHOR_NAMES),
    text: content ? content.text : pickRandom(COMMENT_TEXTS),
    // Each comment comes from its own made-up browser, in the same UUID shape that
    // middleware/assignDeviceId.js gives real ones.
    deviceId: crypto.randomUUID(),
    createdAt: createdAt,
    updatedAt: createdAt,
  };
}

/**
 * Creates guest comments on about 70% of the live articles (see the numbers above),
 * plus the one XSS demo comment on the newest live article, where it is easy to find.
 *
 * @returns {Promise<number>} How many comments were created.
 */
async function createComments() {
  // The live articles, newest first. Only the two fields buildComment needs are loaded.
  const liveArticles = await Article.find({ published: { $ne: null } })
    .sort({ lastPublishedAt: -1 })
    .select('_id firstPublishedAt')
    .lean();

  const comments = [buildComment(liveArticles[0], XSS_DEMO_COMMENT)];

  liveArticles.forEach((article, index) => {
    if (Math.random() >= SHARE_OF_ARTICLES_WITH_COMMENTS) {
      return;
    }
    const commentCount = index % 25 === 0
      ? COMMENTS_ON_A_POPULAR_ARTICLE
      : 1 + Math.floor(Math.random() * MAX_COMMENTS_ON_A_NORMAL_ARTICLE);
    for (let i = 0; i < commentCount; i++) {
      comments.push(buildComment(article));
    }
  });

  // One insertMany for all the comments, as for the articles. Mongoose keeps the
  // createdAt values we give here, because this is a new document, not an update.
  await Comment.insertMany(comments);
  return comments.length;
}

/**
 * How many views an article gets on average in one hour.
 *
 * @param {Date} hourStart - The hour.
 * @param {number} baseViews - The article's everyday views per hour.
 * @param {Date[]} publishDates - When the editor approved it, oldest first.
 * @returns {number} The expected number of views (not rounded).
 */
function expectedViewsInHour(hourStart, baseViews, publishDates) {
  // Day and night: readers are awake from about 7:00 to 23:00 local time.
  const localHour = (hourStart.getUTCHours() + LOCAL_TIME_OFFSET_HOURS) % 24;
  const timeOfDayFactor = localHour >= 7 && localHour < 23 ? 1 : 0.3;

  // Each publish so far adds a jump that halves every JUMP_HALF_LIFE_HOURS hours.
  let jumpViews = 0;
  publishDates.forEach((publishedAt, index) => {
    const hoursSincePublish = (hourStart.getTime() - publishedAt.getTime()) / HOUR_MS;
    if (hoursSincePublish < 0) {
      return;
    }
    const jumpSize = index === 0 ? FIRST_PUBLISH_JUMP : UPDATE_JUMP;
    jumpViews += jumpSize * Math.pow(0.5, hoursSincePublish / JUMP_HALF_LIFE_HOURS);
  });

  return (baseViews + jumpViews) * timeOfDayFactor;
}

/**
 * Builds (does not save) the hourly counters of one live article, from the hour it was
 * first published (or VIEW_STATS_DAYS ago, if that is later) up to the current hour.
 * Hours with no views get no counter at all, exactly as with real visits: recordView
 * only creates a counter when a view happens.
 *
 * @param {Object} article - A live article (needs _id, firstPublishedAt, publishHistory).
 * @param {number} articleIndex - Its position in the list, to pick the popular ones.
 * @returns {{counters: Object[], totalViews: number}} The counters and their sum.
 */
function buildViewCounters(article, articleIndex) {
  const popularityFactor = articleIndex % 10 === 0 ? POPULAR_ARTICLE_FACTOR : 1;
  const baseViews = popularityFactor *
    (MIN_BASE_VIEWS_PER_HOUR + Math.random() * (MAX_BASE_VIEWS_PER_HOUR - MIN_BASE_VIEWS_PER_HOUR));
  const publishDates = article.publishHistory.map((publishEvent) => publishEvent.publishedAt);

  const firstHour = getHourStart(new Date(Math.max(article.firstPublishedAt.getTime(), daysAgo(VIEW_STATS_DAYS).getTime())));
  const currentHour = getHourStart(new Date());

  const counters = [];
  let totalViews = 0;
  for (let time = firstHour.getTime(); time <= currentHour.getTime(); time += HOUR_MS) {
    const hourStart = new Date(time);
    // Random noise of +-30%, so the line looks like real traffic, not a formula.
    const noise = 0.7 + Math.random() * 0.6;
    const views = Math.round(expectedViewsInHour(hourStart, baseViews, publishDates) * noise);
    if (views > 0) {
      counters.push({ article: article._id, hourStart: hourStart, views: views });
      totalViews += views;
    }
  }
  return { counters, totalViews };
}

/**
 * Creates the hourly view counters of every live article for the last VIEW_STATS_DAYS
 * days, and sets each article's totalViews to the sum of its counters, so "sort by
 * popularity" in the feed agrees with what the analytics chart shows.
 *
 * DeviceArticleView ("which device saw which article") is not seeded: it only means
 * something for real browsers, whose device ids we can't know in advance.
 *
 * @returns {Promise<number>} How many counters were created.
 */
async function createViewStats() {
  const liveArticles = await Article.find({ published: { $ne: null } })
    .select('_id firstPublishedAt publishHistory')
    .lean();

  let counters = [];
  let counterCount = 0;
  const totalViewsUpdates = [];

  for (const [index, article] of liveArticles.entries()) {
    const result = buildViewCounters(article, index);
    counters = counters.concat(result.counters);
    totalViewsUpdates.push({
      updateOne: { filter: { _id: article._id }, update: { $set: { totalViews: result.totalViews } } },
    });

    // Save a full batch as soon as there is one, so the script never holds all
    // the counters in memory at once.
    if (counters.length >= VIEW_STATS_BATCH_SIZE) {
      await ArticleViewStats.insertMany(counters);
      counterCount += counters.length;
      counters = [];
    }
  }
  if (counters.length > 0) {
    await ArticleViewStats.insertMany(counters);
    counterCount += counters.length;
  }

  // bulkWrite sends all 440 totalViews updates to MongoDB in one request.
  await Article.bulkWrite(totalViewsUpdates);
  return counterCount;
}

/**
 * Deletes every document in every collection of the connected database.
 *
 * We loop over the collections that actually exist instead of listing our models,
 * so collections that have no model here (the "sessions" collection) are cleared too.
 * Clearing "sessions" logs everyone out, which is what we want: the old sessions point
 * to user ids that no longer exist after the seed.
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

  const commentCount = await createComments();
  logger.info(`Created ${commentCount} comments on live articles`);

  const viewCounterCount = await createViewStats();
  logger.info(`Created ${viewCounterCount} hourly view counters for the last ${VIEW_STATS_DAYS} days`);

  logger.info(`Seed finished: ${unpublishedCount + liveCount} articles in total`);
  printDemoLogins();
}

// We set process.exitCode instead of calling process.exit(), so the "finally"
// step still runs and closes the database connection before Node exits.
// disconnectFromDatabase (config/database.js) closes it without logging a false
// "Lost connection" error.
runSeed()
  .catch((error) => {
    logger.error('Seed failed', error);
    process.exitCode = 1;
  })
  .finally(disconnectFromDatabase);
