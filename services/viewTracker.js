/**
 * services/viewTracker.js
 *
 * Records that an article was viewed, for the Impact Analytics chart and the feed's
 * "viewed / not viewed" filter. The article page calls recordView() on every visit.
 *
 * PHASE 0 STUB: recordView() only writes a log line. In phase 2 SM replaces its body
 * so it adds 1 to the current hour's ArticleViewStats counter and to
 * Article.totalViews, and records the (deviceId, article) pair in DeviceArticleView.
 * The name, parameters and "never throws" promise stay the same, so the article
 * page controller never has to change.
 *
 * Used by: controllers/articlePageController.js (SH).
 * Related: models/ArticleViewStats.js, models/DeviceArticleView.js, models/Article.js.
 * Owner: SM.
 */

const logger = require('./logger');

/**
 * Records one view of an article by one device.
 *
 * It never throws and never rejects: counting a view is less important than showing
 * the article, so any failure is logged and swallowed here instead of breaking the
 * reader's page.
 *
 * STUB: only logs the view; nothing is saved yet.
 *
 * @param {string|import('mongoose').Types.ObjectId} articleId - The article that was opened.
 * @param {string} deviceId - The visitor's device id (req.deviceId).
 * @returns {Promise<void>} Resolves when the view has been handled.
 */
async function recordView(articleId, deviceId) {
  logger.info(`View of article ${articleId} by device ${deviceId} (not saved yet: viewTracker is a stub)`);
}

module.exports = { recordView };
