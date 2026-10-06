/**
 * services/weatherService.js
 *
 * Gets the current weather for the sidebar widget from OpenWeatherMap (an external
 * web service), for the city in WEATHER_CITY.
 *
 * PHASE 0 STUB, written by SM: getWeather() returns a fixed sample object with the
 * final shape, so the weather route and widget can be built before the real service
 * exists. SH replaces the body with the real version: call OpenWeatherMap at most
 * once every 10 minutes, keep the last result in memory, and share it between all
 * readers (see SH's tasks in the work plan). Callers never need to change.
 *
 * Used by: controllers/weatherController.js (GET /api/weather).
 * Owner: SH.
 */

/**
 * Returns the current weather for the configured city.
 *
 * STUB: always returns the same sample data and never calls the external API.
 *
 * @returns {Promise<{city: string, temperature: number, description: string, icon: string, updatedAt: Date}>}
 *   city: the city name; temperature: degrees Celsius; description: short text such
 *   as "clear sky"; icon: OpenWeatherMap icon code (for example "01d"); updatedAt:
 *   when the data was fetched.
 */
async function getWeather() {
  return {
    city: process.env.WEATHER_CITY || 'Tel Aviv',
    temperature: 24,
    description: 'clear sky (sample data)',
    icon: '01d',
    updatedAt: new Date(),
  };
}

module.exports = { getWeather };
