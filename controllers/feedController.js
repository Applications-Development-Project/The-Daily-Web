/**
 * controllers/feedController.js
 *
 * Handles the home page feed, the feed API used by infinite scroll, search,
 * filters and sorting, and resetting this device's "viewed" marks.
 * Owner: SH.
 */

const Article = require('../models/Article');
const DeviceArticleView = require('../models/DeviceArticleView'); // Imported SM's model

// Define valid categories for API validation
const VALID_CATEGORIES = ['News', 'Economy', 'Technology', 'Sports', 'Entertainment', 'Health', 'Politics', 'Culture'];
const VALID_SORTS = ['newest', 'popular'];

/**
 * Escapes special characters in a string for use in a RegExp.
 * Prevents regex injection attacks.
 * 
 * @param {string} text 
 * @returns {string}
 */
function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
}

/**
 * GET / - the feed page.
 * Renders the main feed view with the first 20 articles pre-loaded on the server.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @param {import('express').NextFunction} next
 * @returns {Promise<void>}
 */
async function showFeedPage(request, response, next) {
    try {
        const limit = 20;
        
        // Base query: Only show live articles
        const query = { published: { $ne: null } };
        const sortOption = { lastPublishedAt: -1, _id: -1 }; 

        const fetchedArticles = await Article.find(query)
            .sort(sortOption)
            .limit(limit)
            .populate('reporter', 'displayName')
            .select('published lastPublishedAt totalViews reporter')
            .lean(); 

        const shapedArticles = fetchedArticles.map(article => ({
            id: article._id,
            title: article.published.title,
            summary: article.published.summary,
            imageUrl: article.published.imageUrl,
            category: article.published.category,
            reporterName: article.reporter?.displayName || 'Unknown',
            publishedAt: article.lastPublishedAt,
            totalViews: article.totalViews || 0
        }));

        response.render('public/feed', { 
            articles: shapedArticles // Passing initial articles to the EJS template
        });
    } catch (error) {
        next(error);
    }
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

        // 7. Validation: page number
        if (page < 1) {
            return response.status(400).json({ success: false, error: 'Page must be 1 or greater.' });
        }

        // 7. Validation: sort parameter
        if (request.query.sort && !VALID_SORTS.includes(request.query.sort)) {
            return response.status(400).json({ success: false, error: 'Unknown sort option.' });
        }

        // 7. Validation: category parameter
        if (request.query.category && !VALID_CATEGORIES.includes(request.query.category)) {
            return response.status(400).json({ success: false, error: 'Unknown category.' });
        }

        const query = { published: { $ne: null } };

        if (request.query.category) {
            query['published.category'] = request.query.category;
        }

        if (request.query.search) {
            const safeSearch = escapeRegExp(request.query.search);
            query.$or = [
                { 'published.title': { $regex: safeSearch,$options: 'i' } },
                { 'published.summary': { $regex: safeSearch,$options: 'i' } }
            ];
        }

        // 7. Viewed Filter (using SM's DeviceArticleView model)
        if (request.query.viewed && request.deviceId) {
            const viewedRecords = await DeviceArticleView.find({ deviceId: request.deviceId }).select('article').lean();
            const viewedIds = viewedRecords.map(record => record.article);

            if (request.query.viewed === 'viewed') {
                query._id = { $in: viewedIds };
            } else if (request.query.viewed === 'unviewed') {
                query._id = { $nin: viewedIds };
            }
        }

        let sortOption = { lastPublishedAt: -1, _id: -1 }; 
        if (request.query.sort === 'popular') {
            sortOption = { totalViews: -1, lastPublishedAt: -1, _id: -1 };
        }

        const fetchedArticles = await Article.find(query)
            .sort(sortOption)
            .skip(skip)
            .limit(limit + 1)
            .populate('reporter', 'displayName')
            .select('published lastPublishedAt totalViews reporter')
            .lean(); 

        const hasMore = fetchedArticles.length > limit;
        const itemsToReturn = fetchedArticles.slice(0, limit);

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

/**
 * DELETE /api/articles/viewed - forget which articles this device has seen.
 *
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @param {import('express').NextFunction} next
 * @returns {Promise<void>}
 */
async function resetViewedMarks(request, response, next) {
    try {
        if (request.deviceId) {
            await DeviceArticleView.deleteMany({ deviceId: request.deviceId });
        }
        response.json({ success: true });
    } catch (error) {
        next(error);
    }
}

module.exports = { showFeedPage, listFeedArticles, resetViewedMarks };