/**
 * public/js/public/articleComments.js
 *
 * The article page's comment form: posts a comment with Ajax and adds it to the top of
 * the list at once, without reloading the page or the list. Server errors (a missing
 * name, the 3-per-minute limit) are shown in #comment-error.
 *
 * Contract with views/public/article.ejs: #comments (with data-article-id),
 * #comment-list, #comment-form (fields authorName and text), #comment-error, and the
 * markup of one comment (li.comment, built the same way here).
 *
 * Everything a reader typed goes in with textContent, never innerHTML: a comment like
 * <img src=x onerror="..."> would otherwise run in every reader's browser (stored XSS).
 *
 * Loaded by: views/public/article.ejs, after public/js/shared/apiClient.js.
 * Owner: OS.
 */

// The same limits as the server, for an instant message (the server checks again).
const MAX_AUTHOR_NAME_LENGTH = 50;
const MAX_COMMENT_TEXT_LENGTH = 1000;

/**
 * Formats a comment's date like the server-rendered ones, in the reader's time zone.
 *
 * @param {string} isoDate - The date from the API.
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
 * Builds the li for one comment, all text set with textContent.
 *
 * @param {{id: string, authorName: string, text: string, createdAt: string}} comment - From the API.
 * @returns {HTMLLIElement}
 */
function createCommentElement(comment) {
  const item = document.createElement('li');
  item.className = 'comment';

  const meta = document.createElement('p');
  meta.className = 'comment-meta';

  const author = document.createElement('span');
  author.className = 'comment-author';
  author.textContent = comment.authorName;

  const date = document.createElement('time');
  date.className = 'comment-date';
  date.dateTime = comment.createdAt;
  date.textContent = formatCommentDate(comment.createdAt);

  meta.append(author, ' ', date);

  const text = document.createElement('p');
  text.className = 'comment-text';
  text.textContent = comment.text;

  item.append(meta, text);
  return item;
}

/**
 * Checks the fields before sending, with the server's rules and messages.
 *
 * @param {string} authorName - Trimmed.
 * @param {string} text - Trimmed.
 * @returns {string|null} A message to show, or null if both are fine.
 */
function findCommentFieldError(authorName, text) {
  if (authorName === '') {
    return 'Please enter your name.';
  }
  if (authorName.length > MAX_AUTHOR_NAME_LENGTH) {
    return `Your name can be at most ${MAX_AUTHOR_NAME_LENGTH} characters.`;
  }
  if (text === '') {
    return 'Please write a comment.';
  }
  if (text.length > MAX_COMMENT_TEXT_LENGTH) {
    return 'A comment can be at most 1,000 characters.';
  }
  return null;
}

/**
 * Connects the comment form. Does nothing on a page without #comments. The handlers
 * live inside this function (closures), so no other script can change their variables.
 *
 * @returns {void}
 */
function setUpCommentForm() {
  const commentsSection = document.getElementById('comments');
  if (!commentsSection) {
    return;
  }

  const articleId = commentsSection.dataset.articleId;
  const commentList = document.getElementById('comment-list');
  const commentForm = document.getElementById('comment-form');
  const commentError = document.getElementById('comment-error');
  const submitButton = commentForm.querySelector('[type="submit"]');

  /**
   * Shows an error under the form, as text.
   *
   * @param {string} message
   * @returns {void}
   */
  function showCommentError(message) {
    commentError.textContent = message;
    commentError.hidden = false;
  }

  /**
   * Hides the error message.
   *
   * @returns {void}
   */
  function clearCommentError() {
    commentError.textContent = '';
    commentError.hidden = true;
  }

  /**
   * Adds one comment at the top (the rest of the list isn't reloaded) and removes the
   * "no comments yet" note.
   *
   * @param {{id: string, authorName: string, text: string, createdAt: string}} comment
   * @returns {void}
   */
  function addCommentToTop(comment) {
    const emptyNote = commentList.querySelector('.empty-state');
    if (emptyNote) {
      emptyNote.remove();
    }
    commentList.prepend(createCommentElement(comment));
  }

  /**
   * Sends the form with Ajax instead of the browser's normal submit.
   *
   * @param {SubmitEvent} event
   * @returns {Promise<void>}
   */
  async function submitComment(event) {
    event.preventDefault();

    const authorName = commentForm.elements.authorName.value.trim();
    const text = commentForm.elements.text.value.trim();

    const fieldError = findCommentFieldError(authorName, text);
    if (fieldError) {
      showCommentError(fieldError);
      return;
    }

    // Disabled while waiting, so a double click doesn't post twice.
    submitButton.disabled = true;
    clearCommentError();

    // The id is read from the page, so it is encoded before it goes into the URL.
    const result = await apiClient.post(`/api/articles/${encodeURIComponent(articleId)}/comments`, {
      authorName: authorName,
      text: text,
    });

    submitButton.disabled = false;

    if (!result.success) {
      showCommentError(result.error);
      return;
    }

    addCommentToTop(result.data);
    // Keep the name for the reader's next comment.
    commentForm.elements.text.value = '';
  }

  commentForm.addEventListener('submit', submitComment);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setUpCommentForm);
} else {
  setUpCommentForm();
}
