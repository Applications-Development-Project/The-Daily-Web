/**
 * routes/apiRoutes/weatherApiRoutes.js
 *
 * JSON API route for the weather widget. Mounted at "/api" in app.js, so "/weather"
 * here is "/api/weather" in the browser.
 * Created by OS in phase 0 with the path and access from the routes table in
 * "Shared contracts"; SH wrote the real controller and service behind it.
 *
 * Open to everyone, with no login check: the widget is in the public sidebar. The API key
 * stays on the server; the browser only ever calls this route.
 *
 * Related: controllers/weatherController.js, services/weatherService.js.
 *
 * Owner: SH.
 */

const express = require('express');
const weatherController = require('../../controllers/weatherController');

const router = express.Router();

// Open to everyone: the widget is in the public sidebar.
router.get('/weather', weatherController.getCurrentWeather);

module.exports = router;
