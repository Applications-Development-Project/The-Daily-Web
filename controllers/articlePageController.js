/**
 * controllers/articlePageController.js
 *
 * Handles fetching and rendering a single article page.
 * Renders the full article from the database, fetches initial comments,
 * records the view, and handles 404s for invalid/missing articles.
 * Owner: SH.
 * 
 * Related files: views/public/article.ejs, services/viewTracker.js
 */

const Article = require('../models/Article');
const Comment = require('../models/Comment');
const { recordView } = require('../services/viewTracker'); // Imported SM's service
const logger = require('../services/logger');

/**
 * GET /articles/:id
 * 
 * Defense Question - Architecture: Why render the article on the server instead of fetching via JS?
 * Server-side rendering (SSR) ensures the full article text is present in the initial HTML source. 
 * This is critical for SEO (Search Engine Optimization) so search engine crawlers can index the content.
 * 
 * @param {import('express').Request} request 
 * @param {import('express').Response} response 
 * @param {import('express').NextFunction} next 
 * @returns {Promise<void>}
 */
async function showArticlePage(request, response, next) {
    try {
        const articleId = request.params.id;

        // Defense Question - Edge cases & Security: Why validate the ID format with a regex?
        // MongoDB throws a CastError if we pass a malformed ObjectId, which would result in a 500 Internal Server Error.
        // Validating it first allows us to gracefully return a 404 Not Found instead of crashing.
        if (!articleId.match(/^[0-9a-fA-F]{24}$/)) {
            return response.status(404).render('public/error', { 
                statusCode: 404, 
                message: 'Article not found.' 
            });
        }

        // Defense Question - Architecture: Why filter by { published: { $ne: null } }?
        // Ensures readers only see approved content. If an editor reverts an article to a complete draft 
        // (meaning no published version exists), it correctly disappears from the public site.
        const article = await Article.findOne({ _id: articleId, published: { $ne: null } })
            .populate('reporter', 'displayName');

        if (!article) {
            return response.status(404).render('public/error', { 
                statusCode: 404, 
                message: 'Article not found or not published.' 
            });
        }

        // Defense Question - Performance & Contracts: Why limit to 10?
        // Prevents massive payloads if an article has thousands of comments. 
        // The -1 sort ensures we meet the contract of showing the newest comments first.
        const comments = await Comment.find({ article: article._id })
            .sort({ createdAt: -1 })
            .limit(10);

        // Defense Question - Architecture: Why wrap recordView in a try/catch?
        // Extra safety; recordView already never throws because it catches its own errors.
        // However, keeping this try/catch acts as an ultimate fallback boundary ensuring that 
        // even if the view tracker's internal error handling is modified in the future, 
        // a failed count can never break the article page.
        try {
            await recordView(article._id, request.deviceId);
        } catch (err) {
            logger.error('Failed to record article view: ' + err.message);
        }

        response.render('public/article', {
            title: `${article.published.title} - The Web Daily`,
            article: article,
            comments: comments
        });

    } catch (error) {
        next(error);
    }
}

module.exports = { showArticlePage };