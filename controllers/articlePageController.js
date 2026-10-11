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

// TODO: Import SM's recordView function once his view service is merged.
// Note: EZ mentioned the real file will be services/viewTracker.js
// const { recordView } = require('../services/viewTracker'); 

/**
 * GET /articles/:id - the full article page.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @param {import('express').NextFunction} next
 * @returns {Promise<void>}
 */
async function showArticlePage(request, response, next) {
    try {
        const articleId = request.params.id;

        // 1. Validate the ID format to prevent database casting errors
        if (!articleId.match(/^[0-9a-fA-F]{24}$/)) {
            return response.status(404).render('public/error', { 
                statusCode: 404, 
                message: 'Article not found.' 
            });
        }

        // 2. Fetch the article (must be live/published) and populate the reporter
        const article = await Article.findOne({ _id: articleId, published: { $ne: null } })
            .populate('reporter', 'displayName');

        if (!article) {
            return response.status(404).render('public/error', { 
                statusCode: 404, 
                message: 'Article not found or not published.' 
            });
        }

        // 3. Fetch the first comments (the field on Comment model is 'article')
        const comments = await Comment.find({ article: article._id })
            .sort({ createdAt: 1 })
            .limit(10);

        // 4. Record the view using SM's logic (commented out until his module is ready)
        try {
            // await recordView(article._id, request.deviceId);
        } catch (err) {
            console.error('Failed to record article view:', err);
        }

        // 5. Render the page with the dynamic data
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