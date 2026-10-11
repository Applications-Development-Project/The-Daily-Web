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
        response.render('public/feed');
    } catch (error) {
        next(error);
    }
}

/**
 * Escapes special characters in a string for use in a RegExp.
 * Prevents regex injection attacks and errors on special characters.
 * 
 * @param {string} text 
 * @returns {string}
 */
function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
}

/**
 * GET /api/articles?search=&category=&viewed=&sort=&page= - 20 live articles.
 * Fetches live articles with pagination, filtering, search, and sorting.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @param {import('express').NextFunction} next
 * @returns {Promise<void>}
 */
async function listFeedArticles(request, response, next) {
    try {
        const page = parseInt(request.query.page) || 1;
        const limit = 20;
        const skip = (page - 1) * limit;

        // 1. Base query: Only show live articles (published object is not null)
        const query = { published: { $ne: null } };

        // 2. Category filter
        if (request.query.category) {
            query['published.category'] = request.query.category;
        }

        // 3. Search filter (case-insensitive text search in published title or summary)
        if (request.query.search) {
            const safeSearch = escapeRegExp(request.query.search);
            query.$or = [
                { 'published.title': { $regex: safeSearch, $options: 'i' } },
                { 'published.summary': { $regex: safeSearch, $options: 'i' } }
            ];
        }

        // 4. Sorting logic
        // Default: Newest first (lastPublishedAt desc, _id desc as tie-breaker)
        let sortOption = { lastPublishedAt: -1, _id: -1 }; 
        if (request.query.sort === 'popular') {
            // Sort by total views descending, then newest as fallback
            sortOption = { totalViews: -1, lastPublishedAt: -1, _id: -1 };
        }

        // Note: The "unviewed" filter will be added here later using the same live rule.

        // 5. Execute DB query
        // We fetch one extra item (limit + 1) to easily determine if there are more pages
        const fetchedArticles = await Article.find(query)
            .sort(sortOption)
            .skip(skip)
            .limit(limit + 1)
            .populate('reporter', 'displayName')
            .select('published lastPublishedAt totalViews reporter'); 

        // 6. Format the response to match the contract
        const hasMore = fetchedArticles.length > limit;
        const itemsToReturn = fetchedArticles.slice(0, limit);

        const shapedArticles = itemsToReturn.map(article => ({
            _id: article._id,
            title: article.published.title,
            summary: article.published.summary,
            category: article.published.category,
            publishedAt: article.lastPublishedAt,
            authorName: article.reporter && article.reporter.displayName ? article.reporter.displayName : 'Unknown',
            views: article.totalViews || 0
        }));

        response.json({ 
            success: true, 
            data: shapedArticles, // Kept for backwards compatibility with our feed.js
            articles: shapedArticles,
            hasMore: hasMore
        });
    } catch (error) {
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