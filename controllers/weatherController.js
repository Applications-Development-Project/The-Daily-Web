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
 * 
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
async function getCurrentWeather(req, res, next) {
    try {
        const weather = await getWeather();
        
        // Return a successful JSON response matching the team's shared contract
        res.json({ success: true, data: weather });
    } catch (error) {
        // Defense Question - Error Handling: Why return 503 instead of passing to next(error)?
        // An external service (OpenWeatherMap) being down or missing an API key isn't a server failure (500).
        // Returning 503 Service Unavailable with a success: false contract allows the frontend 
        // widget to gracefully show "Weather unavailable" without breaking the page or filling logs with 500s.
        res.status(503).json({ success: false, error: "Weather is unavailable right now" });
    }
}

module.exports = { getCurrentWeather };