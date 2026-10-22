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
 * Finds up to 3 related articles from the same category, excluding the current one.
 * 
 * Defense question / Performance: Why does this scale well?
 * This query uses the existing index { 'published.category': 1, lastPublishedAt: -1 } 
 * so the database can immediately find the newest articles in the category without scanning.
 *
 * @param {Object} article - The current article document (must have _id and published.category).
 * @returns {Promise<Array<{id: string, title: string, imageUrl: string, category: string}>>}
 */
async function findRelatedArticles(article) {
  const articles = await Article.find({
    _id: { $ne: article._id },
    published: { $ne: null },
    'published.category': article.published.category,
  })
    .sort({ lastPublishedAt: -1, _id: -1 })
    .limit(3)
    .select('published.title published.imageUrl published.category lastPublishedAt')
    .lean();

  return articles.map((a) => ({
    id: a._id.toString(),
    title: a.published.title,
    imageUrl: a.published.imageUrl || '',
    category: a.published.category,
  }));
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

  // Fetch related articles (Task 2)
  const relatedArticles = await findRelatedArticles(article);

  // As many as the comments API sends; deviceId is never loaded.
  const comments = await Comment.find({ article: article._id })
    .sort({ createdAt: -1, _id: -1 })
    .limit(Comment.MAX_SHOWN_PER_ARTICLE)
    .select('authorName text createdAt')
    .lean();

  // Every visit counts. recordView never throws, so a failed count can't break the page.
  await recordView(article._id, request.deviceId);

  const published = article.published;
  const reporterName = article.reporter ? article.reporter.displayName : 'Unknown reporter';

  // Social sites and search engines need absolute addresses, so they are built from the
  // address this request came to. The image is already absolute (draftValidation.js only
  // accepts http:// and https://); new URL() would also complete a relative one.
  const siteAddress = `${request.protocol}://${request.get('host')}`;
  const pageUrl = `${siteAddress}/articles/${article._id}`;
  const imageUrl = published.imageUrl ? new URL(published.imageUrl, siteAddress).href : '';

  const openGraph = {
    type: 'article',
    title: published.title,
    description: published.summary,
    url: pageUrl,
    image: imageUrl,
  };

  const newsArticle = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: published.title,
    description: published.summary,
    url: pageUrl,
    author: { '@type': 'Person', name: reporterName },
    articleSection: published.category,
  };
  // Left out when unknown rather than sent empty.
  if (article.lastPublishedAt) {
    newsArticle.datePublished = article.lastPublishedAt.toISOString();
  }
  if (imageUrl) {
    newsArticle.image = [imageUrl];
  }

  // Printed raw inside <script type="application/ld+json"> (views/partials/head.ejs), so every
  // "<" becomes \u003c: article text can never close the script element. JSON reads it back as "<".
  const structuredData = JSON.stringify(newsArticle).replace(/</g, '\\u003c');

  response.render('public/article', {
    title: `${published.title} - The Daily Web`,
    // The meta description search engines show under the link.
    description: published.summary,
    openGraph: openGraph,
    structuredData: structuredData,
    article: {
      id: article._id.toString(),
      title: published.title,
      category: published.category,
      imageUrl: published.imageUrl,
      paragraphs: splitIntoParagraphs(published.body),
      reporterName: reporterName,
      publishedAt: article.lastPublishedAt,
    },
    relatedArticles: relatedArticles,
    comments: comments,
  });
}

module.exports = { showArticlePage };