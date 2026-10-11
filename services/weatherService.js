/**
 * services/weatherService.js
 *
 * Gets the current weather for the sidebar widget from OpenWeatherMap (an external
 * web service), for the city in WEATHER_CITY.
 *
 * REPLACES PHASE 0 STUB: Calls OpenWeatherMap at most once every 10 minutes, 
 * keeps the last result in memory, and shares it between all readers.
 *
 * Used by: controllers/weatherController.js (GET /api/weather).
 * Owner: SH.
 */

const logger = require('./logger');

let cachedWeather = null;
let fetchPromise = null;
const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Returns the current weather for the configured city.
 * Uses in-memory caching to prevent exceeding API limits.
 *
 * @returns {Promise<{city: string, temperature: number, description: string, icon: string, updatedAt: Date}>}
 */
async function getWeather() {
  const now = new Date();

  if (cachedWeather && (now.getTime() - cachedWeather.updatedAt.getTime() < CACHE_DURATION_MS)) {
    return cachedWeather;
  }

  if (fetchPromise) {
    return fetchPromise;
  }

  const apiKey = process.env.WEATHER_API_KEY;
  const city = process.env.WEATHER_CITY || 'Tel Aviv';

  if (!apiKey) {
    logger.error('Weather API key is missing in .env');
    if (cachedWeather) return cachedWeather;
    throw new Error('Weather unavailable'); // Trigger failure for success: false
  }

  fetchPromise = fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city}&units=metric&appid=${apiKey}`)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`OpenWeatherMap API returned status ${response.status}`);
      }
      const data = await response.json();
      
      cachedWeather = {
        city: data.name,
        temperature: Math.round(data.main.temp),
        description: data.weather[0].description,
        icon: data.weather[0].icon,
        updatedAt: new Date()
      };
      
      fetchPromise = null;
      return cachedWeather;
    })
    .catch((error) => {
      logger.error('Failed to fetch weather: ' + error.message);
      fetchPromise = null;
      if (cachedWeather) return cachedWeather;
      throw new Error('Weather unavailable');
    });

  return fetchPromise;
}

module.exports = { getWeather };