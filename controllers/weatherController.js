/**
 * controllers/weatherController.js
 *
 * GET /api/weather, behind the sidebar's weather widget. The real work is in
 * services/weatherService.js; this file turns its result into an HTTP answer.
 *
 * Used by: routes/apiRoutes/weatherApiRoutes.js.
 * Owner: SH.
 */

const { getWeather } = require('../services/weatherService');

/**
 * GET /api/weather - the current weather. Open to everyone.
 *
 * Answers 200 { success: true, data: { city, temperature, description, icon, updatedAt } },
 * or 503 when the service can't be reached and no copy is young enough. 503 ("Service
 * Unavailable") and not next(error): an outside service being down is expected, not our
 * bug, so it shouldn't become a 500 with a stack trace for every reader.
 *
 * @param {import('express').Request} request - Not used: the city comes from .env.
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
