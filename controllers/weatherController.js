/**
 * controllers/weatherController.js
 *
 * The JSON API behind the sidebar's weather widget: GET /api/weather. All the real work
 * (calling OpenWeatherMap, the shared in-memory copy, the freshness rules) is in
 * services/weatherService.js; this file only turns its result into an HTTP answer
 * (the conventions: controllers handle request and response, logic lives in services).
 *
 * Used by: routes/apiRoutes/weatherApiRoutes.js.
 * Related: services/weatherService.js, public/js/public/weatherWidget.js (the caller in the browser).
 * Owner: SH.
 */

const { getWeather } = require('../services/weatherService');

/**
 * GET /api/weather - the current weather for the widget. Open to everyone.
 *
 * Answers 200 { success: true, data: { city, temperature, description, icon, updatedAt } },
 * or 503 { success: false, error: 'Weather unavailable' } when there is no API key or no
 * copy young enough to show (see weatherService.js).
 *
 * Why 503 here, and not next(error): 503 "Service Unavailable" says exactly what happened
 * (an outside service we depend on can't be used right now), and it is an expected
 * situation, not a bug of ours. errorHandler would turn it into a 500 and log a stack trace
 * for every reader; the service has already logged the cause once, as a warning.
 * The widget shows "Weather unavailable" for any failed answer, so the page itself never
 * breaks because of the weather.
 *
 * @param {import('express').Request} request - Not used: the city comes from .env, never from the request.
 * @param {import('express').Response} response - The JSON answer.
 * @returns {Promise<void>}
 */
async function getCurrentWeather(request, response) {
  try {
    const weather = await getWeather();
    response.json({ success: true, data: weather });
  } catch (error) {
    response.status(503).json({ success: false, error: 'Weather unavailable' });
  }
}

module.exports = { getCurrentWeather };
