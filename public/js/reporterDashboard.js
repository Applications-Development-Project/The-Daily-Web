/**
 * public/js/reporterDashboard.js
 *
 * The one interactive part of the reporter dashboard: the "New article" button.
 * Clicking it asks the server to create an empty draft (POST /api/reporter/articles)
 * and then opens the edit page of the new article, where the autosave takes over.
 * The rest of the dashboard (the table of articles) is rendered on the server and
 * needs no script.
 *
 * Requirement served: "a reporter can create a new article", using Ajax (fetch)
 * and no full-page form submit.
 *
 * Used by: views/reporter/dashboard.ejs (loaded at the end of the page, after
 * /js/shared/apiClient.js, because this file calls apiClient).
 * Related: controllers/reporterController.js (createArticle), the element ids
 * "new-article-button" and "new-article-error" in dashboard.ejs.
 * Owner: EZ.
 *
 * This is a plain browser script (no modules), so every top-level name is shared with
 * the other scripts on the page. The names below are specific on purpose, so they can
 * never collide with apiClient.js.
 */

/**
 * Connects the "New article" button to createNewArticle once the page has loaded.
 * It does nothing if the button isn't on the page, so a mistake in the HTML can't
 * produce a JavaScript error.
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
 * Asks the server for a new empty article and opens its edit page.
 * On failure it shows the reason under the button and lets the reporter try again.
 *
 * @param {HTMLButtonElement} newArticleButton - The button that was clicked.
 * @param {HTMLElement} newArticleError - The element where an error message is shown.
 * @returns {Promise<void>}
 */
async function createNewArticle(newArticleButton, newArticleError) {
  // Disable the button first. Without this, a double click (or an impatient second
  // click while the server is still answering) would send two requests and create
  // two empty articles.
  newArticleButton.disabled = true;

  // Remove the message of a previous failed attempt, so an old error doesn't stay
  // on screen next to a new attempt.
  newArticleError.textContent = '';

  // The body is empty on purpose: the server decides everything (owner, status). The
  // browser doesn't send a reporter id because the server already knows who is logged
  // in from the session cookie, and an id sent by the browser could not be trusted.
  // apiClient never throws: a network failure also comes back as { success: false }.
  const result = await apiClient.post('/api/reporter/articles', {});

  if (!result.success || !result.data || !result.data.id) {
    // textContent, never innerHTML: the message comes from the network, and
    // textContent shows it as plain text, so it can never run as HTML or script.
    newArticleError.textContent = result.error || 'The article could not be created. Please try again.';
    // Enable the button again, so the reporter can retry after a failure.
    newArticleButton.disabled = false;
    return;
  }

  // The id comes from the server's answer, not from anything we made up: only the
  // database knows the id of the article it just created. The button stays disabled
  // on purpose, because the browser is leaving this page and a second click now
  // would create a second article.
  window.location.href = '/reporter/articles/' + result.data.id + '/edit';
}

// The script is loaded at the end of the page, but waiting for DOMContentLoaded
// guarantees the button exists, the same pattern as the other page scripts.
document.addEventListener('DOMContentLoaded', setUpReporterDashboard);
