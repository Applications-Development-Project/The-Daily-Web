/**
 * public/js/reporter/dashboard.js
 *
 * The reporter dashboard's buttons: "New article" (creates an empty draft and opens its
 * edit page) and "Submit for approval" (then the page reloads with the new status). The
 * table itself is rendered on the server.
 *
 * Loaded by: views/reporter/dashboard.ejs, after public/js/shared/apiClient.js.
 * Owner: EZ.
 */

/**
 * Connects the "New article" button. Does nothing if the button isn't on the page.
 *
 * @returns {void}
 */
function setUpReporterDashboard() {
  const newArticleButton = document.getElementById('new-article-button');
  const newArticleError = document.getElementById('new-article-error');

  if (!newArticleButton || !newArticleError) {
    return;
  }

  newArticleButton.addEventListener('click', function () {
    createNewArticle(newArticleButton, newArticleError);
  });
}

/**
 * Asks the server for a new empty article and opens its edit page, or shows why it failed.
 *
 * @param {HTMLButtonElement} newArticleButton - The button that was clicked.
 * @param {HTMLElement} newArticleError - Where an error message is shown.
 * @returns {Promise<void>}
 */
async function createNewArticle(newArticleButton, newArticleError) {
  // Disabled first, so a double click can't create two articles.
  newArticleButton.disabled = true;
  newArticleError.textContent = '';

  // Empty body: the server takes the owner from the session and decides the status.
  const result = await apiClient.post('/api/reporter/articles', {});

  if (!result.success || !result.data || !result.data.id) {
    // textContent: a message from the network is shown as text, never as HTML.
    newArticleError.textContent = result.error || 'The article could not be created. Please try again.';
    newArticleButton.disabled = false;
    return;
  }

  // The button stays disabled: the browser is leaving the page.
  window.location.href = '/reporter/articles/' + result.data.id + '/edit';
}

/**
 * Makes every "Submit for approval" button work with ONE click listener on the page
 * (event delegation): a click bubbles up, and closest() finds the button it came from.
 *
 * @returns {void}
 */
function setUpSubmitButtons() {
  document.addEventListener('click', function (event) {
    const submitButton = event.target.closest('.submit-article-button');
    if (submitButton) {
      submitArticleFromDashboard(submitButton);
    }
  });
}

/**
 * Sends one article to the editor and reloads the page, or shows the server's reason in
 * that row. The server does every check, on the draft it already saved.
 *
 * @param {HTMLButtonElement} submitButton - Its data-article-id holds the article id.
 * @returns {Promise<void>}
 */
async function submitArticleFromDashboard(submitButton) {
  const submitError = submitButton.parentElement.querySelector('.submit-error');

  // Disabled first, so a double click can't send it twice.
  submitButton.disabled = true;
  if (submitError) {
    submitError.textContent = '';
  }

  const result = await apiClient.post('/api/reporter/articles/' + submitButton.dataset.articleId + '/submit', {});

  if (!result.success) {
    if (submitError) {
      submitError.textContent = result.error;
    }
    submitButton.disabled = false;
    return;
  }

  // The server redraws the table with the new status.
  window.location.reload();
}

document.addEventListener('DOMContentLoaded', setUpReporterDashboard);
document.addEventListener('DOMContentLoaded', setUpSubmitButtons);
