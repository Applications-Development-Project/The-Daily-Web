/**
 * controllers/articlePageController.js
 *
 * The full article page, GET /articles/:id: the approved (published) version of one
 * article, rendered completely on the server, with its newest comments, and one view
 * counted for the statistics.
 *
 * Requirements this serves (in our own words):
 * - The article page is open to everyone and shows the title, reporter, category, publish
 *   date, main image and the full text, plus a comments area.
 * - It must be readable by search engines: the full text is already in the first HTML the
 *   server sends, and doesn't depend on JavaScript running in the browser. That is why the
 *   whole page, comments included, is rendered here with EJS, and the browser script
 *   (public/js/public/articleComments.js) only adds NEW comments.
 * - Every visit counts toward the view statistics (recordView below).
 *
 * Choices a lecturer may ask about:
 * - "Live" is published not null, never status === 'published'. Readers see the last
 *   approved version even while the reporter edits a new one (status "draft" or "pending"),
 *   and an article that was never approved doesn't exist for them (404).
 * - A malformed id, an unknown id and an article that isn't live all answer the same 404
 *   page: for a reader they all mean "there is no such article", and we don't reveal that
 *   an unpublished article exists.
 * - Only the fields the page shows are loaded (.select), as plain objects (.lean).
 * - The body is plain text with a blank line between paragraphs (that is how reporters
 *   type it in a textarea). We split it into paragraphs here and the view prints each one
 *   with the escaping tag, so a reporter's text can never become HTML or script (XSS),
 *   while the reader still sees real paragraphs.
 *
 * No try/catch: in Express 5 an error thrown in an async controller (the 404 below, or a
 * database failure) goes to errorHandler by itself, which renders the shared error page.
 *
 * Used by: routes/pageRoutes/articlePageRoutes.js.
 * Related: views/public/article.ejs, services/viewTracker.js (recordView),
 * models/Comment.js, public/js/public/articleComments.js, controllers/commentController.js
 * (the comments API the page's script uses).
 * Owner: SH.
 */

const Article = require('../models/Article');
const Comment = require('../models/Comment');
const { recordView } = require('../services/viewTracker');
const { createHttpError } = require('../utils/httpErrors');
const { isValidObjectId } = require('../utils/requestValidation');

/**
 * Splits an article body into paragraphs: one paragraph per block of text separated by an
 * empty line. Spaces around each paragraph are removed and empty ones dropped.
 *
 * @param {string} body - The article text as the reporter typed it.
 * @returns {string[]} The paragraphs, in order.
 */
function splitIntoParagraphs(body) {
  return (body || '')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '');
}

/**
 * GET /articles/:id - the full article page.
 *
 * @param {import('express').Request} request - request.params.id is the article id;
 *   request.deviceId identifies the reader's browser (for the "viewed" marks).
 * @param {import('express').Response} response - Renders views/public/article.ejs.
 * @returns {Promise<void>}
 * @throws {Error} 404 for a malformed id, an unknown article or one that isn't live
 *   (errorHandler shows the shared error page).
 */
async function showArticlePage(request, response) {
  const articleId = request.params.id;
  if (!isValidObjectId(articleId)) {
    throw createHttpError(404, 'Article not found.');
  }

  const article = await Article.findOne({ _id: articleId, published: { $ne: null } })
    .select('published lastPublishedAt reporter')
    .populate('reporter', 'displayName')
    .lean();
  if (!article) {
    throw createHttpError(404, 'Article not found.');
  }

  // The newest comments, the same number as the comments API sends (Comment.MAX_SHOWN_PER_ARTICLE),
  // through the { article: 1, createdAt: -1 } index. deviceId is never loaded: it stays on the server.
  const comments = await Comment.find({ article: article._id })
    .sort({ createdAt: -1, _id: -1 })
    .limit(Comment.MAX_SHOWN_PER_ARTICLE)
    .select('authorName text createdAt')
    .lean();

  // Count this visit (requirements: every visit counts). recordView never throws and never
  // rejects: it catches and logs its own errors, because a failed count must never break the
  // article page (its contract in services/viewTracker.js). We wait for it so the view is
  // counted before the page is sent; it is three small writes, each through an index.
  await recordView(article._id, request.deviceId);

  const published = article.published;
  response.render('public/article', {
    title: `${published.title} - The Daily Web`,
    // The summary becomes the page's meta description, the text search engines show
    // under the link in their results.
    description: published.summary,
    article: {
      id: article._id.toString(),
      title: published.title,
      category: published.category,
      imageUrl: published.imageUrl,
      paragraphs: splitIntoParagraphs(published.body),
      reporterName: article.reporter ? article.reporter.displayName : 'Unknown reporter',
      publishedAt: article.lastPublishedAt,
    },
    comments: comments,
  });
}

module.exports = { showArticlePage };
