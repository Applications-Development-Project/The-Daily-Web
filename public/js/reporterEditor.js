/**
 * public/js/reporterEditor.js
 *
 * The autosave client of the reporter's article editor. There is no "Save" button:
 * a moment after the reporter stops typing, this script sends the whole draft to the
 * server (PATCH /api/reporter/articles/:id/draft) and shows the result in a status line.
 *
 * Requirement served (in our own words): the reporter's work is saved continuously,
 * without pressing "Save", and closing the browser, refreshing, or moving to another
 * computer must not lose it. This file does the "continuously" part; the "not lost" part
 * works because the text is stored on the SERVER (the database). We never keep the draft
 * in the browser (no localStorage), because browser storage exists on one computer only.
 * The edit page is always filled from the server's copy (controllers/reporterController.js,
 * showArticleEditor), so a refresh or another computer shows the last saved version.
 *
 * What this commit does: debounce (wait for a pause in typing), a status line, and the
 * "never two saves at once" rule.
 * Still missing (the next commit): retrying automatically after a failure, and saving when
 * the page is being closed (fetch with keepalive).
 *
 * Used by: views/reporter/articleEditor.ejs (loaded at the end of the page, after
 * /js/shared/apiClient.js, because this file calls apiClient).
 * Related: controllers/reporterController.js (autosaveDraft, which validates everything
 * again on the server), the ids "article-form" and "save-status" in articleEditor.ejs.
 * Owner: EZ.
 *
 * This is a plain browser script (no modules), so top-level names are shared with
 * apiClient.js. The names below are specific on purpose so they can't collide with it.
 */

// How long to wait after the LAST keystroke before saving. 2 seconds is the value in
// the plan: long enough that we don't send a request for every letter, short enough
// that very little work is at risk.
const AUTOSAVE_DELAY_MS = 2000;

// The five fields of a draft. Each one is a form control whose "name" attribute is the
// same word (the names fixed in "Shared contracts", the same ones the server expects).
const DRAFT_FIELD_NAMES = ['title', 'summary', 'category', 'imageUrl', 'body'];

/**
 * Turns the save time sent by the server into "14:32" for the status line.
 * If the value can't be read as a date (it should always be valid), it falls back to the
 * browser's current time, so the status line never shows "Invalid Date".
 *
 * @param {string} savedAt - An ISO date text, for example "2026-10-10T11:32:05.000Z".
 * @returns {string} The time of day, hours and minutes, for example "14:32".
 */
function formatSavedTime(savedAt) {
  let savedDate = new Date(savedAt);
  if (Number.isNaN(savedDate.getTime())) {
    savedDate = new Date();
  }
  return savedDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Connects the editor form to the autosave logic once the page has loaded.
 * It does nothing if the form, the status line, or any of the five fields is missing,
 * so a mistake in the HTML can't produce a JavaScript error while the reporter types.
 *
 * All the state (the timer and the two flags) lives inside this function, as variables
 * the inner functions share, so no other script can change it by accident.
 *
 * @returns {void}
 */
function setUpReporterEditor() {
  const articleForm = document.getElementById('article-form');
  const saveStatus = document.getElementById('save-status');

  if (!articleForm || !saveStatus) {
    return;
  }

  // The article id comes from data-article-id, written by the server into the form.
  // The browser doesn't need to know who the reporter is: the server takes that from the
  // session cookie and checks that this article belongs to them.
  const articleId = articleForm.dataset.articleId;
  const fields = DRAFT_FIELD_NAMES.map(function (fieldName) {
    return articleForm.elements[fieldName];
  });

  if (!articleId || fields.some(function (field) { return !field; })) {
    return;
  }

  // The debounce timer. Every keystroke cancels the old timer and starts a new one, so
  // the save only happens after 2 quiet seconds (see scheduleSave).
  let saveTimerId = null;
  // true while a request is on its way to the server (see requestSave).
  let isSaving = false;
  // true if the timer fired while a save was still running (see requestSave).
  let saveRequestedWhileSaving = false;

  /**
   * Shows a message in the status line. textContent, never innerHTML: the message can
   * contain text that came from the server (an error), and textContent shows it as plain
   * text, so it can never run as HTML or script.
   *
   * @param {string} message - The text to show.
   * @returns {void}
   */
  function showStatus(message) {
    saveStatus.textContent = message;
  }

  /**
   * Reads the CURRENT value of the five fields. It is called at the moment of sending
   * (not when the timer was started), so the request always carries the latest text,
   * including anything typed during the wait.
   *
   * @returns {{title: string, summary: string, category: string, imageUrl: string, body: string}}
   *   The whole draft, which is what the server expects (it replaces the saved draft).
   */
  function readDraftFromForm() {
    const draft = {};
    DRAFT_FIELD_NAMES.forEach(function (fieldName) {
      draft[fieldName] = articleForm.elements[fieldName].value;
    });
    return draft;
  }

  /**
   * Debounce: called on every change. It cancels the waiting timer and starts a new one,
   * so while the reporter keeps typing nothing is sent, and exactly one save happens
   * 2 seconds after the last change. Without this, every single letter would send a
   * request (dozens per minute per reporter) and slow the server down for no benefit.
   *
   * @returns {void}
   */
  function scheduleSave() {
    clearTimeout(saveTimerId);
    saveTimerId = setTimeout(requestSave, AUTOSAVE_DELAY_MS);
  }

  /**
   * Called when the timer fires. Enforces "never two saves at once" (single flight).
   * If a save is already running, we only remember that another one is wanted, and
   * saveDraft starts it as soon as the first one finishes.
   *
   * Why not allow two at once: two requests in flight can arrive at the server in the
   * wrong order, and the OLDER text could overwrite the newer one. Running them one after
   * the other guarantees the last request carries the latest text, so it is the one that
   * ends up saved.
   *
   * @returns {void}
   */
  function requestSave() {
    if (isSaving) {
      saveRequestedWhileSaving = true;
      return;
    }
    saveDraft();
  }

  /**
   * Sends the whole draft to the server and shows the outcome.
   * apiClient never throws: a network failure also comes back as { success: false }.
   *
   * @returns {Promise<void>}
   */
  async function saveDraft() {
    isSaving = true;
    showStatus('Saving...');

    const result = await apiClient.patch('/api/reporter/articles/' + articleId + '/draft', readDraftFromForm());

    isSaving = false;

    if (result.success) {
      // The time comes from the server, so it is the moment the draft was really saved.
      showStatus('Saved at ' + formatSavedTime(result.data.savedAt));
    } else {
      // The text stays in the form, so nothing the reporter typed is lost on screen. The
      // reason is shown because there are different causes: for example 400 (the image
      // address is not valid), 401 (the session ended) or the network being down.
      // Retrying automatically is added in the next commit.
      showStatus('Not saved: ' + result.error);
    }

    // The timer fired while we were busy: save again right now, with the latest values
    // (readDraftFromForm reads the form again, so the new text is included).
    if (saveRequestedWhileSaving) {
      saveRequestedWhileSaving = false;
      requestSave();
    }
  }

  // "input" fires on every change of a field: typing, pasting, deleting, and choosing
  // another item in the category list. (The "change" event would only fire when the
  // field loses focus, which is too late for a text field.)
  fields.forEach(function (field) {
    field.addEventListener('input', scheduleSave);
  });
}

// The script is loaded at the end of the page, but waiting for DOMContentLoaded
// guarantees the form exists, the same pattern as the other page scripts.
document.addEventListener('DOMContentLoaded', setUpReporterEditor);
