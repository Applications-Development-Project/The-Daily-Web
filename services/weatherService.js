/**
 * services/weatherService.js
 *
 * Gets the current weather for the sidebar widget from Open-Meteo (open-meteo.com), and
 * keeps it in memory so that all readers share one copy.
 *
 * Requirements this serves (in our own words): the sidebar shows a weather widget from a
 * known, free external web service, on a plan that needs no credit card; the data a reader
 * sees may be at most 15 minutes old; the site may serve thousands of readers at once.
 *
 * Why Open-Meteo and not OpenWeatherMap (the example the requirements give): Open-Meteo is
 * free and needs no account, no API key and no credit card. Our .env is never in the
 * repository, so with a keyed service the widget would show "Weather unavailable" on every
 * computer that doesn't have our key, including the lecturer's. With Open-Meteo it works
 * on any computer right after "npm install". The city is set in .env (WEATHER_CITY for the
 * name shown, WEATHER_LATITUDE and WEATHER_LONGITUDE for the place), with Tel Aviv as the
 * default.
 *
 * How the 15 minutes are guaranteed (three numbers that work together):
 * - REFRESH_AFTER_MS (5 minutes): a copy younger than this is served as it is, without
 *   calling Open-Meteo. So the external service is called at most once every 5 minutes,
 *   whether we have 1 reader or 10,000: every browser reads OUR cached copy.
 * - MAX_AGE_MS (10 minutes): if Open-Meteo fails, we keep serving the last good copy, but
 *   only while it is younger than 10 minutes. After that the widget says "Weather
 *   unavailable" instead of showing old weather as if it were current.
 * - The browser asks our server again every 5 minutes (public/js/public/weatherWidget.js).
 * The worst case is a copy that is just under 10 minutes old when the browser gets it, then
 * shown for 5 more minutes: under 10 + 5 = 15 minutes of delay added by our site.
 *
 * Other choices a lecturer may ask about:
 * - One shared request (fetchInProgress): if many readers arrive while the copy is being
 *   refreshed, they all wait for the SAME call instead of each starting their own. Without
 *   it, 1,000 readers arriving when the copy expires would send 1,000 calls at once.
 * - A short pause after a failure (RETRY_AFTER_FAILURE_MS): while the service is down, we
 *   try again at most once a minute, instead of on every request.
 * - A timeout (REQUEST_TIMEOUT_MS): a service that never answers can't make our readers
 *   wait forever; after 5 seconds the call counts as failed.
 * - In memory, not in MongoDB: the copy is a few bytes, and losing it on a restart costs
 *   only one call. (With several server processes each would have its own copy; one
 *   process is what this project runs.)
 * - The browser never calls Open-Meteo itself: it calls our /api/weather. That is what lets
 *   thousands of readers share one copy, and the page doesn't depend on an outside site.
 * - Problems are logged with logger.warn, not logger.error: an outside service being down
 *   is expected and handled, not a bug in our server.
 *
 * Used by: controllers/weatherController.js (GET /api/weather).
 * Related: public/js/public/weatherWidget.js (the widget), views/partials/sidebar.ejs,
 * .env.example (WEATHER_CITY, WEATHER_LATITUDE, WEATHER_LONGITUDE).
 * Owner: SH.
 */

const logger = require('./logger');

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

// Used when .env doesn't set a place.
const DEFAULT_CITY = 'Tel Aviv';
const DEFAULT_LATITUDE = 32.0853;
const DEFAULT_LONGITUDE = 34.7818;

const MINUTE_MS = 60 * 1000;
// See the header for how these numbers keep the widget under 15 minutes old.
const REFRESH_AFTER_MS = 5 * MINUTE_MS;
const MAX_AGE_MS = 10 * MINUTE_MS;
const RETRY_AFTER_FAILURE_MS = 1 * MINUTE_MS;
const REQUEST_TIMEOUT_MS = 5000;

// Open-Meteo describes the weather with a number, the international "WMO weather code".
// This table turns the code into words and a symbol for the widget. Each row lists the
// codes that look the same to a reader.
const WEATHER_DESCRIPTIONS = [
  { codes: [0], description: 'Clear sky', icon: '☀️' },
  { codes: [1, 2], description: 'Partly cloudy', icon: '⛅' },
  { codes: [3], description: 'Cloudy', icon: '☁️' },
  { codes: [45, 48], description: 'Fog', icon: '🌫️' },
  { codes: [51, 53, 55, 56, 57], description: 'Drizzle', icon: '🌦️' },
  { codes: [61, 63, 65, 66, 67, 80, 81, 82], description: 'Rain', icon: '🌧️' },
  { codes: [71, 73, 75, 77, 85, 86], description: 'Snow', icon: '🌨️' },
  { codes: [95, 96, 99], description: 'Thunderstorm', icon: '⛈️' },
];

// The last weather the service gave us: { city, temperature, description, icon, updatedAt }.
// null until the first successful call.
let lastGoodWeather = null;
// The call to Open-Meteo that is running right now (a Promise), or null.
let fetchInProgress = null;
// When the last call failed (milliseconds since 1970), or 0.
let lastFailureAt = 0;

/**
 * Reads the place to ask about from .env, with Tel Aviv as the default. A coordinate that
 * isn't a number (a typo in .env) falls back to the default instead of breaking the widget.
 *
 * @returns {{city: string, latitude: number, longitude: number}}
 */
function readConfiguredPlace() {
  const latitude = Number(process.env.WEATHER_LATITUDE);
  const longitude = Number(process.env.WEATHER_LONGITUDE);
  const hasCoordinates = process.env.WEATHER_LATITUDE && process.env.WEATHER_LONGITUDE
    && Number.isFinite(latitude) && Number.isFinite(longitude);
  return {
    city: process.env.WEATHER_CITY || DEFAULT_CITY,
    latitude: hasCoordinates ? latitude : DEFAULT_LATITUDE,
    longitude: hasCoordinates ? longitude : DEFAULT_LONGITUDE,
  };
}

/**
 * Turns a WMO weather code into words and a symbol. At night a clear sky gets a moon.
 *
 * @param {number} weatherCode - Open-Meteo's weather_code.
 * @param {boolean} isDay - false at night.
 * @returns {{description: string, icon: string}}
 */
function describeWeatherCode(weatherCode, isDay) {
  const row = WEATHER_DESCRIPTIONS.find((candidate) => candidate.codes.includes(weatherCode));
  if (!row) {
    return { description: 'Unknown', icon: '🌡️' };
  }
  if (!isDay && weatherCode <= 2) {
    return { description: row.description, icon: '🌙' };
  }
  return { description: row.description, icon: row.icon };
}

/**
 * Calls Open-Meteo once and turns its answer into our own small object, with only the
 * fields the widget shows (the contract { city, temperature, description, icon, updatedAt }).
 *
 * @returns {Promise<{city: string, temperature: number, description: string, icon: string, updatedAt: Date}>}
 * @throws {Error} If the call fails, times out, or the answer isn't in the expected shape.
 */
async function fetchWeatherFromApi() {
  const place = readConfiguredPlace();
  // URLSearchParams builds and encodes the query string. "current" asks only for the three
  // values we show; units are Celsius by default.
  const query = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: 'temperature_2m,weather_code,is_day',
  });
  const response = await fetch(`${OPEN_METEO_URL}?${query.toString()}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Open-Meteo answered with status ${response.status}`);
  }

  const data = await response.json();
  // An outside service can change or break its answer; we check the fields we use instead
  // of letting "data.current is undefined" crash the request.
  const current = data && data.current;
  if (!current || typeof current.temperature_2m !== 'number' || typeof current.weather_code !== 'number') {
    throw new Error('Open-Meteo answered in an unexpected format');
  }

  const { description, icon } = describeWeatherCode(current.weather_code, current.is_day === 1);
  return {
    city: place.city,
    temperature: Math.round(current.temperature_2m),
    description: description,
    icon: icon,
    updatedAt: new Date(),
  };
}

/**
 * Refreshes lastGoodWeather with one call to Open-Meteo. If a call is already running,
 * returns that same call instead of starting another one (all waiting readers share it).
 *
 * The returned promise never rejects: a failure is logged and remembered in lastFailureAt,
 * and getWeather then decides what to answer.
 *
 * @returns {Promise<void>} Resolves when the call has finished, successfully or not.
 */
function refreshWeather() {
  if (fetchInProgress === null) {
    fetchInProgress = fetchWeatherFromApi()
      .then((weather) => {
        lastGoodWeather = weather;
        lastFailureAt = 0;
      })
      .catch((error) => {
        lastFailureAt = Date.now();
        logger.warn(`Weather service failed: ${error.message}`);
      })
      .finally(() => {
        // Cleared whatever happened, so the next refresh can start a new call.
        fetchInProgress = null;
      });
  }
  return fetchInProgress;
}

/**
 * Tells whether the cached weather is younger than the given age.
 *
 * @param {number} maxAgeMs - The age limit, in milliseconds.
 * @returns {boolean} true if there is a cached copy younger than maxAgeMs.
 */
function isCachedWeatherYoungerThan(maxAgeMs) {
  return lastGoodWeather !== null && Date.now() - lastGoodWeather.updatedAt.getTime() < maxAgeMs;
}

/**
 * Returns the current weather, from the shared copy when it is fresh enough, otherwise
 * after refreshing it (see the header for the rules).
 *
 * @returns {Promise<{city: string, temperature: number, description: string, icon: string, updatedAt: Date}>}
 * @throws {Error} "Weather unavailable" when there is no copy younger than 10 minutes
 *   (the controller answers 503 and the widget says so).
 */
async function getWeather() {
  // The common case: thousands of requests answered from memory, with no outside call.
  if (isCachedWeatherYoungerThan(REFRESH_AFTER_MS)) {
    return lastGoodWeather;
  }

  // Right after a failure we don't call again on every request; the last good copy (if it
  // is still young enough) is served meanwhile.
  if (Date.now() - lastFailureAt >= RETRY_AFTER_FAILURE_MS) {
    await refreshWeather();
  }

  if (isCachedWeatherYoungerThan(MAX_AGE_MS)) {
    return lastGoodWeather;
  }
  throw new Error('Weather unavailable');
}

module.exports = { getWeather };
