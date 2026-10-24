/**
 * public/js/reporter/articleEditor.js
 *
 * Autosave for the reporter's article editor (there is no Save button): a moment after
 * typing stops, the whole draft is sent to PATCH /api/reporter/articles/:id/draft.
 * The draft lives on the server, never in browser storage, so a refresh or another
 * computer always shows the last saved version.
 *
 * It also: never sends two saves at once, retries after a temporary failure, saves when
 * the page closes (fetch with keepalive), handles a login session that ends while editing
 * (401), and runs "Submit for approval" (save first, then submit).
 *
 * Loaded by: views/reporter/articleEditor.ejs, after public/js/shared/apiClient.js.
 * Owner: EZ.
 */

// Wait this long after the last keystroke: one request per pause, not per letter.
const AUTOSAVE_DELAY_MS = 2000;

// Wait this long before retrying a failed save.
const RETRY_DELAY_MS = 5000;

// The form controls' "name" attributes, the same field names the server expects.
const DRAFT_FIELD_NAMES = ['title', 'summary', 'category', 'imageUrl', 'body'];

const SESSION_ENDED_STATUS = 'Not saved: your login session has ended.';
const SESSION_ENDED_SUBMIT_MESSAGE = 'Your login session has ended, so the article was not submitted. '
  + 'Log in again in a new tab (your text stays on this page), then click "Submit for approval" again.';

/**
 * Turns the server's save time into "14:32" (the browser's time if it can't be read).
 *
 * @param {string} savedAt - An ISO date text.
 * @returns {string} Hours and minutes.
 */
function formatSavedTime(savedAt) {
  let savedDate = new Date(savedAt);
  if (Number.isNaN(savedDate.getTime())) {
    savedDate = new Date();
  }
  return savedDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Checks that a text is empty, a path on our own site (like the seed's
 * "/images/categories/politics-1.svg") or an http(s) address, the same rule as the
 * server. Only a convenience here (a half-typed address shouldn't block saving the
 * rest); the server checks again.
 *
 * @param {string} imageUrl - The text to check.
 * @returns {boolean} true if it is empty, a site path or a valid http(s) address.
 */
function isEmptyOrHttpUrl(imageUrl) {
  if (imageUrl === '') {
    return true;
  }
  // "//" and "/\" are not site paths: a browser reads them as another website.
  if (imageUrl.startsWith('/') && !imageUrl.startsWith('//') && !imageUrl.startsWith('/\\')) {
    return true;
  }
  try {
    const protocol = new URL(imageUrl).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch (parseError) {
    // new URL() throws for text that isn't an address: that just means "not valid".
    return false;
  }
}

/**
 * Says whether a failed save is worth retrying: a network failure (status 0) or a server
 * error (5xx) is usually temporary. A 4xx means the request itself is wrong, so sending it
 * again would fail forever.
 *
 * @param {{success: boolean, status: number}} result - What apiClient returned.
 * @returns {boolean}
 */
function isTemporaryFailure(result) {
  return result.status === 0 || result.status >= 500;
}

/**
 * Connects the editor form to the autosave. Does nothing if a piece of the form is
 * missing. All the state lives inside this function, so no other script can change it.
 *
 * @returns {void}
 */
function setUpReporterEditor() {
  const articleForm = document.getElementById('article-form');
  const saveStatus = document.getElementById('save-status');

  if (!articleForm || !saveStatus) {
    return;
  }

  // The reporter isn't sent: the server knows them from the session cookie.
  const articleId = articleForm.dataset.articleId;
  const fields = DRAFT_FIELD_NAMES.map(function (fieldName) {
    return articleForm.elements[fieldName];
  });

  if (!articleId || fields.some(function (field) { return !field; })) {
    return;
  }

  const draftUrl = '/api/reporter/articles/' + articleId + '/draft';
  const submitUrl = '/api/reporter/articles/' + articleId + '/submit';

  // Optional: autosave works without them.
  const submitButton = document.getElementById('submit-article-button');
  const submitError = document.getElementById('submit-error');
  const sessionExpiredNotice = document.getElementById('session-expired-notice');

  // The last image address the server accepted (defaultValue = what the server put in
  // the page), sent instead of a half-typed address (see readDraftForSaving).
  let lastSavedImageUrl = articleForm.elements.imageUrl.defaultValue;

  // The timer of the next save (debounce or retry), and whether it is waiting.
  let saveTimerId = null;
  let isSaveTimerPending = false;
  // A request is on its way, and the timer fired meanwhile (see requestSave).
  let isSaving = false;
  let saveRequestedWhileSaving = false;
  // The form holds text the server hasn't confirmed yet.
  let hasUnsavedChanges = false;
  // The request on its way (a promise), so submitting can wait for it.
  let inFlightRequest = null;
  // While submitting, only the submit sequence may talk to the server.
  let isSubmitting = false;
  // The server answered 401; cleared by the next save that works.
  let isSessionExpired = false;

  /**
   * Shows a message in the status line (textContent: server text stays text).
   *
   * @param {string} message
   * @returns {void}
   */
  function showStatus(message) {
    saveStatus.textContent = message;
  }

  /**
   * The login session ended (401). Shows the notice and nothing else: no retry loop (it
   * would fail every time), no redirect (leaving would lose the unsaved text), and the form
   * is untouched. The notice links to the login page in a NEW tab; the login cookie is
   * shared by all tabs, so the next save here works again.
   *
   * @returns {void}
   */
  function handleSessionExpired() {
    isSessionExpired = true;
    showStatus(SESSION_ENDED_STATUS);
    if (sessionExpiredNotice) {
      sessionExpiredNotice.hidden = false;
    }
  }

  /**
   * A save worked, so the login is valid again: hide the notice.
   *
   * @returns {void}
   */
  function clearSessionExpired() {
    isSessionExpired = false;
    if (sessionExpiredNotice) {
      sessionExpiredNotice.hidden = true;
    }
  }

  /**
   * Reads the five fields at the moment of sending, so the request has the latest text.
   * The server rejects the WHOLE draft if the image address is invalid, and an address
   * typed by hand is invalid while it is being typed ("https:/"). So meanwhile the last
   * accepted address is sent instead; the typed text stays on screen.
   *
   * @returns {{draft: {title: string, summary: string, category: string, imageUrl: string, body: string},
   *   imageUrlIsInvalid: boolean}}
   */
  function readDraftForSaving() {
    const draft = {};
    DRAFT_FIELD_NAMES.forEach(function (fieldName) {
      draft[fieldName] = articleForm.elements[fieldName].value;
    });

    const imageUrlIsInvalid = !isEmptyOrHttpUrl(draft.imageUrl);
    if (imageUrlIsInvalid) {
      draft.imageUrl = lastSavedImageUrl;
    }

    return { draft: draft, imageUrlIsInvalid: imageUrlIsInvalid };
  }

  /**
   * Starts the timer of the next save, replacing any waiting one.
   *
   * @param {number} delayMs
   * @returns {void}
   */
  function startSaveTimer(delayMs) {
    clearTimeout(saveTimerId);
    isSaveTimerPending = true;
    saveTimerId = setTimeout(requestSave, delayMs);
  }

  /**
   * Debounce: every change restarts the timer, so one save happens 2 seconds after the
   * last change instead of one request per letter.
   *
   * @returns {void}
   */
  function scheduleSave() {
    hasUnsavedChanges = true;
    startSaveTimer(AUTOSAVE_DELAY_MS);
  }

  /**
   * When the timer fires: never two saves at once. Two requests in flight could arrive in
   * the wrong order and the older text would overwrite the newer, so a save requested
   * during another one runs right after it.
   *
   * @returns {void}
   */
  function requestSave() {
    isSaveTimerPending = false;

    // The submit sequence does its own final save.
    if (isSubmitting) {
      return;
    }

    if (isSaving) {
      saveRequestedWhileSaving = true;
      return;
    }
    saveDraft();
  }

  /**
   * Sends the whole draft and shows the outcome. On failure the form keeps what was typed;
   * a temporary failure is retried (except while submitting).
   *
   * @returns {Promise<{success: boolean, error: (string|null), status: number}>} apiClient's
   *   answer, so submitForApproval knows whether it worked.
   */
  async function saveDraft() {
    isSaving = true;
    // Typing during the request sets this back to true.
    hasUnsavedChanges = false;
    showStatus('Saving...');

    const { draft, imageUrlIsInvalid } = readDraftForSaving();
    inFlightRequest = apiClient.patch(draftUrl, draft);
    const result = await inFlightRequest;
    inFlightRequest = null;

    isSaving = false;

    if (result.success) {
      lastSavedImageUrl = draft.imageUrl;
      clearSessionExpired();

      // The server's time: the moment the draft was really saved.
      let message = 'Saved at ' + formatSavedTime(result.data.savedAt);
      if (imageUrlIsInvalid) {
        message += '. The image address is not saved yet: it must be empty or start with http:// or https://';
      }
      showStatus(message);
    } else {
      hasUnsavedChanges = true;

      if (result.status === 401) {
        handleSessionExpired();
      } else if (isTemporaryFailure(result)) {
        showStatus('Not saved, retrying');
      } else {
        // For example 403 or 409: retrying would fail the same way.
        showStatus('Not saved: ' + result.error);
      }
    }

    // The timer fired while we were busy: save again now with the latest text.
    if (saveRequestedWhileSaving) {
      saveRequestedWhileSaving = false;
      requestSave();
      return result;
    }

    // Retry later, unless a save is already scheduled or we are submitting.
    if (!result.success && isTemporaryFailure(result) && !isSaveTimerPending && !isSubmitting) {
      startSaveTimer(RETRY_DELAY_MS);
    }

    return result;
  }

  /**
   * Switches the fields and the submit button on or off together, so nothing can be typed
   * between the final save and the submit.
   *
   * @param {boolean} enabled
   * @returns {void}
   */
  function setFormEnabled(enabled) {
    fields.forEach(function (field) {
      field.disabled = !enabled;
    });
    submitButton.disabled = !enabled;
  }

  /**
   * Shows why the article was not submitted and gives control back (the text is untouched).
   *
   * @param {string} message - The reason.
   * @returns {void}
   */
  function stopSubmitting(message) {
    submitError.textContent = message;
    isSubmitting = false;
    setFormEnabled(true);
  }

  /**
   * "Submit for approval": lock the form, cancel the autosave timer, wait for a save on its
   * way, save the latest text once, and only if that worked ask the server to submit. The
   * server checks the draft stored in the database, so submitting after a failed save
   * would send the editor an older version than the one on screen.
   *
   * @returns {Promise<void>}
   */
  async function submitForApproval() {
    isSubmitting = true;
    setFormEnabled(false);
    submitError.textContent = '';

    // Autosave quietly keeps the old address; submitting must not, so stop and say why.
    if (!isEmptyOrHttpUrl(articleForm.elements.imageUrl.value)) {
      stopSubmitting('The image address must be empty or start with http:// or https:// before you can submit.');
      return;
    }

    clearTimeout(saveTimerId);
    isSaveTimerPending = false;
    saveRequestedWhileSaving = false;

    if (inFlightRequest) {
      await inFlightRequest;
    }

    const saveResult = await saveDraft();
    if (!saveResult.success) {
      stopSubmitting(saveResult.status === 401
        ? SESSION_ENDED_SUBMIT_MESSAGE
        : 'The article was not submitted because the latest text could not be saved: ' + saveResult.error);
      return;
    }

    // Empty body: the id is in the URL, the reporter in the session, the status decided by the server.
    showStatus('Submitting...');
    const submitResult = await apiClient.post(submitUrl, {});
    if (!submitResult.success) {
      if (submitResult.status === 401) {
        handleSessionExpired();
        stopSubmitting(SESSION_ENDED_SUBMIT_MESSAGE);
        return;
      }
      // For example 400 "Please fill in these fields...": the text stays to be fixed.
      stopSubmitting(submitResult.error);
      return;
    }

    // The form stays locked: the article is now read-only for the reporter.
    window.location.href = '/reporter';
  }

  /**
   * Last chance to save when the page is hidden or closed: fetch with keepalive, which the
   * browser finishes sending even after the page is gone (apiClient has no keepalive).
   * Only a safety net: the answer can't be read, and the browser limits keepalive bodies
   * to about 64 KiB; the normal autosave already saved up to the last 2 seconds.
   *
   * @returns {void}
   */
  function saveWhenPageCloses() {
    if (!hasUnsavedChanges && !isSaving) {
      return;
    }

    const { draft } = readDraftForSaving();
    hasUnsavedChanges = false;

    try {
      fetch(draftUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(draft),
        keepalive: true,
      }).catch(function () {
        // Nobody is left to tell: only a missed safety net.
      });
    } catch (sendError) {
      // For example a body too large for keepalive.
    }
  }

  // "input" fires on every change (typing, pasting, choosing a category); "change" would
  // fire only when the field loses focus.
  fields.forEach(function (field) {
    field.addEventListener('input', scheduleSave);
  });

  if (submitButton && submitError) {
    submitButton.addEventListener('click', submitForApproval);
  }

  // Two events, because none is reliable everywhere: "visibilitychange" on phones,
  // "pagehide" on desktop. Coming back to the tab after a 401 tries ONE save (the reporter
  // has probably logged in again in another tab), never a loop.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      saveWhenPageCloses();
    } else if (isSessionExpired && !isSubmitting) {
      requestSave();
    }
  });
  window.addEventListener('pagehide', saveWhenPageCloses);
}

document.addEventListener('DOMContentLoaded', setUpReporterEditor);
