/**
 * controllers/feedController.js
 *
 * Handles the home page feed, the feed API used by infinite scroll, search,
 * filters and sorting, and resetting this device's "viewed" marks.
 * Owner: SH.
 */

const Article = require('../models/Article');

/**
 * GET / - the feed page.
 * Renders the main feed view. Initial data will be loaded via client-side fetch.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
function showFeedPage(request, response, next) {
    try {
        // Renders the views/public/feed.ejs file we created earlier
        response.render('public/feed');
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/articles?search=&category=&viewed=&sort=&page= - 20 live articles.
 * Fetches published articles with pagination, filtering, search, and sorting.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @param {import('express').NextFunction} next
 * @returns {Promise<void>}
 */
async function listFeedArticles(request, response, next) {
    try {
        const page = parseInt(request.query.page) || 1;
        const limit = 20; // Load 20 articles per request for infinite scroll
        const skip = (page - 1) * limit;

        // 1. Base query: Only show published articles
        const query = { status: 'published' };

        // 2. Category filter
        if (request.query.category) {
            query.category = request.query.category;
        }

        // 3. Search filter (case-insensitive text search in title or summary)
        if (request.query.search) {
            query.$or = [
                { title: { $regex: request.query.search, $options: 'i' } },
                { summary: { $regex: request.query.search, $options: 'i' } }
            ];
        }

        // 4. Sorting logic
        let sortOption = { publishedAt: -1 }; // Default: Newest first
        if (request.query.sort === 'popular') {
            // Sort by views descending, then newest as fallback
            sortOption = { views: -1, publishedAt: -1 };
        }

        // Note: The "viewed" filter will be added later 
        // as it requires joining with the DeviceArticleView stats.

        // 5. Execute DB query
        const articles = await Article.find(query)
            .sort(sortOption)
            .skip(skip)
            .limit(limit)
            .select('title summary category publishedAt authorName views'); 

        response.json({ success: true, data: articles });
    } catch (error) {
        // Pass to the global error handler
        next(error);
    }
}

/**
 * DELETE /api/articles/viewed - forget which articles this device has seen. PLACEHOLDER.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @returns {void}
 */
function resetViewedMarks(request, response) {
    response.status(501).json({ success: false, error: 'Not implemented yet' });
}

module.exports = { showFeedPage, listFeedArticles, resetViewedMarks };