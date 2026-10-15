/**
 * services/weatherService.js
 *
 * The sidebar's weather from Open-Meteo, kept in memory so all readers share one copy.
 * Open-Meteo is free and needs no key or credit card, so it works on any computer
 * (a keyed service would fail on the lecturer's, since .env isn't in the repository).
 *
 * At most 15 minutes old: a copy younger than 5 minutes is served as it is (so Open-Meteo
 * is called at most every 5 minutes, however many readers); a copy is never served after
 * 10 minutes; the widget asks again every 5 minutes. 10 + 5 = 15.
 *
 * Used by: controllers/weatherController.js.
 * Owner: SH.
 */

const logger = require('./logger');

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

// Used when .env doesn't set a place.
const DEFAULT_CITY = 'Tel Aviv';
const DEFAULT_LATITUDE = 32.0853;
const DEFAULT_LONGITUDE = 34.7818;

const MINUTE_MS = 60 * 1000;
const REFRESH_AFTER_MS = 5 * MINUTE_MS;
const MAX_AGE_MS = 10 * MINUTE_MS;
// While the service is down, try again at most once a minute, not on every request.
const RETRY_AFTER_FAILURE_MS = 1 * MINUTE_MS;
// A service that never answers can't make readers wait forever.
const REQUEST_TIMEOUT_MS = 5000;

// Open-Meteo gives an international "WMO weather code"; this turns it into words and a symbol.
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

// The last good weather (null until the first success), the call running now (a Promise
// shared by everyone who waits), and when the last call failed.
let lastGoodWeather = null;
let fetchInProgress = null;
let lastFailureAt = 0;

/**
 * Reads the place from .env, with Tel Aviv as the default (also for a coordinate typo).
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
 * Turns a WMO weather code into words and a symbol (a moon for a clear night).
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
 * Calls Open-Meteo once and keeps only the widget's fields.
 *
 * @returns {Promise<{city: string, temperature: number, description: string, icon: string, updatedAt: Date}>}
 * @throws {Error} If the call fails, times out, or the answer isn't in the expected shape.
 */
async function fetchWeatherFromApi() {
  const place = readConfiguredPlace();
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
  // An outside answer can change: check the fields instead of crashing on undefined.
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
 * Refreshes the shared copy with one call. If a call is already running, everyone waits
 * for that same call (1,000 readers at once still make one call). Never rejects: a
 * failure is logged as a warning (an outside service down is expected, not our bug).
 *
 * @returns {Promise<void>}
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
        fetchInProgress = null;
      });
  }
  return fetchInProgress;
}

/**
 * Tells whether the shared copy is younger than the given age.
 *
 * @param {number} maxAgeMs - The age limit, in milliseconds.
 * @returns {boolean}
 */
function isCachedWeatherYoungerThan(maxAgeMs) {
  return lastGoodWeather !== null && Date.now() - lastGoodWeather.updatedAt.getTime() < maxAgeMs;
}

/**
 * Returns the current weather: the shared copy when fresh enough, otherwise after a refresh.
 *
 * @returns {Promise<{city: string, temperature: number, description: string, icon: string, updatedAt: Date}>}
 * @throws {Error} "Weather unavailable" when no copy is younger than 10 minutes.
 */
async function getWeather() {
  // The common case: answered from memory.
  if (isCachedWeatherYoungerThan(REFRESH_AFTER_MS)) {
    return lastGoodWeather;
  }

  if (Date.now() - lastFailureAt >= RETRY_AFTER_FAILURE_MS) {
    await refreshWeather();
  }

  if (isCachedWeatherYoungerThan(MAX_AGE_MS)) {
    return lastGoodWeather;
  }
  throw new Error('Weather unavailable');
}

module.exports = { getWeather };
