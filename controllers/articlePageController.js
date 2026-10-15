/**
 * controllers/articlePageController.js
 *
 * The full article page, GET /articles/:id: the published version, rendered completely on
 * the server (readable by search engines without JavaScript), with its newest comments,
 * and one view counted for the statistics.
 *
 * A malformed id, an unknown id and an article that isn't live all answer the same 404:
 * for a reader they mean "no such article", and an unpublished article isn't revealed.
 *
 * Used by: routes/pageRoutes/articlePageRoutes.js.
 * Owner: SH.
 */

const Article = require('../models/Article');
const Comment = require('../models/Comment');
const { recordView } = require('../services/viewTracker');
const { createHttpError } = require('../utils/httpErrors');
const { isValidObjectId } = require('../utils/requestValidation');

/**
 * Splits the body into paragraphs (separated by an empty line). The view prints each one
 * escaped, so a reporter's text never becomes HTML.
 *
 * @param {string} body - The article text as typed.
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
 * @param {import('express').Request} request - params.id; request.deviceId identifies the browser.
 * @param {import('express').Response} response - Renders views/public/article.ejs.
 * @returns {Promise<void>}
 * @throws {Error} 404 for a malformed, unknown or not-live article.
 */
async function showArticlePage(request, response) {
  const articleId = request.params.id;
  if (!isValidObjectId(articleId)) {
    throw createHttpError(404, 'Article not found.');
  }

  // Live = published not null (status only describes the working copy).
  const article = await Article.findOne({ _id: articleId, published: { $ne: null } })
    .select('published lastPublishedAt reporter')
    .populate('reporter', 'displayName')
    .lean();
  if (!article) {
    throw createHttpError(404, 'Article not found.');
  }

  // As many as the comments API sends; deviceId is never loaded.
  const comments = await Comment.find({ article: article._id })
    .sort({ createdAt: -1, _id: -1 })
    .limit(Comment.MAX_SHOWN_PER_ARTICLE)
    .select('authorName text createdAt')
    .lean();

  // Every visit counts. recordView never throws, so a failed count can't break the page.
  await recordView(article._id, request.deviceId);

  const published = article.published;
  response.render('public/article', {
    title: `${published.title} - The Daily Web`,
    // The meta description search engines show under the link.
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
