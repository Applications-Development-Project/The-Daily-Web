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

let cachedWeather = null;
let fetchPromise = null;
const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Returns the current weather for the configured city.
 * Uses in-memory caching to prevent exceeding API limits.
 *
 * @returns {Promise<{city: string, temperature: number, description: string, icon: string, updatedAt: Date}>}
 *   city: the city name; temperature: degrees Celsius; description: short text such
 *   as "clear sky"; icon: OpenWeatherMap icon code (for example "01d"); updatedAt:
 *   when the data was fetched.
 */
async function getWeather() {
  const now = new Date();

  // If there is a valid cache (less than 10 minutes old), return it
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
    console.error('Weather API key is missing in .env');
    return getFallbackWeather();
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
      console.error('Failed to fetch weather:', error.message);
      fetchPromise = null;
      return cachedWeather || getFallbackWeather();
    });

  return fetchPromise;
}

/**
 * Fallback data in case the API is completely unreachable and there is no cache
 */
function getFallbackWeather() {
  return {
    city: 'Weather unavailable',
    temperature: 0,
    description: 'Unable to load weather data',
    icon: '01d',
    updatedAt: new Date()
  };
}

module.exports = { getWeather };