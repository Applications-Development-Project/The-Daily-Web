/**
 * public/js/public/login.js
 *
 * The login page: sends the username and password to POST /api/auth/login with fetch,
 * shows an error without reloading, and on success goes where the server says
 * (/reporter or /editor, decided from the role). The server checks everything again.
 *
 * Loaded by: views/public/login.ejs, after public/js/shared/apiClient.js.
 * Owner: OS.
 */

/**
 * Connects the login form. Does nothing if a piece of the form is missing.
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
   * Shows an error under the form, as text.
   *
   * @param {string} message
   * @returns {void}
   */
  function showLoginError(message) {
    loginError.textContent = message;
    loginError.hidden = false;
  }

  /**
   * Sends the form with fetch, then goes to the user's area or shows the server's error.
   *
   * @param {SubmitEvent} event
   * @returns {Promise<void>}
   */
  async function submitLoginForm(event) {
    event.preventDefault();

    const username = loginForm.elements.username.value.trim();
    const password = loginForm.elements.password.value;

    // A quick answer only; the server checks again.
    if (username === '' || password === '') {
      showLoginError('Please enter your username and password.');
      return;
    }

    // Disabled while waiting, so a double click doesn't send two logins.
    loginButton.disabled = true;
    loginError.hidden = true;

    const result = await apiClient.post('/api/auth/login', { username: username, password: password });

    if (!result.success) {
      showLoginError(result.error);
      loginButton.disabled = false;
      return;
    }

    // The server decides where each role goes.
    window.location.assign(result.data.redirectTo);
  }

  loginForm.addEventListener('submit', submitLoginForm);
}

document.addEventListener('DOMContentLoaded', setUpLoginForm);
