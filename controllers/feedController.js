/**
 * controllers/feedController.js
 *
 * Handles the home page feed, the feed API used by infinite scroll, search,
 * filters and sorting, and resetting this device's "viewed" marks.
 * Owner: SH.
 */

const Article = require('../models/Article');

function showFeedPage(request, response, next) {
    try {
        response.render('public/feed');
    } catch (error) {
        next(error);
    }
}

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
}

async function listFeedArticles(request, response, next) {
    try {
        const page = parseInt(request.query.page) || 1;
        const limit = 20;
        const skip = (page - 1) * limit;

        const query = { published: { $ne: null } };

        if (request.query.category) {
            query['published.category'] = request.query.category;
        }

        if (request.query.search) {
            const safeSearch = escapeRegExp(request.query.search);
            query.$or = [
                { 'published.title': { $regex: safeSearch, $options: 'i' } },
                { 'published.summary': { $regex: safeSearch, $options: 'i' } }
            ];
        }

        let sortOption = { lastPublishedAt: -1, _id: -1 }; 
        if (request.query.sort === 'popular') {
            sortOption = { totalViews: -1, lastPublishedAt: -1, _id: -1 };
        }

        // Fixed: Added .lean() for performance since we don't need Mongoose documents
        const fetchedArticles = await Article.find(query)
            .sort(sortOption)
            .skip(skip)
            .limit(limit + 1)
            .populate('reporter', 'displayName')
            .select('published lastPublishedAt totalViews reporter')
            .lean(); 

        const hasMore = fetchedArticles.length > limit;
        const itemsToReturn = fetchedArticles.slice(0, limit);

        // Fixed: Matching the exact contract fields including imageUrl
        const shapedArticles = itemsToReturn.map(article => ({
            id: article._id,
            title: article.published.title,
            summary: article.published.summary,
            imageUrl: article.published.imageUrl,
            category: article.published.category,
            reporterName: article.reporter?.displayName || 'Unknown',
            publishedAt: article.lastPublishedAt,
            totalViews: article.totalViews || 0
        }));

        // Fixed: Returning exactly { data: { articles, hasMore } }
        response.json({ 
            success: true, 
            data: {
                articles: shapedArticles,
                hasMore: hasMore
            }
        });
    } catch (error) {
        next(error);
    }
}

function resetViewedMarks(request, response) {
    response.status(501).json({ success: false, error: 'Not implemented yet' });
}

module.exports = { showFeedPage, listFeedArticles, resetViewedMarks };