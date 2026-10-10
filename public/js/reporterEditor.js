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
 * What this file does:
 *   1. Debounce: wait for a pause in typing, then save the whole draft.
 *   2. A status line: "Saving...", "Saved at 14:32", or what went wrong.
 *   3. Never two saves at once (single flight).
 *   4. Retry after a failure: if the network or the server is down, try again a few
 *      seconds later, and keep the unsaved text on screen the whole time.
 *   5. Save when the page is being closed (fetch with keepalive), so the last seconds of
 *      typing are not lost when the reporter closes the tab.
 *   6. A half-typed image address can't block the saving of the rest of the draft.
 *   7. The "Submit for approval" button: it first saves the latest text, and only if that
 *      worked asks the server to send the article to the editor (see submitForApproval).
 *   8. A login session that ends while editing (the server answers 401): a clear notice with
 *      a link to log in again in a NEW tab, the text stays on screen, and no retry loop
 *      (see handleSessionExpired). The plan's phase 2 item "a clear message if the session
 *      expired during editing, and keep the unsaved text on screen" is this one.
 *
 * Used by: views/reporter/articleEditor.ejs (loaded at the end of the page, after
 * /js/shared/apiClient.js, because this file calls apiClient).
 * Related: controllers/reporterController.js (autosaveDraft and submitArticleForApproval,
 * which validate everything again on the server), the ids "article-form", "save-status",
 * "submit-article-button", "submit-error" and "session-expired-notice" in articleEditor.ejs.
 * Owner: EZ.
 *
 * This is a plain browser script (no modules), so top-level names are shared with
 * apiClient.js. The names below are specific on purpose so they can't collide with it.
 */

// How long to wait after the LAST keystroke before saving. 2 seconds is the value in
// the plan: long enough that we don't send a request for every letter, short enough
// that very little work is at risk.
const AUTOSAVE_DELAY_MS = 2000;

// How long to wait before trying again after a failed save. Long enough not to hammer
// a server that is struggling (or to waste battery while the network is down), short
// enough that the reporter sees "Saved" again soon after the problem is gone.
const RETRY_DELAY_MS = 5000;

// The five fields of a draft. Each one is a form control whose "name" attribute is the
// same word (the names fixed in "Shared contracts", the same ones the server expects).
const DRAFT_FIELD_NAMES = ['title', 'summary', 'category', 'imageUrl', 'body'];

// What the reporter reads when the login session has ended (the server answered 401).
const SESSION_ENDED_STATUS = 'Not saved: your login session has ended.';
const SESSION_ENDED_SUBMIT_MESSAGE = 'Your login session has ended, so the article was not submitted. '
  + 'Log in again in a new tab (your text stays on this page), then click "Submit for approval" again.';

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
 * Checks that a text is empty or a web address starting with http:// or https://.
 * This is the same rule the server applies (isEmptyOrHttpUrl in reporterController.js).
 * We repeat it here ONLY as a convenience for the reporter: it lets us notice a half-typed
 * address before sending, instead of getting a 400 for the whole draft. It is not security,
 * because anyone can skip this script; the server checks again and stays strict.
 *
 * @param {string} imageUrl - The text to check.
 * @returns {boolean} true if it is empty or a valid http(s) address.
 */
function isEmptyOrHttpUrl(imageUrl) {
  if (imageUrl === '') {
    return true;
  }
  try {
    const protocol = new URL(imageUrl).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch (parseError) {
    // new URL() throws when the text is not an address at all (for example "abc"). That is
    // not a program error: it is exactly the answer we want, "this is not a valid address".
    return false;
  }
}

/**
 * Decides whether a failed save is worth repeating by itself.
 * apiClient reports status 0 when the server could not be reached at all, and the
 * server answers 5xx when something broke on its side. Both are usually temporary, so
 * trying again later can succeed. A 4xx answer (401 not logged in, 403 not your article,
 * 404, 409 the article is now read-only, 400 invalid data) means the REQUEST itself is the
 * problem: sending the same thing again every few seconds would fail the same way, forever.
 *
 * @param {{success: boolean, status: number}} result - What apiClient returned.
 * @returns {boolean} true for a network failure or a server error.
 */
function isTemporaryFailure(result) {
  return result.status === 0 || result.status >= 500;
}

/**
 * Connects the editor form to the autosave logic once the page has loaded.
 * It does nothing if the form, the status line, or any of the five fields is missing,
 * so a mistake in the HTML can't produce a JavaScript error while the reporter types.
 *
 * All the state (the timer and the flags) lives inside this function, as variables
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

  const draftUrl = '/api/reporter/articles/' + articleId + '/draft';
  const submitUrl = '/api/reporter/articles/' + articleId + '/submit';

  // The submit button and its message line. They are optional for autosave: if the page
  // has no such button, autosave still works and nothing below tries to use them.
  const submitButton = document.getElementById('submit-article-button');
  const submitError = document.getElementById('submit-error');

  // The notice shown when the login session has ended (see handleSessionExpired). Optional
  // in the same way: without it the status line still tells the reporter.
  const sessionExpiredNotice = document.getElementById('session-expired-notice');

  // The last image address the server accepted. Starts as the address the server wrote into
  // the page (defaultValue is the HTML "value" attribute, not what the reporter typed since,
  // and the server only ever stores an empty or valid address). Used while the reporter is
  // still typing a new address, see readDraftForSaving.
  let lastSavedImageUrl = articleForm.elements.imageUrl.defaultValue;

  // The timer for the next save: the 2-second debounce, or the retry delay after a failure.
  let saveTimerId = null;
  // true while that timer is waiting. Lets a retry avoid replacing a save that is already
  // scheduled because the reporter typed during the failed attempt.
  let isSaveTimerPending = false;
  // true while a request is on its way to the server (see requestSave).
  let isSaving = false;
  // true if the timer fired while a save was still running (see requestSave).
  let saveRequestedWhileSaving = false;
  // true when the form holds text the server has not confirmed yet. Used to decide whether
  // there is anything to send when the page is being closed.
  let hasUnsavedChanges = false;
  // The request that is on its way to the server right now (the promise returned by
  // apiClient), or null. Submitting waits for it, so the final save never overlaps with it.
  let inFlightRequest = null;
  // true from the click on "Submit for approval" until it has finished or failed. While it
  // is true, autosave timers, follow-up saves and retries are switched off: only the submit
  // sequence may talk to the server (see submitForApproval).
  let isSubmitting = false;
  // true after the server answered 401 (not logged in): the login session has ended. Cleared
  // by the next save that works. Used to try one save when the reporter returns to this tab.
  let isSessionExpired = false;

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
   * The server answered 401: the login session has ended (for example it expired, or the
   * reporter logged out in another tab). Tells the reporter clearly, and does nothing else.
   *
   * What this deliberately does NOT do:
   *   - It does not retry by itself. A 401 means the login is gone, so the same request would
   *     fail again every time. A retry loop would only load the server and change nothing.
   *   - It does not send the reporter to the login page. Leaving this page would destroy the
   *     text that is not saved yet. The notice has a link that opens the login page in a NEW tab.
   *   - It does not touch the form. Nothing the reporter typed is lost on screen.
   *
   * How it recovers: the login cookie is shared by all tabs of the browser, so after logging
   * in again in the other tab this page is logged in too. The next save (the reporter types, comes
   * back to this tab, or clicks "Submit for approval") works, and clearSessionExpired hides
   * the notice. The article is saved under the same reporter, so ownership is unchanged. If the
   * reporter logs in as a DIFFERENT user, the server answers 403 (not your article) and the
   * status line says so.
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
   * Reads the CURRENT value of the five fields. It is called at the moment of sending
   * (not when the timer was started), so the request always carries the latest text,
   * including anything typed during the wait.
   *
   * The image address is the one exception. The server rejects the WHOLE draft with a 400
   * if the address is not empty or a valid http(s) address, and a reporter who types an
   * address by hand passes through invalid states ("h", "https:/", ...). Without this
   * exception, every title and body character typed meanwhile would stay unsaved. So while
   * the address is invalid we send the last address the server accepted instead, and tell
   * the reporter (see saveDraft). The invalid text stays in the field on screen. The server
   * is still strict: it never stores an invalid address.
   *
   * @returns {{draft: {title: string, summary: string, category: string, imageUrl: string, body: string},
   *   imageUrlIsInvalid: boolean}} The whole draft to send (the server replaces the saved
   *   draft with it), and whether the typed image address had to be replaced.
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
   * Starts the timer for the next save and cancels any timer that was already waiting,
   * so there is never more than one timer.
   *
   * @param {number} delayMs - How long to wait, in milliseconds.
   * @returns {void}
   */
  function startSaveTimer(delayMs) {
    clearTimeout(saveTimerId);
    isSaveTimerPending = true;
    saveTimerId = setTimeout(requestSave, delayMs);
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
    hasUnsavedChanges = true;
    startSaveTimer(AUTOSAVE_DELAY_MS);
  }

  /**
   * Called when the timer fires. Enforces "never two saves at once" (single flight).
   * If a save is already running, we only remember that another one is wanted, and
   * saveDraft starts it as soon as the first one finishes.
   *
   * Why not allow two at once: two requests in flight can arrive at the server in the
   * wrong order, and the OLDER text could overwrite the newer one. Running them one after
   * the other guarantees the last request carries the latest text, so it is the one that
   * ends up saved. Retries go through this function too, so a retry can never overlap with
   * a save either.
   *
   * @returns {void}
   */
  function requestSave() {
    // The timer that called us has fired, so no timer is waiting any more.
    isSaveTimerPending = false;

    // The submit sequence is running and does its own final save. A second save from a
    // timer would overlap with it, so it is dropped.
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
   * Sends the whole draft to the server and shows the outcome.
   * apiClient never throws: a network failure also comes back as { success: false }.
   *
   * On failure the text is NOT touched: the form keeps exactly what the reporter typed,
   * so nothing is lost on screen, and hasUnsavedChanges goes back to true so the page-close
   * save still tries. A temporary failure (network down, server error) is retried by itself,
   * except while the submit sequence is running (it reports the failure to the reporter instead).
   *
   * @returns {Promise<{success: boolean, error: (string|null), status: number}>} What
   *   apiClient returned for the save, so submitForApproval knows whether it worked.
   */
  async function saveDraft() {
    isSaving = true;
    // Everything typed so far is part of the request we are about to send. If the
    // reporter types more while it runs, the input handler sets this to true again.
    hasUnsavedChanges = false;
    showStatus('Saving...');

    const { draft, imageUrlIsInvalid } = readDraftForSaving();
    // Keep the promise in a variable (not only await it), so submitForApproval can wait for
    // this very request to finish.
    inFlightRequest = apiClient.patch(draftUrl, draft);
    const result = await inFlightRequest;
    inFlightRequest = null;

    isSaving = false;

    if (result.success) {
      // Remember the address the server now holds (it is the old one if we had to replace
      // an invalid one), so the next replacement still uses an address the server accepted.
      lastSavedImageUrl = draft.imageUrl;

      // A working save also proves the login is valid again (after logging in in another tab).
      clearSessionExpired();

      // The time comes from the server, so it is the moment the draft was really saved.
      let message = 'Saved at ' + formatSavedTime(result.data.savedAt);
      if (imageUrlIsInvalid) {
        message += '. The image address is not saved yet: it must be empty or start with http:// or https://';
      }
      showStatus(message);
    } else {
      hasUnsavedChanges = true;

      if (result.status === 401) {
        // The login session has ended. Not a temporary failure, so no automatic retry.
        handleSessionExpired();
      } else if (isTemporaryFailure(result)) {
        showStatus('Not saved, retrying');
      } else {
        // The reason is shown because there are different causes: for example 403 (the
        // article belongs to someone else) or 409 (the article is not editable any more).
        // Repeating the same request would fail the same way, so we don't retry; the next
        // change the reporter makes starts a new attempt.
        showStatus('Not saved: ' + result.error);
      }
    }

    // The timer fired while we were busy: save again right now, with the latest values
    // (readDraftForSaving reads the form again, so the new text is included). This also
    // covers a failure: the new attempt is the retry.
    if (saveRequestedWhileSaving) {
      saveRequestedWhileSaving = false;
      requestSave();
      return result;
    }

    // Retry later after a temporary failure, unless a save is already scheduled (the
    // reporter typed during the failed attempt): that earlier timer will send the latest text.
    // Not while submitting: then the reporter is told about the failure and clicks again.
    if (!result.success && isTemporaryFailure(result) && !isSaveTimerPending && !isSubmitting) {
      startSaveTimer(RETRY_DELAY_MS);
    }

    return result;
  }

  /**
   * Switches the five fields and the submit button on or off together. While the submit
   * sequence runs they are off, so nothing can be typed between the final save and the
   * submit (the text that gets submitted is exactly the text that was saved). A disabled
   * field still keeps its value, so readDraftForSaving can read it as usual.
   *
   * @param {boolean} enabled - true to allow editing and clicking, false to block them.
   * @returns {void}
   */
  function setFormEnabled(enabled) {
    fields.forEach(function (field) {
      field.disabled = !enabled;
    });
    submitButton.disabled = !enabled;
  }

  /**
   * Shows why the article was not submitted and gives control back to the reporter.
   * The text is untouched: nothing the reporter typed is lost.
   *
   * @param {string} message - The reason, for the reporter. Shown with textContent.
   * @returns {void}
   */
  function stopSubmitting(message) {
    submitError.textContent = message;
    isSubmitting = false;
    setFormEnabled(true);
  }

  /**
   * The "Submit for approval" button: the reporter says "I am finished, send it to the editor".
   * Steps, in this order:
   *   1. Disable the button and the fields. A double click can't send two requests, and
   *      nothing can change from now on.
   *   2. Cancel the waiting autosave timer (or retry timer): this function does the final
   *      save itself, a second one would be a duplicate.
   *   3. Wait for a save that is already on its way. Saves never overlap (single flight).
   *   4. Save the latest draft once. If that save FAILS we stop and tell the reporter: the
   *      server checks the draft that is stored in the database, so submitting after a
   *      failed save would send an OLDER version to the editor than the one on the screen.
   *   5. Only then ask the server to submit. The server checks the owner, that the required
   *      fields are filled in, and that the status allows it, and answers with the reason
   *      if not. On success we go to the dashboard, where the article is now
   *      "Awaiting editor approval".
   *
   * Why this works with an autosave that has no Save button: the final save in step 4 is what
   * makes "submit" safe, because the page can't know whether the last few seconds of typing
   * have reached the server yet.
   *
   * @returns {Promise<void>}
   */
  async function submitForApproval() {
    isSubmitting = true;
    setFormEnabled(false);
    submitError.textContent = '';

    // The image address is the one field the server would refuse. Autosave quietly keeps the
    // last good address while the reporter is still typing, but submitting is the moment of
    // decision: sending the OLD address without saying so would be a surprise. So stop here.
    if (!isEmptyOrHttpUrl(articleForm.elements.imageUrl.value)) {
      stopSubmitting('The image address must be empty or start with http:// or https:// before you can submit.');
      return;
    }

    // Step 2: the waiting timer (debounce or retry) and any follow-up save are cancelled.
    clearTimeout(saveTimerId);
    isSaveTimerPending = false;
    saveRequestedWhileSaving = false;

    // Step 3: wait for the save that is already running, if there is one.
    if (inFlightRequest) {
      await inFlightRequest;
    }

    // Step 4: save the latest text once, and stop if it did not work.
    const saveResult = await saveDraft();
    if (!saveResult.success) {
      // For a 401, saveDraft has already shown the session notice (handleSessionExpired).
      stopSubmitting(saveResult.status === 401
        ? SESSION_ENDED_SUBMIT_MESSAGE
        : 'The article was not submitted because the latest text could not be saved: ' + saveResult.error);
      return;
    }

    // Step 5: the body is empty on purpose. The article id is in the URL, the reporter comes
    // from the session, and the new status is decided by the server, never by the browser.
    showStatus('Submitting...');
    const submitResult = await apiClient.post(submitUrl, {});
    if (!submitResult.success) {
      // The session can also end between the final save and this request (rare, but possible).
      if (submitResult.status === 401) {
        handleSessionExpired();
        stopSubmitting(SESSION_ENDED_SUBMIT_MESSAGE);
        return;
      }
      // For example 400 "Please fill in these fields before submitting: summary." The text
      // stays in the form so the reporter can fix it and click again.
      stopSubmitting(submitResult.error);
      return;
    }

    // Done. The fields and the button stay disabled while the browser leaves this page,
    // because the article is now read-only for the reporter.
    window.location.href = '/reporter';
  }

  /**
   * Last chance to save: called when the page is being hidden or closed (see the two
   * listeners below). If something is not saved yet, it sends the draft with
   * fetch(..., { keepalive: true }) and does not wait for the answer.
   *
   * Why apiClient is not used here: when a page is closing the browser stops its
   * JavaScript and cancels ordinary requests. apiClient's fetch has no keepalive option,
   * and it also waits for the answer to read it, which can't happen on a closing page.
   * keepalive: true asks the browser to finish sending the request even after the page is
   * gone. (We don't edit apiClient.js: it is a shared file owned by SM.)
   *
   * Limits of keepalive, so we don't over-trust it:
   *   - We can't read the answer or show an error: the page may already be gone.
   *   - The browser allows only about 64 KiB of keepalive request bodies at a time. A very
   *     long article (text in other alphabets takes 2 bytes per letter) can be over that, and
   *     the request is then refused. That is why this is only a safety net: the normal
   *     autosave has already saved everything up to the last 2 seconds before closing.
   *   - Delivery is not guaranteed if the browser or the computer crashes.
   * The server validates this request exactly like any other autosave.
   *
   * @returns {void}
   */
  function saveWhenPageCloses() {
    // Nothing typed since the last confirmed save, and no request on its way: nothing to do.
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
        // Nobody is left to tell. A refused or failed request is only a missed safety net.
      });
    } catch (sendError) {
      // fetch can also fail immediately, for example when the body is too large for keepalive.
    }
  }

  // "input" fires on every change of a field: typing, pasting, deleting, and choosing
  // another item in the category list. (The "change" event would only fire when the
  // field loses focus, which is too late for a text field.)
  fields.forEach(function (field) {
    field.addEventListener('input', scheduleSave);
  });

  if (submitButton && submitError) {
    submitButton.addEventListener('click', submitForApproval);
  }

  // Two events, because no single one is reliable everywhere. "visibilitychange" to hidden
  // is the most dependable on phones (switching apps, closing a tab), and "pagehide" covers
  // closing and leaving the page on desktop browsers. If both fire, the second finds nothing
  // left to send (hasUnsavedChanges is false) and does nothing.
  // When the tab is shown again after the login session ended, the reporter has probably just
  // logged in again in another tab, so we try ONE save right away instead of waiting for the next
  // keystroke. It is one attempt per return to the tab (a deliberate action by the reporter), not
  // a timer, so it can't turn into a retry loop; if it still fails, the notice simply stays.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      saveWhenPageCloses();
    } else if (isSessionExpired && !isSubmitting) {
      requestSave();
    }
  });
  window.addEventListener('pagehide', saveWhenPageCloses);
}

// The script is loaded at the end of the page, but waiting for DOMContentLoaded
// guarantees the form exists, the same pattern as the other page scripts.
document.addEventListener('DOMContentLoaded', setUpReporterEditor);
