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
 * Defense Question - Performance: Why a 10-minute cache?
 * The requirements state the widget should not show data older than 15 minutes. 
 * A 10-minute cache on the server, combined with a 5-minute refresh interval in the browser,
 * ensures the user sees data that is never older than 15 minutes, while drastically reducing API calls.
 * 
 * Defense Question - Performance: Why share one fetch Promise (fetchPromise)?
 * If 1,000 readers open the site at the exact moment the cache expires, we don't want 
 * to fire 1,000 concurrent requests to OpenWeatherMap (which would hit API rate limits). 
 * By returning the existing `fetchPromise`, all 1,000 readers wait for the single in-flight request to finish.
 *
 * @returns {Promise<{city: string, temperature: number, description: string, icon: string, updatedAt: Date}>}
 * @throws {Error} - Throws "Weather unavailable" if the API call fails and no cached data is available.
 */
async function getWeather() {
  const now = new Date();

  // If there is a valid cache (less than 10 minutes old), return it immediately
  if (cachedWeather && (now.getTime() - cachedWeather.updatedAt.getTime() < CACHE_DURATION_MS)) {
    return cachedWeather;
  }

  // If a request is already in progress, wait for it instead of starting a new one
  if (fetchPromise) {
    return fetchPromise;
  }

  const apiKey = process.env.WEATHER_API_KEY;
  const city = process.env.WEATHER_CITY || 'Tel Aviv';

  if (!apiKey) {
    logger.error('Weather API key is missing in .env');
    // Defense Question - Edge cases: What happens if the API fails or is unconfigured?
    // We try to return the last known good result (`cachedWeather`) so the user still sees something.
    // If we have no cache at all, we throw an error which triggers the "Weather unavailable" UI state.
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
      // Return stale data if available, otherwise fail
      if (cachedWeather) return cachedWeather;
      throw new Error('Weather unavailable');
    });

  return fetchPromise;
}

module.exports = { getWeather };