/**
 * routes/apiRoutes/weatherApiRoutes.js
 *
 * GET /api/weather for the sidebar widget, mounted at "/api" in app.js. The browser calls
 * only this route, never the weather service itself.
 *
 * Related: controllers/weatherController.js.
 * Owner: SH.
 */

const express = require('express');
const weatherController = require('../../controllers/weatherController');

const router = express.Router();

// Open to everyone: the widget is in the public sidebar.
router.get('/weather', weatherController.getCurrentWeather);

module.exports = router;
