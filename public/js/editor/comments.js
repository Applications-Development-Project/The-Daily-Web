/**
 * public/js/editor/comments.js
 *
 * Runs the editor's comment moderation page (views/editor/comments.ejs). Everything
 * happens with Ajax through apiClient, so the page never reloads:
 * - the table shows 20 comments at a time from GET /api/comments, newest first, each
 *   with a link to the article it was posted on, and Previous/Next buttons,
 * - typing in the search box filters the table (300 ms after the last key),
 * - Edit turns a row's text into a text box that sends PATCH /api/comments/:id,
 * - Delete asks for confirmation, then sends DELETE /api/comments/:id.
 * The server checks everything again (editor only, search and page rules, the text
 * rules); this script only shows its answers.
 *
 * Every value from the server is put on the page with textContent, never innerHTML.
 * That matters most on this page: it shows comments typed by any guest on the site,
 * so a comment like <img src=x onerror="..."> must appear as text and never run in
 * the editor's browser.
 *
 * Load after apiClient.js. Owner: OS.
 */

// How long to wait after the last key in the search box before searching, so typing
// "noa" sends one request instead of three.
const SEARCH_DELAY_MS = 300;

// The same limit the server checks (controllers/commentController.js). Checking here
// too gives an instant message; the server still checks, because a browser can be bypassed.
const MAX_COMMENT_TEXT_LENGTH = 1000;

/**
 * Creates an element with optional text, as plain text.
 *
 * @param {string} tagName - For example 'td'.
 * @param {string} [text] - Text content.
 * @returns {HTMLElement}
 */
function createElementWithText(tagName, text) {
  const element = document.createElement(tagName);
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

/**
 * Creates a button. type="button" so it never submits a form by accident.
 *
 * @param {string} label - The button text.
 * @param {string} className - CSS classes, for example 'btn btn-danger'.
 * @returns {HTMLButtonElement}
 */
function createButton(label, className) {
  const button = createElementWithText('button', label);
  button.type = 'button';
  button.className = className;
  return button;
}

/**
 * Checks edited text before sending, with the same rules and messages as the server.
 *
 * @param {string} text - The new text, already trimmed.
 * @returns {string|null} A message to show, or null if the text is fine.
 */
function findCommentTextError(text) {
  if (text === '') {
    return 'Please write a comment.';
  }
  if (text.length > MAX_COMMENT_TEXT_LENGTH) {
    return 'A comment can be at most 1,000 characters.';
  }
  return null;
}

/**
 * Formats a comment's date like "10 Oct 2026, 13:51", the same format as the
 * comments on the article page (public/js/public/articleComments.js).
 *
 * @param {string} isoDate - A date from the API.
 * @returns {string} The date in the editor's own time zone.
 */
function formatCommentDate(isoDate) {
  return new Date(isoDate).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Builds the table cell with the comment's date. <time datetime="..."> gives the exact
 * date to the browser, while people read the formatted one.
 *
 * @param {string} isoDate - comment.createdAt from the API.
 * @returns {HTMLTableCellElement}
 */
function createDateCell(isoDate) {
  const cell = document.createElement('td');
  const date = createElementWithText('time', formatCommentDate(isoDate));
  date.dateTime = isoDate;
  cell.append(date);
  return cell;
}

/**
 * Builds the table cell that names the comment's article, as a link to it, so the
 * editor can read the comment in its context.
 *
 * Comments can only be posted on live articles, and a live article stays live until
 * it is deleted (which also deletes its comments), so the link always works.
 * article is null only if the article is gone; then there is nothing to link to.
 *
 * @param {({id: string, title: string}|null)} article - From the API.
 * @returns {HTMLTableCellElement}
 */
function createArticleCell(article) {
  const cell = document.createElement('td');
  if (!article) {
    cell.textContent = '(deleted article)';
    return cell;
  }

  const link = createElementWithText('a', article.title);
  // encodeURIComponent keeps the id from changing the URL, whatever it contains.
  link.href = `/articles/${encodeURIComponent(article.id)}`;
  cell.append(link);
  return cell;
}

/**
 * Connects the whole page. The functions inside share the page's state (current page,
 * search timer) and elements without making them global (a closure).
 *
 * @returns {void}
 */
function setUpCommentModeration() {
  const pageRoot = document.getElementById('comment-moderation');
  if (!pageRoot) {
    return;
  }

  const tableBody = document.getElementById('comment-rows');
  const listStatus = document.getElementById('comment-list-status');
  const listError = document.getElementById('comment-list-error');
  const searchInput = document.getElementById('comment-search');
  const searchForm = document.getElementById('comment-search-form');
  const previousButton = document.getElementById('previous-page');
  const nextButton = document.getElementById('next-page');
  const pageInfo = document.getElementById('page-info');

  let currentPage = 1;
  let totalPages = 1;
  let searchTimer = null;
  // Counts the list requests, so only the answer to the newest one is shown.
  let latestRequestNumber = 0;

  /**
   * Shows an error above the table, or hides it when message is empty.
   *
   * @param {string} message - The text to show, or '' to hide.
   * @returns {void}
   */
  function showListError(message) {
    listError.textContent = message;
    listError.hidden = message === '';
  }

  /**
   * Builds the normal (not editing) table row for one comment, with Edit and Delete.
   *
   * @param {{id: string, authorName: string, text: string, createdAt: string,
   *   article: ({id: string, title: string}|null)}} comment - From the API.
   * @returns {HTMLTableRowElement}
   */
  function createCommentRow(comment) {
    const row = document.createElement('tr');

    const actions = document.createElement('td');
    const editButton = createButton('Edit', 'btn');
    const deleteButton = createButton('Delete', 'btn btn-danger');
    // replaceWith swaps only this row, so the rest of the table stays as it is.
    editButton.addEventListener('click', () => {
      const editRow = createEditRow(comment);
      row.replaceWith(editRow);
      // Put the cursor in the text box, so the editor can start typing at once.
      // (This must come after replaceWith: an element not on the page can't take focus.)
      editRow.querySelector('textarea').focus();
    });
    deleteButton.addEventListener('click', () => deleteComment(comment, deleteButton));
    actions.append(editButton, ' ', deleteButton);

    row.append(
      createElementWithText('td', comment.text),
      createElementWithText('td', comment.authorName),
      createArticleCell(comment.article),
      createDateCell(comment.createdAt),
      actions
    );
    return row;
  }

  /**
   * Builds the editing version of a row: the text in a text box, with Save and Cancel.
   * Only the text can be edited, the same rule as on the server: the author's name,
   * article and date stay as they were, so the comment still shows who wrote it.
   *
   * @param {Object} comment - The comment before editing (same shape as above).
   * @returns {HTMLTableRowElement}
   */
  function createEditRow(comment) {
    const row = document.createElement('tr');

    // .value (like textContent) puts the text in as text, never as HTML.
    const textBox = document.createElement('textarea');
    textBox.className = 'form-field';
    textBox.rows = 3;
    textBox.maxLength = MAX_COMMENT_TEXT_LENGTH;
    textBox.value = comment.text;
    textBox.setAttribute('aria-label', `Text of the comment by ${comment.authorName}`);
    const textCell = document.createElement('td');
    textCell.append(textBox);

    const actions = document.createElement('td');
    const saveButton = createButton('Save', 'btn btn-primary');
    const cancelButton = createButton('Cancel', 'btn');
    cancelButton.addEventListener('click', () => {
      showListError('');
      row.replaceWith(createCommentRow(comment));
    });
    saveButton.addEventListener('click', () => saveComment(comment, row, saveButton, textBox.value.trim()));
    actions.append(saveButton, ' ', cancelButton);

    row.append(
      textCell,
      createElementWithText('td', comment.authorName),
      createArticleCell(comment.article),
      createDateCell(comment.createdAt),
      actions
    );
    return row;
  }

  /**
   * Sends the edited text. On success the row goes back to normal with the server's
   * version of the text (trimmed, exactly as saved); on failure the row stays in edit
   * mode, so nothing the editor typed is lost, and the message is shown above the table.
   *
   * @param {Object} comment - The comment before editing.
   * @param {HTMLTableRowElement} row - The editing row.
   * @param {HTMLButtonElement} saveButton - Disabled while saving.
   * @param {string} newText - The text box's value, trimmed.
   * @returns {Promise<void>}
   */
  async function saveComment(comment, row, saveButton, newText) {
    // Nothing changed: no request is needed.
    if (newText === comment.text) {
      showListError('');
      row.replaceWith(createCommentRow(comment));
      return;
    }

    const textError = findCommentTextError(newText);
    if (textError) {
      showListError(textError);
      return;
    }

    // Disabled while waiting, so a double click doesn't send the change twice.
    saveButton.disabled = true;
    const result = await apiClient.patch(`/api/comments/${encodeURIComponent(comment.id)}`, { text: newText });
    saveButton.disabled = false;

    if (!result.success) {
      showListError(result.error);
      return;
    }

    showListError('');
    // The PATCH answer is the public comment shape, without the article, so we keep
    // the article we already have and take everything else from the server.
    const updatedComment = Object.assign({}, result.data, { article: comment.article });
    row.replaceWith(createCommentRow(updatedComment));
  }

  /**
   * Asks for confirmation, deletes the comment, then reloads the current page of the
   * list, so the page stays full (the next comment moves up) and the count stays right.
   *
   * @param {Object} comment - The comment to delete.
   * @param {HTMLButtonElement} deleteButton - Disabled while deleting.
   * @returns {Promise<void>}
   */
  async function deleteComment(comment, deleteButton) {
    // confirm() is the browser's own yes/no box; deleting can't be undone. The start
    // of the text is shown so the editor can see which comment they clicked.
    const preview = comment.text.length > 60 ? `${comment.text.slice(0, 60)}...` : comment.text;
    if (!window.confirm(`Delete this comment by ${comment.authorName}?\n\n"${preview}"\n\nThis can't be undone.`)) {
      return;
    }

    deleteButton.disabled = true;
    const result = await apiClient.delete(`/api/comments/${encodeURIComponent(comment.id)}`);
    if (!result.success) {
      deleteButton.disabled = false;
      showListError(result.error);
      return;
    }

    showListError('');
    await loadComments();
    // If that was the last comment on the last page, step back one page.
    if (tableBody.children.length === 0 && currentPage > 1) {
      currentPage -= 1;
      await loadComments();
    }
  }

  /**
   * Loads one page of comments from the API and shows it.
   *
   * Why the request number: searches are sent while the editor types, and the answers
   * don't always come back in the order the requests were sent. Without this check, a
   * slow answer for "no" could arrive after the answer for "noa" and replace it, so
   * the table would show results for text that is no longer in the box. Each call
   * takes a new number, and an answer is shown only if no newer request started since.
   *
   * @returns {Promise<void>}
   */
  async function loadComments() {
    latestRequestNumber += 1;
    const requestNumber = latestRequestNumber;

    listStatus.textContent = 'Loading comments...';
    listStatus.hidden = false;

    // URLSearchParams encodes the search text, so characters like & or # are safe.
    const query = new URLSearchParams({ page: String(currentPage) });
    const searchText = searchInput.value.trim();
    if (searchText !== '') {
      query.set('search', searchText);
    }
    const result = await apiClient.get(`/api/comments?${query.toString()}`);

    if (requestNumber !== latestRequestNumber) {
      return;
    }

    if (!result.success) {
      listStatus.hidden = true;
      showListError(result.error);
      return;
    }

    showListError('');
    totalPages = result.data.totalPages;
    // replaceChildren swaps the whole table body at once, so the old page's rows
    // never stay mixed in with the new ones.
    tableBody.replaceChildren(...result.data.comments.map(createCommentRow));

    if (result.data.comments.length === 0) {
      listStatus.textContent = searchText === '' ? 'There are no comments yet.' : 'No comments match your search.';
    } else {
      listStatus.hidden = true;
    }
    const totalComments = result.data.totalComments;
    const commentWord = totalComments === 1 ? 'comment' : 'comments';
    pageInfo.textContent = `Page ${currentPage} of ${totalPages} (${totalComments} ${commentWord})`;
    previousButton.disabled = currentPage <= 1;
    nextButton.disabled = currentPage >= totalPages;
  }

  // Search: wait until the editor stops typing, then start again from page 1.
  // Every key press cancels the timer of the previous key (clearTimeout) and starts a
  // new one, so the search runs only once no key has been pressed for SEARCH_DELAY_MS
  // ("debouncing").
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      currentPage = 1;
      loadComments();
    }, SEARCH_DELAY_MS);
  });
  // Pressing Enter in the search box must not reload the page.
  searchForm.addEventListener('submit', (event) => event.preventDefault());

  previousButton.addEventListener('click', () => {
    currentPage -= 1;
    loadComments();
  });
  nextButton.addEventListener('click', () => {
    currentPage += 1;
    loadComments();
  });

  loadComments();
}

// The page may load this script in <head> or at the end of <body>. If the page is
// still loading, wait until all elements exist; otherwise start right away.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setUpCommentModeration);
} else {
  setUpCommentModeration();
}
