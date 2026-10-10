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
// const { recordView } = require('../services/viewService'); 

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

        // 2. Fetch the article (must be live/published)
        const article = await Article.findOne({ _id: articleId, status: 'published' });

        if (!article) {
            return response.status(404).render('public/error', { 
                statusCode: 404, 
                message: 'Article not found or not published.' 
            });
        }

        // 3. Fetch the first comments (e.g., earliest 10 comments)
        const comments = await Comment.find({ articleId: article._id })
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
            title: `${article.title} - The Web Daily`,
            article: article,
            comments: comments // Passing comments to the view
        });

    } catch (error) {
        next(error);
    }
}

module.exports = { showArticlePage };