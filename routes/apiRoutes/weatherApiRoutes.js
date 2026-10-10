/**
 * routes/apiRoutes/weatherApiRoutes.js
 *
 * JSON API route for the weather widget. Mounted at "/api" in app.js, so "/weather"
 * here is "/api/weather" in the browser.
 * Created by OS in phase 0 with the path and access from the routes table in
 * "Shared contracts"; the controller behind it is a PLACEHOLDER until SH replaces it.
 *
 * Owner: SH.
 */

const express = require('express');
const weatherController = require('../../controllers/weatherController');

const router = express.Router();

// Open to everyone: the widget is in the public sidebar.
router.get('/weather', weatherController.getCurrentWeather);

module.exports = router;
