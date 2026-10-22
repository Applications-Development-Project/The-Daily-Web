/**
 * public/js/editor/comments.js
 *
 * The comment moderation page, all through the API without reloading: the table (20 per
 * page, each comment linked to its article), the search, editing a comment's text and
 * deleting with confirmation. The server checks everything again.
 *
 * Text from the server goes in with textContent, never innerHTML: this page shows text
 * typed by any guest, so a comment like <img src=x onerror="..."> must never run here.
 *
 * Loaded by: views/editor/comments.ejs, after public/js/shared/apiClient.js.
 * Owner: OS.
 */

// Wait this long after the last key before searching.
const SEARCH_DELAY_MS = 300;

// The same limit as the server, for an instant message (the server checks again).
const MAX_COMMENT_TEXT_LENGTH = 1000;

/**
 * Creates an element with optional text (as text).
 *
 * @param {string} tagName - For example 'td'.
 * @param {string} [text]
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
 * Creates a button (type="button", so it never submits a form by accident).
 *
 * @param {string} label - The button text.
 * @param {string} className - For example 'btn btn-danger'.
 * @returns {HTMLButtonElement}
 */
function createButton(label, className) {
  const button = createElementWithText('button', label);
  button.type = 'button';
  button.className = className;
  return button;
}

/**
 * Checks edited text with the server's rules and messages.
 *
 * @param {string} text - Trimmed.
 * @returns {string|null} A message, or null if fine.
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
 * Formats a date like the article page's comments, in the editor's time zone.
 *
 * @param {string} isoDate - A date from the API.
 * @returns {string} For example "10 Oct 2026, 13:51".
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
 * Builds the date cell (<time datetime> keeps the exact date for the browser).
 *
 * @param {string} isoDate - comment.createdAt.
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
 * Builds the cell linking to the comment's article, so the editor can read it in context
 * ("(deleted article)" if it is gone).
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
  link.href = `/articles/${encodeURIComponent(article.id)}`;
  cell.append(link);
  return cell;
}

/**
 * Connects the page. The inner functions share its state without making it global.
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
  // Only the answer to the newest list request is shown.
  let latestRequestNumber = 0;

  /**
   * Shows an error above the table, or hides it for ''.
   *
   * @param {string} message
   * @returns {void}
   */
  function showListError(message) {
    listError.textContent = message;
    listError.hidden = message === '';
  }

  /**
   * Builds the normal table row for one comment, with Edit and Delete.
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
    editButton.addEventListener('click', () => {
      const editRow = createEditRow(comment);
      row.replaceWith(editRow);
      // After replaceWith: an element not on the page can't take focus.
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
   * Builds the editing row: only the text can change, as on the server.
   *
   * @param {Object} comment - The comment before editing.
   * @returns {HTMLTableRowElement}
   */
  function createEditRow(comment) {
    const row = document.createElement('tr');

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
   * Sends the edited text. On failure the row stays in edit mode, so nothing typed is lost.
   *
   * @param {Object} comment - The comment before editing.
   * @param {HTMLTableRowElement} row - The editing row.
   * @param {HTMLButtonElement} saveButton - Disabled while saving.
   * @param {string} newText - Trimmed.
   * @returns {Promise<void>}
   */
  async function saveComment(comment, row, saveButton, newText) {
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

    saveButton.disabled = true;
    const result = await apiClient.patch(`/api/comments/${encodeURIComponent(comment.id)}`, { text: newText });
    saveButton.disabled = false;

    if (!result.success) {
      showListError(result.error);
      return;
    }

    showListError('');
    // The answer has no article, so we keep the one we have.
    const updatedComment = Object.assign({}, result.data, { article: comment.article });
    row.replaceWith(createCommentRow(updatedComment));
  }

  /**
   * Asks for confirmation (showing the start of the text), deletes the comment and reloads
   * the page of the list.
   *
   * @param {Object} comment - The comment to delete.
   * @param {HTMLButtonElement} deleteButton - Disabled while deleting.
   * @returns {Promise<void>}
   */
  async function deleteComment(comment, deleteButton) {
    const preview = comment.text.length > 60 ? `${comment.text.slice(0, 60)}...` : comment.text;
    const confirmed = await showConfirmDialog(
      `Delete this comment by ${comment.authorName}?\n\n"${preview}"\n\nThis can't be undone.`,
      'Delete',
      true
    );
    if (!confirmed) {
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
    // That was the last comment on the last page: step back one page.
    if (tableBody.children.length === 0 && currentPage > 1) {
      currentPage -= 1;
      await loadComments();
    }
  }

  /**
   * Loads one page of comments. A slow answer for an old search must not replace the
   * newer one: only the newest request is shown.
   *
   * @returns {Promise<void>}
   */
  async function loadComments() {
    latestRequestNumber += 1;
    const requestNumber = latestRequestNumber;

    listStatus.textContent = 'Loading comments...';
    listStatus.hidden = false;

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

  // Debounce: every key restarts the timer, so the search runs once typing pauses.
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      currentPage = 1;
      loadComments();
    }, SEARCH_DELAY_MS);
  });
  // Enter in the search box must not reload the page.
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setUpCommentModeration);
} else {
  setUpCommentModeration();
}
