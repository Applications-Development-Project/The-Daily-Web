/**
 * public/js/public/weatherWidget.js
 *
 * Fills the weather widget in the sidebar (views/partials/sidebar.ejs) from our own
 * GET /api/weather, and refreshes it every 5 minutes while the page stays open.
 *
 * Why the browser asks OUR server and never the weather service (Open-Meteo) directly:
 * every reader shares the server's one cached copy, so thousands of readers cause at most
 * one call to Open-Meteo every 5 minutes (services/weatherService.js).
 *
 * Why refresh every 5 minutes: the requirements allow the weather a reader sees to be at
 * most 15 minutes old. The server never hands out a copy older than 10 minutes, and this
 * script asks again every 5, so what is on the screen is always under 10 + 5 = 15 minutes
 * old, even on a page that stays open for hours. A browser slows down timers in a hidden
 * tab, so we also refresh as soon as the tab is shown again if the last load is too old.
 *
 * What the reader sees in each case:
 * - success: a weather symbol, the city, temperature, description and "Updated 14:32";
 * - any failure (the service is down, our server can't be reached):
 *   "Weather unavailable". The old weather is removed rather than left on the screen,
 *   because it might be older than the 15 minutes allowed. The page itself is not affected.
 *
 * Every value is put on the page with textContent, never with innerHTML, so nothing in the
 * answer can run as HTML.
 *
 * Loaded by: views/public/feed.ejs and views/public/article.ejs (the pages with the
 * sidebar), after public/js/shared/apiClient.js.
 * Related: controllers/weatherController.js, services/weatherService.js.
 * Owner: SH.
 */

const WEATHER_REFRESH_MS = 5 * 60 * 1000;

/**
 * Connects the widget once the page has loaded: loads it now, then every 5 minutes.
 * Does nothing on a page without the widget.
 *
 * @returns {void}
 */
function setUpWeatherWidget() {
  const widget = document.getElementById('weather-widget');
  const content = document.getElementById('weather-content');
  if (!widget || !content) {
    return;
  }

  // When the widget was last loaded successfully or not (milliseconds), for the
  // "tab shown again" check.
  let lastLoadAt = 0;

  /**
   * Shows the weather from the server's answer.
   *
   * @param {{city: string, temperature: number, description: string, icon: string, updatedAt: string}} weather
   * @returns {void}
   */
  function showWeather(weather) {
    const wrapper = document.createElement('div');
    wrapper.className = 'weather-info';

    // The icon is a symbol such as a sun or a cloud (chosen on the server). aria-hidden: the
    // description below already says it in words, so screen readers don't read it twice.
    const icon = document.createElement('span');
    icon.className = 'weather-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = weather.icon;
    wrapper.append(icon);

    const text = document.createElement('div');
    const city = document.createElement('strong');
    city.textContent = weather.city;
    const details = document.createElement('p');
    details.textContent = `${weather.temperature}°C, ${weather.description}`;
    // The time tells the reader how fresh the data is.
    const updated = document.createElement('p');
    updated.className = 'weather-updated';
    const updatedAt = new Date(weather.updatedAt);
    updated.textContent = `Updated ${updatedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
    text.append(city, details, updated);
    wrapper.append(text);

    // replaceChildren swaps the old content for the new in one step.
    content.replaceChildren(wrapper);
  }

  /**
   * Asks our server for the weather and shows the answer, or "Weather unavailable".
   * apiClient never throws: a network failure also comes back as { success: false }.
   *
   * @returns {Promise<void>}
   */
  async function loadWeather() {
    lastLoadAt = Date.now();
    const result = await apiClient.get('/api/weather');
    widget.classList.remove('loading');
    if (result.success) {
      showWeather(result.data);
    } else {
      content.textContent = 'Weather unavailable';
    }
  }

  /**
   * When a hidden tab is shown again, its timer may have been slowed down by the browser,
   * so the weather may be older than 5 minutes: load it now in that case.
   *
   * @returns {void}
   */
  function refreshIfShownAfterLongTime() {
    if (document.visibilityState === 'visible' && Date.now() - lastLoadAt >= WEATHER_REFRESH_MS) {
      loadWeather();
    }
  }

  loadWeather();
  setInterval(loadWeather, WEATHER_REFRESH_MS);
  document.addEventListener('visibilitychange', refreshIfShownAfterLongTime);
}

document.addEventListener('DOMContentLoaded', setUpWeatherWidget);
