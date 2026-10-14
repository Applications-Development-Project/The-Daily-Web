/**
 * public/js/editor/articleReview.js
 *
 * Runs the buttons and forms of the editor's review page (views/editor/articleReview.ejs):
 * - "Approve and publish"      POST /api/editor/articles/:id/approve
 * - "Return for corrections"   POST /api/editor/articles/:id/return with { note }
 * - The Edit form               PATCH /api/editor/articles/:id/draft with the five fields
 *   (any article; for a live article with no update in progress, saving publishes it)
 * Everything else on the page (the two versions side by side, the history) is rendered on
 * the server, so it needs no script.
 *
 * After a successful action the page reloads, so the status, the buttons and the publish
 * history come fresh from the server. Why a reload here and not for search or paging: the
 * requirements ask for no full reload in interactive areas like search, filtering, paging
 * and comments. After a decision the whole page changes (status, buttons, history), and all
 * of it is rendered on the server, so reloading shows the true new state without repeating
 * the page's rendering in JavaScript.
 *
 * The server makes every real check (editor role, pending status, the note, the field
 * rules); these functions only send the request and show the answer, including 409 when
 * someone already decided and 401 when the session ended. Text from the server is shown
 * with textContent, never innerHTML.
 *
 * It used to be an inline script at the end of articleReview.ejs; it moved here so every
 * page's browser code lives in public/js/<area>/.
 *
 * Loaded by: views/editor/articleReview.ejs, after public/js/shared/apiClient.js.
 * Related: controllers/editorController.js (approveArticle, returnArticleToReporter,
 * editArticleDraft). Element ids used: article-review (with data-article-id), decision-message,
 * review-decision, approve-button, return-form, return-note, edit-form, edit-message and the
 * edit-* fields.
 * Owner: SM.
 */

/**
 * Connects the review page's buttons and forms once the page has loaded. Each part is
 * optional: the server shows the buttons only when the workflow allows them (an article
 * awaiting approval), so on other articles there is nothing to connect.
 *
 * @returns {void}
 */
function setUpArticleReview() {
  const reviewElement = document.getElementById('article-review');
  if (!reviewElement) {
    return;
  }
  // The article id is written by the server into data-article-id; encodeURIComponent keeps
  // it inside the URL path whatever it holds.
  const articleUrl = `/api/editor/articles/${encodeURIComponent(reviewElement.dataset.articleId)}`;

  /**
   * Shows a message in the decision box.
   *
   * @param {string} text - The message.
   * @param {string} className - '' for a normal message, 'form-error' for an error, 'loading' while waiting.
   * @returns {void}
   */
  function showDecisionMessage(text, className) {
    const message = document.getElementById('decision-message');
    message.textContent = text;
    message.className = className;
    message.hidden = false;
  }

  /**
   * Turns every decision button on or off, so the editor can't send a second
   * decision while the first one is on its way.
   *
   * @param {boolean} disabled - true while a decision is being sent.
   * @returns {void}
   */
  function setDecisionButtonsDisabled(disabled) {
    document.querySelectorAll('#review-decision button').forEach(function (button) {
      button.disabled = disabled;
    });
  }

  /**
   * Sends one decision and handles the answer.
   *
   * @param {string} action - 'approve' or 'return' (the end of the API path).
   * @param {Object} [body] - { note } for a return.
   * @returns {Promise<void>}
   */
  async function sendDecision(action, body) {
    setDecisionButtonsDisabled(true);
    showDecisionMessage('Saving...', 'loading');

    const result = await apiClient.post(`${articleUrl}/${action}`, body);

    if (result.success) {
      showDecisionMessage(action === 'approve' ? 'Published. Reloading...' : 'Returned to the reporter. Reloading...', '');
      window.location.reload();
      return;
    }
    setDecisionButtonsDisabled(false);
    if (result.status === 401) {
      showDecisionMessage('Your session has ended. Please log in again in another tab, then try again.', 'form-error');
    } else {
      // For example 409 if someone already decided, or 400 for an empty note.
      showDecisionMessage(result.error, 'form-error');
    }
  }

  /**
   * Approve: asks for confirmation first, because readers see the new version at once.
   *
   * @returns {void}
   */
  function approveArticle() {
    const confirmed = window.confirm('Publish this version? Readers will see it immediately.');
    if (confirmed) {
      sendDecision('approve');
    }
  }

  /**
   * Return: the note is required (requirements: returning comes with a note). We check
   * it here for a quick message; the server checks it again (400 for an empty note).
   *
   * @param {SubmitEvent} event - The return form's submit event.
   * @returns {void}
   */
  function returnArticle(event) {
    // Stop the normal form submit, which would load a new page.
    event.preventDefault();
    const note = document.getElementById('return-note').value.trim();
    if (note === '') {
      showDecisionMessage('Please write a note telling the reporter what to fix.', 'form-error');
      return;
    }
    sendDecision('return', { note: note });
  }

  /**
   * Saves the editor's edit of the submitted version, then reloads the page, so the
   * comparison, the "(changed)" marks and the date come fresh from the server (the
   * same reason as after a decision). On an error the form keeps what the editor typed.
   * The server makes every real check (pending only, the field rules); a 400 message
   * names the field that is wrong.
   *
   * @param {SubmitEvent} event - The edit form's submit event.
   * @returns {Promise<void>}
   */
  async function saveEdit(event) {
    // Stop the normal form submit, which would load a new page.
    event.preventDefault();
    // Editing a live article publishes the change to readers at once, so ask first.
    const publishesOnSave = event.target.dataset.publishesOnSave === 'true';
    if (publishesOnSave && !window.confirm('Publish these changes? Readers will see them immediately.')) {
      return;
    }
    const editMessage = document.getElementById('edit-message');
    const saveButton = event.target.querySelector('button[type="submit"]');
    // All five fields are sent, as the server expects the whole draft (like the reporter's autosave).
    const draft = {
      title: document.getElementById('edit-title').value,
      summary: document.getElementById('edit-summary').value,
      category: document.getElementById('edit-category').value,
      imageUrl: document.getElementById('edit-image').value.trim(),
      body: document.getElementById('edit-body').value,
    };

    saveButton.disabled = true;
    editMessage.className = 'loading';
    editMessage.textContent = 'Saving...';
    editMessage.hidden = false;

    const result = await apiClient.patch(`${articleUrl}/draft`, draft);

    if (result.success) {
      editMessage.className = '';
      editMessage.textContent = result.data.published ? 'Published. Reloading...' : 'Saved. Reloading...';
      window.location.reload();
      return;
    }
    saveButton.disabled = false;
    editMessage.className = 'form-error';
    editMessage.textContent = result.status === 401
      ? 'Your session has ended. Please log in again in another tab, then save again.'
      // For example 400 (a field is invalid or empty) or 409 (a live article saved without changes).
      : result.error;
  }

  const editForm = document.getElementById('edit-form');
  if (editForm) {
    editForm.addEventListener('submit', saveEdit);
  }
  const approveButton = document.getElementById('approve-button');
  if (approveButton) {
    approveButton.addEventListener('click', approveArticle);
  }
  const returnForm = document.getElementById('return-form');
  if (returnForm) {
    returnForm.addEventListener('submit', returnArticle);
  }
}

document.addEventListener('DOMContentLoaded', setUpArticleReview);
