/**
 * models/Article.js
 *
 * News articles. Every article holds TWO copies of its content: draft (the working copy
 * reporters and editors edit) and published (what readers see, or null if never
 * approved). Approving copies draft into published, so a live article can be edited for
 * days while readers keep the last approved version.
 *
 * "status" describes the draft, not whether the article is live: live means published is
 * not null. Which status changes are allowed is decided in services/articleWorkflow.js.
 *
 * Used by: the feed, article page, reporter and editor controllers, scripts/seed.js.
 * Owner: shared file, first version by SM.
 */

const mongoose = require('mongoose');

// Written only here; other files read it as Article.CATEGORIES.
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
 * Empty is allowed while a draft is written; submitting requires a real category.
 *
 * @param {string} category - The value about to be saved.
 * @returns {boolean} true if it is empty or one of ARTICLE_CATEGORIES.
 */
function isEmptyOrKnownCategory(category) {
  return category === '' || ARTICLE_CATEGORIES.includes(category);
}

// The content object { title, summary, body, imageUrl, category }, the same shape for
// draft and published, so approving is a plain copy. Defaults of '' make an empty new
// draft valid. The limits are a second safety net after the controllers' checks. No trim:
// autosave runs while the reporter types.
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
    // A link, not an uploaded file; the http(s) check is in the controllers.
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

// One entry per approval; the analytics chart draws a marker at each publishedAt.
const publishEventSchema = new mongoose.Schema(
  {
    publishedAt: { type: Date, required: true },
    editor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false }
);

const articleSchema = new mongoose.Schema(
  {
    // Set from the session when the article is created, never from the request body.
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Reporter is required'],
    },

    // Must match STATUS in services/articleWorkflow.js.
    status: {
      type: String,
      enum: {
        values: ['draft', 'pending', 'published', 'returned'],
        message: 'Unknown article status',
      },
      default: 'draft',
    },

    // A function, so each new article gets its own empty object.
    draft: {
      type: articleContentSchema,
      default: () => ({}),
    },

    // null = never approved.
    published: {
      type: articleContentSchema,
      default: null,
    },

    // Why the article was returned; cleared when it is approved.
    editorNote: {
      type: String,
      default: '',
      trim: true,
      maxlength: [2000, 'Editor note can be at most 2,000 characters'],
    },

    firstPublishedAt: { type: Date, default: null },
    // The feed sorts "newest" by this.
    lastPublishedAt: { type: Date, default: null },

    // A running total (services/viewTracker.js), so "most popular" never adds up the hourly stats.
    totalViews: { type: Number, default: 0, min: 0 },

    publishHistory: {
      type: [publishEventSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Each index matches a query's filter and sort, so MongoDB reads rows already in order
// instead of sorting them. _id is the tie-breaker: equal dates or view counts keep one
// fixed order, so paging never repeats or skips an article.
articleSchema.index({ status: 1, updatedAt: -1, _id: -1 }); // editor dashboard, filtered by status
articleSchema.index({ reporter: 1, updatedAt: -1 }); // reporter dashboard
articleSchema.index({ 'published.category': 1, lastPublishedAt: -1, _id: -1 }); // feed: one category, newest first
articleSchema.index({ lastPublishedAt: -1, _id: -1 }); // feed: newest
articleSchema.index({ totalViews: -1, _id: -1 }); // feed: most popular
articleSchema.index({ 'published.title': 1 }); // title lookups
articleSchema.index({ updatedAt: -1, _id: -1 }); // editor dashboard, all articles

const Article = mongoose.model('Article', articleSchema);

// Every file gets the categories from the same import: Article.CATEGORIES.
Article.CATEGORIES = ARTICLE_CATEGORIES;

module.exports = Article;
