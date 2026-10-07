/**
 * models/Article.js
 *
 * Mongoose model for news articles. Fields follow "Data models" in "Shared contracts".
 *
 * The key design: every article holds TWO copies of its content.
 * - draft:     the working copy. Reporters (autosave) and editors edit only this one.
 * - published: the copy readers see, or null if the article was never approved.
 * Approving copies draft into published. Because the public site reads only
 * "published", a reporter can edit a live article for days and readers keep seeing
 * the last approved version until the editor approves the new one (requirements:
 * "editing an article that was already published").
 *
 * "status" describes the draft, not whether the article is live. An article is
 * live whenever published is not null. Which status changes are allowed is decided
 * in services/articleWorkflow.js (canTransition), not here.
 *
 * Used by: the feed, article page, reporter and editor controllers, scripts/seed.js.
 * Related: models/User.js (reporter, publishHistory.editor), models/Comment.js,
 * models/ArticleViewStats.js and models/DeviceArticleView.js (all point to an article).
 * Owner: shared file, first version by SM. Change it only in a small, separate pull request.
 */

const mongoose = require('mongoose');

// The fixed category list from "Shared contracts". It is written only here;
// other files (feed filter, reporter form, seed) read it as Article.CATEGORIES.
const ARTICLE_CATEGORIES = [
  'Politics',
  'Economy',
  'World',
  'Technology',
  'Science',
  'Health',
  'Sports',
  'Culture',
];

/**
 * Checks a category value. An empty string is allowed because a reporter may
 * not have chosen a category yet while the draft is being written; submitting
 * for approval requires a real category (checked in the reporter controller).
 *
 * @param {string} category - The value about to be saved.
 * @returns {boolean} true if it is empty or one of ARTICLE_CATEGORIES.
 */
function isEmptyOrKnownCategory(category) {
  return category === '' || ARTICLE_CATEGORIES.includes(category);
}

// The "content object" from the contract: { title, summary, body, imageUrl, category }.
// The same shape is used for both draft and published, so approving is a plain copy.
// _id: false because this is part of the article, not a document of its own.
//
// Fields default to '' so a brand-new draft is valid while still empty (autosave
// saves half-written drafts). The length limits match the reporter's autosave
// validation; the controllers give the friendly error first, and these limits are
// a second safety net so nothing too long can reach the database by any route.
// We don't use trim here: autosave runs while the reporter types, and trimming
// would remove a space they just typed at the end of a sentence.
const articleContentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: '',
      maxlength: [200, 'Title can be at most 200 characters'],
    },
    summary: {
      type: String,
      default: '',
      maxlength: [500, 'Summary can be at most 500 characters'],
    },
    body: {
      type: String,
      default: '',
      maxlength: [50000, 'Body can be at most 50,000 characters'],
    },
    // Images are stored as links, not uploaded files. Checking that it is an
    // http(s) address is done in the controllers.
    imageUrl: {
      type: String,
      default: '',
      maxlength: [2000, 'Image URL can be at most 2,000 characters'],
    },
    category: {
      type: String,
      default: '',
      validate: {
        validator: isEmptyOrKnownCategory,
        message: 'Unknown category',
      },
    },
  },
  { _id: false }
);

// One entry per approval: when it was published and by which editor. The analytics
// chart draws a marker at every publishedAt, so the editor can compare views before
// and after each update.
const publishEventSchema = new mongoose.Schema(
  {
    publishedAt: { type: Date, required: true },
    editor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false }
);

const articleSchema = new mongoose.Schema(
  {
    // The reporter who owns the article. Set from the logged-in session when the
    // article is created, never from the request body, so nobody can create an
    // article in someone else's name.
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Reporter is required'],
    },

    // State of the working copy. These four values must match STATUS in
    // services/articleWorkflow.js; enum makes Mongoose reject any other value before saving.
    status: {
      type: String,
      enum: {
        values: ['draft', 'pending', 'published', 'returned'],
        message: 'Unknown article status',
      },
      default: 'draft',
    },

    // The working copy. default: () => ({}) creates an empty content object for every
    // new article (a function, so each article gets its own object, not a shared one).
    draft: {
      type: articleContentSchema,
      default: () => ({}),
    },

    // What readers see. null means the article has never been approved.
    published: {
      type: articleContentSchema,
      default: null,
    },

    // The editor's explanation when an article is returned for corrections.
    // Cleared again when the article is approved.
    editorNote: {
      type: String,
      default: '',
      trim: true,
      maxlength: [2000, 'Editor note can be at most 2,000 characters'],
    },

    // When the article first went live, and when the current live version was approved.
    // The feed sorts "newest" by lastPublishedAt.
    firstPublishedAt: { type: Date, default: null },
    lastPublishedAt: { type: Date, default: null },

    // Running total of views, increased by services/viewTracker.js. Kept on the
    // article so "sort by popularity" doesn't have to add up thousands of hourly
    // stats documents for every feed request.
    totalViews: { type: Number, default: 0, min: 0 },

    publishHistory: {
      type: [publishEventSchema],
      default: [],
    },
  },
  {
    // Adds createdAt and updatedAt. The reporter dashboard sorts by updatedAt.
    timestamps: true,
  }
);

// Indexes, exactly as listed in "Shared contracts". Without them MongoDB would read
// every article to answer each query; with 500+ articles (thousands in real life)
// the feed and dashboards must stay fast (requirements: performance).
// The number is the sort direction: 1 ascending, -1 descending.
articleSchema.index({ status: 1 }); // editor dashboard: filter by status
articleSchema.index({ reporter: 1, updatedAt: -1 }); // reporter dashboard: my articles, newest first
articleSchema.index({ 'published.category': 1, lastPublishedAt: -1 }); // feed: one category, newest first
// Feed sort orders. _id is the tie-breaker: when two articles have the same date or
// view count, _id still gives them a fixed order, so pages never repeat or skip one.
articleSchema.index({ lastPublishedAt: -1, _id: -1 }); // feed: newest
articleSchema.index({ totalViews: -1, _id: -1 }); // feed: most popular
articleSchema.index({ 'published.title': 1 }); // title lookups

const Article = mongoose.model('Article', articleSchema);

// Attached to the model so every file gets the categories from the same import:
// const Article = require('../models/Article'); ... Article.CATEGORIES
Article.CATEGORIES = ARTICLE_CATEGORIES;

module.exports = Article;
