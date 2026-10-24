/**
 * public/js/shared/theme.js
 *
 * Chooses the light or the dark theme and puts it on the page as data-theme="light" or
 * data-theme="dark" on the <html> element. The stylesheet (public/css/main.css) redefines its
 * colour tokens under :root[data-theme="dark"], so this script is the only thing that
 * switches the theme.
 *
 * The choice: the one the reader saved in this browser (localStorage), else the theme their
 * system asks for (prefers-color-scheme). It is a display preference of one browser, so it
 * is not stored on the server: guests have no account to attach it to.
 *
 * It also runs the theme button in the header (#theme-toggle in views/partials/header.ejs):
 * a click switches the theme and saves the choice.
 *
 * Loaded by: views/partials/head.ejs, with a plain <script src> in the <head>, on purpose
 * WITHOUT defer or async. The browser then runs it before it draws the page, so a reader
 * who chose dark never sees a white flash first. It is small, so it delays nothing.
 *
 * Everything is inside one function so the names here cannot collide with another script's.
 * Owner: EZ.
 */
(function setUpTheme() {
  // The name under which the choice is saved in this browser.
  const THEME_STORAGE_KEY = 'theme';

  /**
   * Reads the theme the reader saved. localStorage can throw (private windows, blocked site
   * data), and then the page must still work, so any problem counts as "nothing saved".
   *
   * @returns {('light'|'dark'|null)} The saved theme, or null if there is none.
   */
  function readSavedTheme() {
    try {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      return savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : null;
    } catch (storageError) {
      return null;
    }
  }

  /**
   * Asks the browser which theme the reader's system prefers.
   *
   * @returns {('light'|'dark')} 'dark' if the system asks for it, else 'light'.
   */
  function readSystemTheme() {
    const systemIsDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return systemIsDark ? 'dark' : 'light';
  }

  // The button in the header (views/partials/header.ejs). It does not exist yet while this
  // script runs in the <head>; it is found once the page is built (see the end of the file).
  let toggleButton = null;

  /**
   * Shows on the button the theme a click would switch TO: a moon in the light theme, a sun
   * in the dark theme. The spoken name says the same, so a screen reader hears what the
   * button will do. U+FE0E asks for the plain text symbol: without it some systems draw the
   * sun as a coloured emoji that ignores the page's text colour.
   *
   * @param {('light'|'dark')} theme - The theme that is showing now.
   * @returns {void}
   */
  function updateToggleButton(theme) {
    if (!toggleButton) {
      return;
    }
    const isDark = theme === 'dark';
    toggleButton.textContent = isDark ? '☀︎' : '☾︎';
    const label = isDark ? 'Switch to the light theme' : 'Switch to the dark theme';
    toggleButton.setAttribute('aria-label', label);
    toggleButton.setAttribute('title', label);
  }

  /**
   * Puts a theme on the page, then announces it with a "themechange" event on document.
   * CSS follows data-theme by itself, but a <canvas> (the analytics chart) is painted once
   * with the colours of that moment, so its script listens for this event to paint again.
   * The first call runs in the <head>, before any script listens; that is fine, because
   * those scripts read the colours when they first draw.
   *
   * @param {('light'|'dark')} theme - The theme to show.
   * @returns {void}
   */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    updateToggleButton(theme);
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: theme } }));
  }

  /**
   * Saves the reader's choice in this browser. A failure (private window, blocked site
   * data) only means the choice is forgotten at the next page: the theme still switches.
   *
   * @param {('light'|'dark')} theme - The theme the reader chose.
   * @returns {void}
   */
  function saveTheme(theme) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (storageError) {
      // Nothing to do: see above.
    }
  }

  applyTheme(readSavedTheme() || readSystemTheme());

  // A reader who never chose a theme follows the system, also when the system changes
  // (for example at sunset) while the page is open. Once they choose, their choice wins.
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (readSavedTheme() === null) {
        applyTheme(readSystemTheme());
      }
    });
  }

  // The header exists once the page is built. The button is in the page hidden: without
  // JavaScript it could not do anything, so it is only shown here, where it works.
  document.addEventListener('DOMContentLoaded', function () {
    toggleButton = document.getElementById('theme-toggle');
    if (!toggleButton) {
      return;
    }

    toggleButton.hidden = false;
    updateToggleButton(document.documentElement.getAttribute('data-theme'));

    toggleButton.addEventListener('click', function () {
      const nextTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(nextTheme);
      saveTheme(nextTheme);
    });
  });
})();
