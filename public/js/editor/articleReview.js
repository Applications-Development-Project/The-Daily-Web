/**
 * public/js/editor/articleReview.js
 *
 * The buttons and forms of the editor's review page: Approve, Return (with a note) and
 * the Edit form. After a successful action the page reloads, because the whole page
 * (status, buttons, history) changes and is rendered on the server.
 *
 * The server makes every real check; this script sends the request and shows the
 * answer (409 if someone already decided, 401 if the session ended).
 *
 * Loaded by: views/editor/articleReview.ejs, after public/js/shared/apiClient.js.
 * Owner: SM.
 */

/**
 * Connects the review page's buttons and forms. Each part is optional: the server shows
 * them only when they apply.
 *
 * @returns {void}
 */
function setUpArticleReview() {
  const reviewElement = document.getElementById('article-review');
  if (!reviewElement) {
    return;
  }
  const articleUrl = `/api/editor/articles/${encodeURIComponent(reviewElement.dataset.articleId)}`;

  /**
   * Shows a message in the decision box.
   *
   * @param {string} text - The message.
   * @param {string} className - '', 'form-error' or 'loading'.
   * @returns {void}
   */
  function showDecisionMessage(text, className) {
    const message = document.getElementById('decision-message');
    message.textContent = text;
    message.className = className;
    message.hidden = false;
  }

  /**
   * Turns the decision buttons off while a decision is on its way (no double decisions).
   *
   * @param {boolean} disabled
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
      showDecisionMessage(result.error, 'form-error');
    }
  }

  /**
   * Approve, after a confirmation, because readers see the new version at once.
   *
   * @returns {Promise<void>}
   */
  async function approveArticle() {
    const confirmed = await showConfirmDialog('Publish this version? Readers will see it immediately.', 'Publish');
    if (confirmed) {
      sendDecision('approve');
    }
  }

  /**
   * Return: the note is required. Checked here for a quick message; the server checks again.
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
   * Saves the Edit form, then reloads the page. For a live article, saving publishes the
   * change, so it asks first. On an error, the form keeps what the editor typed.
   *
   * @param {SubmitEvent} event - The edit form's submit event.
   * @returns {Promise<void>}
   */
  async function saveEdit(event) {
    event.preventDefault();
    const publishesOnSave = event.target.dataset.publishesOnSave === 'true';
    if (publishesOnSave && !(await showConfirmDialog('Publish these changes? Readers will see them immediately.', 'Publish'))) {
      return;
    }
    const editMessage = document.getElementById('edit-message');
    const saveButton = event.target.querySelector('button[type="submit"]');
    // The whole draft is sent, like the reporter's autosave.
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