/**
 * controllers/articlePageController.js
 *
 * Handles fetching and rendering a single article page.
 * Renders the full article from the database, fetches initial comments,
 * records the view, and handles 404s for invalid/missing articles.
 * Owner: SH.
 */

const Article = require('../models/Article');
const Comment = require('../models/Comment');
const { recordView } = require('../services/viewTracker'); // Imported SM's service
const logger = require('../services/logger');

/**
 * GET /articles/:id
 */
async function showArticlePage(request, response, next) {
    try {
        const articleId = request.params.id;

        if (!articleId.match(/^[0-9a-fA-F]{24}$/)) {
            return response.status(404).render('public/error', { 
                statusCode: 404, 
                message: 'Article not found.' 
            });
        }

        const article = await Article.findOne({ _id: articleId, published: { $ne: null } })
            .populate('reporter', 'displayName');

        if (!article) {
            return response.status(404).render('public/error', { 
                statusCode: 404, 
                message: 'Article not found or not published.' 
            });
        }

        // Fixed: Sorting by newest first (-1)
        const comments = await Comment.find({ article: article._id })
            .sort({ createdAt: -1 })
            .limit(10);

        // Fixed: Calling the actual view tracker
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