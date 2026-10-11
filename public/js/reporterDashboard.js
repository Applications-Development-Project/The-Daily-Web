/**
 * public/js/reporterDashboard.js
 *
 * The interactive parts of the reporter dashboard:
 *   1. The "New article" button. Clicking it asks the server to create an empty draft
 *      (POST /api/reporter/articles) and then opens the edit page of the new article,
 *      where the autosave takes over.
 *   2. The "Submit for approval" buttons in the table (POST /api/reporter/articles/:id/submit).
 *      On success the page reloads, so the table is drawn again by the server with the new
 *      status ("Awaiting editor approval", no Edit button).
 * The rest of the dashboard (the table of articles) is rendered on the server and
 * needs no script.
 *
 * Requirements served: "a reporter can create a new article" and "a reporter can send a
 * finished article to the editor", both with Ajax (fetch) and no full-page form submit.
 *
 * Used by: views/reporter/dashboard.ejs (loaded at the end of the page, after
 * /js/shared/apiClient.js, because this file calls apiClient).
 * Related: controllers/reporterController.js (createArticle, submitArticleForApproval), the
 * element ids "new-article-button" and "new-article-error" and the classes
 * "submit-article-button" and "submit-error" in dashboard.ejs.
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

/**
 * Makes every "Submit for approval" button in the table work, with ONE click listener on
 * the whole page instead of one listener per button (event delegation). A click on any
 * element bubbles up to the page, and we look for the button it came from with closest().
 * This way the number of buttons doesn't matter, and it keeps working if rows are added later.
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
 * Sends one article to the editor and reloads the page, or shows why it could not be sent.
 *
 * The server does all the checking (the article is yours, the required fields are filled
 * in, its status allows it). The page only shows the server's answer. Nothing needs to be
 * saved first: the editor page saves continuously, so the draft in the database is already
 * the latest one, and the server checks that saved draft.
 *
 * @param {HTMLButtonElement} submitButton - The button that was clicked; its data-article-id
 *   attribute holds the article id (written by the server into the page).
 * @returns {Promise<void>}
 */
async function submitArticleFromDashboard(submitButton) {
  // The error paragraph is the one right after the button, in the same table cell.
  const submitError = submitButton.parentElement.querySelector('.submit-error');

  // Disable first, so a double click can't send the same request twice.
  submitButton.disabled = true;
  if (submitError) {
    submitError.textContent = '';
  }

  // The body is empty on purpose: the article id is in the URL, the reporter comes from the
  // session, and the new status is decided by the server, never by the browser.
  const result = await apiClient.post('/api/reporter/articles/' + submitButton.dataset.articleId + '/submit', {});

  if (!result.success) {
    // textContent, never innerHTML: the message comes from the network and must be shown as
    // plain text. The button is enabled again so the reporter can fix the problem and retry.
    if (submitError) {
      submitError.textContent = result.error;
    }
    submitButton.disabled = false;
    return;
  }

  // Reloading shows the server's own version of the table: the new status label, and no
  // Edit or Submit button for a pending article. The button stays disabled until then.
  window.location.reload();
}

// The script is loaded at the end of the page, but waiting for DOMContentLoaded
// guarantees the buttons exist, the same pattern as the other page scripts.
document.addEventListener('DOMContentLoaded', setUpReporterDashboard);
document.addEventListener('DOMContentLoaded', setUpSubmitButtons);
