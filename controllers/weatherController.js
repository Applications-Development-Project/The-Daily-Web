/**
 * controllers/weatherController.js
 * 
 * Handles the API route for fetching the weather widget data.
 * Used by: The public site sidebar (GET /api/weather).
 * Owner: SH.
 */

const { getWeather } = require('../services/weatherService');

/**
 * GET /api/weather
 * Returns the current weather, utilizing the 10-minute cache from weatherService.
 */
async function getWeatherData(req, res, next) {
    try {
        const weather = await getWeather();
        
        // Return a successful JSON response matching the team's shared contract
        res.json({ success: true, data: weather });
    } catch (error) {
        // Pass any unexpected errors to OS's global error handler
        next(error);
    }
}

module.exports = { getWeatherData };