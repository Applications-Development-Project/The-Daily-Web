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

  /**
   * Puts a theme on the page.
   *
   * @param {('light'|'dark')} theme - The theme to show.
   * @returns {void}
   */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
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
})();
