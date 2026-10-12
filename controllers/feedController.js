/**
 * controllers/feedController.js
 *
 * Handles the home page feed, the feed API used by infinite scroll, search,
 * filters and sorting, and resetting this device's "viewed" marks.
 * Owner: SH.
 *
 * Related files: views/public/feed.ejs, public/js/feed.js, models/DeviceArticleView.js
 */

const Article = require('../models/Article');
const DeviceArticleView = require('../models/DeviceArticleView'); // Imported SM's model

// Define valid categories for API validation
const VALID_CATEGORIES = ['News', 'Economy', 'Technology', 'Sports', 'Entertainment', 'Health', 'Politics', 'Culture'];
const VALID_SORTS = ['newest', 'popular'];

/**
 * Escapes special characters in a string for use in a RegExp.
 *
 * Defense Question - Security: Why is this needed?
 * If a user searches for something like ".*", it could cause a ReDoS attack 
 * (Regular Expression Denial of Service) or return unintended results. 
 * We escape user input to treat it as plain text before querying the database.
 * 
 * @param {string} text - The raw user input from the search bar.
 * @returns {string} - The safely escaped string for MongoDB $regex.
 */
function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
}

/**
 * GET / - the feed page.
 * Renders the main feed view with the first 20 articles pre-loaded on the server.
 *
 * Defense Question - Architecture: Why render the first page on the server?
 * Server-side rendering (SSR) ensures the full text of the first 20 articles 
 * is in the page HTML source. This is crucial for search engine optimization (SEO) 
 * and provides a faster initial display for readers without waiting for a JS fetch.
 *
 * @param {import('express').Request} request - The Express request object.
 * @param {import('express').Response} response - The Express response object.
 * @param {import('express').NextFunction} next - The next middleware function.
 * @returns {Promise<void>}
 */
async function showFeedPage(request, response, next) {
    try {
        const limit = 20;
        
        // Defense Question - Architecture: Why { published: { $ne: null } } instead of { status: 'published' }?
        // This enforces the draft/published split. Readers keep seeing the last approved 
        // version (the 'published' object) even if a reporter is currently editing it and the status is 'draft'.
        const query = { published: { $ne: null } };
        
        // Defense Question - Edge cases: Why use _id as a tie-breaker in sorting?
        // If two articles have the exact same lastPublishedAt time, MongoDB's sort order is unpredictable.
        // Adding _id ensures pages never repeat or skip articles during infinite scrolling.
        const sortOption = { lastPublishedAt: -1, _id: -1 }; 

        // Defense Question - Performance: Why use .select() and .lean()?
        // We expect thousands of readers. .select() fetches only the necessary fields, saving memory.
        // .lean() strips heavy Mongoose document methods, returning plain JavaScript objects for much faster processing.
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
        // Defense Question - Express 5 behavior:
        // In Express 5, async errors automatically go to the errorHandler without explicit try/catch.
        // We keep it here for consistency and explicit error forwarding to 'next()'.
        next(error);
    }
}

/**
 * GET /api/articles?search=&category=&viewed=&sort=&page= - 20 live articles.
 * Fetches live articles with pagination, filtering, search, and sorting.
 *
 * Defense Question - Contracts: Who depends on this?
 * public/js/feed.js uses this endpoint for infinite scrolling. It expects 
 * the exact shape: { success: true, data: { articles, hasMore } }.
 *
 * @param {import('express').Request} request - The Express request containing query params.
 * @param {import('express').Response} response - The Express response object.
 * @param {import('express').NextFunction} next - The next middleware function.
 * @returns {Promise<void>}
 */
async function listFeedArticles(request, response, next) {
    try {
        let page = 1;
        
        // Defense Question - Validation: Why validate here if the browser has checks?
        // Browser checks are just for quick feedback. The server check is the real security layer 
        // because anyone can bypass the UI and send requests directly using tools like Postman.
        // Strict validation: check the raw value first
        if (request.query.page !== undefined) {
            page = Number(request.query.page);
            if (!Number.isInteger(page) || page < 1) {
                return response.status(400).json({ success: false, error: 'Page must be an integer of 1 or greater.' });
            }
        }
        
        const limit = 20;
        const skip = (page - 1) * limit;
        
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
        // Defense Question - Security: Why is deviceId taken from request.deviceId and not the body/query?
        // request.deviceId is securely set by our server middleware via an HttpOnly cookie. 
        // If we took it from the request query, a malicious user could spoof it and view another person's history.
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

        // Defense Question - Pagination: Why limit + 1?
        // We fetch 21 items instead of 20. If we get 21, we instantly know there is a next page (hasMore: true)
        // without needing a separate, heavy count() query on the database. We then slice the array to return only the 20 requested items.
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
 * Deletes all DeviceArticleView records tied to the current user's device cookie.
 *
 * @param {import('express').Request} request - Express request containing the middleware-injected deviceId.
 * @param {import('express').Response} response - Express response indicating success.
 * @param {import('express').NextFunction} next - Express next function for error handling.
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