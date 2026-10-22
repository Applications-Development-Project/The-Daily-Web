/**
 * public/js/shared/confirmDialog.js
 *
 * The site's confirmation box, in place of window.confirm(): an HTML5 <dialog> in the
 * site's style, with the action named on the button ("Delete", "Publish") instead of a
 * plain "OK". showModal() keeps the rest of the page unclickable while it is open, and
 * Escape cancels, as with window.confirm().
 *
 * It only protects the editor from a slip of the mouse; it is not a security check.
 * Every permission is still checked on the server.
 *
 * Loaded by: the editor pages (views/editor/dashboard.ejs, articleReview.ejs, analytics.ejs,
 * comments.ejs, users.ejs), before the page's own script.
 * Styles: .confirm-dialog in public/css/main.css.
 * Owner: SH.
 */

// Built on first use and reused, so the page holds at most one dialog.
let confirmDialog = null;
// The resolve function of the question being asked now.
let resolveCurrentQuestion = null;

/**
 * Builds the dialog once and adds it to the page.
 *
 * @returns {HTMLDialogElement}
 */
function createConfirmDialog() {
  const dialog = document.createElement('dialog');
  // "card" gives it the site's background, border and shadow.
  dialog.className = 'card confirm-dialog';

  const message = document.createElement('p');
  message.className = 'confirm-message';

  // Cancel comes first, so showModal() puts the focus on it: Enter alone never deletes.
  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'btn btn-secondary';
  cancelButton.textContent = 'Cancel';
  cancelButton.addEventListener('click', () => dialog.close('cancel'));

  const confirmButton = document.createElement('button');
  confirmButton.type = 'button';
  confirmButton.className = 'btn confirm-button';
  confirmButton.addEventListener('click', () => dialog.close('confirm'));

  const actions = document.createElement('div');
  actions.className = 'confirm-actions';
  actions.append(cancelButton, confirmButton);
  dialog.append(message, actions);
  document.body.append(dialog);

  // "close" fires for the two buttons and for Escape (which leaves returnValue empty).
  dialog.addEventListener('close', () => {
    const confirmed = dialog.returnValue === 'confirm';
    dialog.returnValue = '';
    if (resolveCurrentQuestion) {
      resolveCurrentQuestion(confirmed);
      resolveCurrentQuestion = null;
    }
  });

  return dialog;
}

/**
 * Asks the editor to confirm an action and waits for the answer.
 *
 * @param {string} message - The question. Shown as text, never as HTML; "\n\n" starts a new paragraph.
 * @param {string} confirmLabel - The confirm button's text, naming the action, like "Delete" or "Publish".
 * @param {boolean} [isDestructive=false] - True for an action that can't be undone: the button is red.
 * @returns {Promise<boolean>} True if the editor confirmed; false for Cancel or Escape.
 */
function showConfirmDialog(message, confirmLabel, isDestructive = false) {
  if (!confirmDialog) {
    confirmDialog = createConfirmDialog();
  }

  confirmDialog.querySelector('.confirm-message').textContent = message;
  const confirmButton = confirmDialog.querySelector('.confirm-button');
  confirmButton.textContent = confirmLabel;
  confirmButton.classList.toggle('btn-danger', isDestructive);
  confirmButton.classList.toggle('btn-primary', !isDestructive);

  return new Promise((resolve) => {
    resolveCurrentQuestion = resolve;
    confirmDialog.showModal();
  });
}
