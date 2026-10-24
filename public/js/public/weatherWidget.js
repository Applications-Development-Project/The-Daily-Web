/**
 * public/js/public/weatherWidget.js
 *
 * Fills the sidebar's weather widget from our own GET /api/weather (never the weather
 * service directly, so all readers share one cached copy) and refreshes it every 5
 * minutes: the server never serves a copy older than 10, so the screen is always under
 * 15 minutes old. On any failure it shows "Weather unavailable" instead of old weather.
 *
 * Loaded by: views/public/feed.ejs and article.ejs, after public/js/shared/apiClient.js.
 * Owner: SH.
 */

const WEATHER_REFRESH_MS = 5 * 60 * 1000;

/**
 * Loads the widget now and every 5 minutes. Does nothing on a page without the widget.
 *
 * @returns {void}
 */
function setUpWeatherWidget() {
  const widget = document.getElementById('weather-widget');
  const content = document.getElementById('weather-content');
  if (!widget || !content) {
    return;
  }

  // When the widget was last loaded, for the "tab shown again" check.
  let lastLoadAt = 0;

  /**
   * Shows the weather from the server's answer (textContent: nothing runs as HTML).
   *
   * @param {{city: string, temperature: number, description: string, icon: string, updatedAt: string}} weather
   * @returns {void}
   */
  function showWeather(weather) {
    const wrapper = document.createElement('div');
    wrapper.className = 'weather-info';

    // aria-hidden: the description says it in words, so screen readers don't read it twice.
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
    const updated = document.createElement('p');
    updated.className = 'weather-updated';
    const updatedAt = new Date(weather.updatedAt);
    updated.textContent = `Updated ${updatedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
    text.append(city, details, updated);
    wrapper.append(text);

    content.replaceChildren(wrapper);
  }

  /**
   * Asks our server for the weather and shows it, or "Weather unavailable".
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
   * Browsers slow down timers in hidden tabs, so when the tab is shown again after more
   * than 5 minutes, load the weather at once.
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
