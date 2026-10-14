/**
 * public/js/public/login.js
 *
 * Runs the login page (views/public/login.ejs): sends the username and password with
 * fetch (Ajax) to POST /api/auth/login, shows a wrong password right on the page without
 * reloading it, and on success goes to the address the server answered (/reporter or
 * /editor, decided on the server from the user's role).
 *
 * The check in this file (both fields filled) only gives a quick answer. The server checks
 * everything again in controllers/authController.js, because anything in the browser can
 * be bypassed by sending the request directly.
 *
 * It used to be an inline script at the end of login.ejs; it moved here so every page's
 * browser code lives in public/js/<area>/, next to the other pages of the same area.
 *
 * Loaded by: views/public/login.ejs, after public/js/shared/apiClient.js (this file calls apiClient).
 * Related: controllers/authController.js (logIn), the ids "login-form", "login-error" and
 * "login-button" in login.ejs.
 * Owner: OS.
 */

/**
 * Connects the login form once the page has loaded. Does nothing if the form is missing,
 * so a mistake in the HTML can't cause a script error.
 *
 * @returns {void}
 */
function setUpLoginForm() {
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const loginButton = document.getElementById('login-button');

  if (!loginForm || !loginError || !loginButton) {
    return;
  }

  /**
   * Shows an error under the form. textContent (not innerHTML) puts the message in
   * as plain text, so a message can never add HTML or scripts to the page.
   *
   * @param {string} message - The text to show.
   * @returns {void}
   */
  function showLoginError(message) {
    loginError.textContent = message;
    loginError.hidden = false;
  }

  /**
   * Sends the username and password with fetch instead of the browser's normal
   * form submit, then goes to the user's area, or shows the server's error.
   *
   * @param {SubmitEvent} event - The form's submit event.
   * @returns {Promise<void>}
   */
  async function submitLoginForm(event) {
    // Stop the normal submit, which would load a new page.
    event.preventDefault();

    const username = loginForm.elements.username.value.trim();
    const password = loginForm.elements.password.value;

    // Checked here for a quick answer, and checked again on the server,
    // because anything in the browser can be bypassed.
    if (username === '' || password === '') {
      showLoginError('Please enter your username and password.');
      return;
    }

    // Disabled while waiting, so a double click doesn't send two logins.
    loginButton.disabled = true;
    loginError.hidden = true;

    const result = await apiClient.post('/api/auth/login', { username: username, password: password });

    if (!result.success) {
      // For example 401 "Wrong username or password." (the same message whether the
      // username exists or not, so the form can't be used to discover usernames).
      showLoginError(result.error);
      loginButton.disabled = false;
      return;
    }

    // The server decides where each role goes; the browser only follows.
    window.location.assign(result.data.redirectTo);
  }

  loginForm.addEventListener('submit', submitLoginForm);
}

document.addEventListener('DOMContentLoaded', setUpLoginForm);
