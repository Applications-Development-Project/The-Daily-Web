/**
 * public/js/articleComments.js
 *
 * The comment form on the article page. When a reader posts a comment, this script
 * sends it with Ajax (apiClient.post) and adds it to the top of the list right away,
 * without reloading the page or the list (requirements: "a new comment appears
 * immediately, without reloading the whole list"). Server errors, for example a
 * missing name or "3 comments per minute" (429), are shown in #comment-error.
 *
 * The page (views/public/article.ejs, owned by SH) renders the article and its first
 * comments on the server, and provides these elements, fixed in "Shared contracts":
 *   #comments        the section, with the article id in data-article-id
 *   #comment-list    the list of comments
 *   #comment-form    the form, with fields named authorName and text
 *   #comment-error   where errors are shown
 *
 * One comment in #comment-list has this markup. The server-rendered comments and the
 * ones added here must match, so both look the same:
 *   <li class="comment">
 *     <p class="comment-meta">
 *       <span class="comment-author">Noa</span>
 *       <time class="comment-date" datetime="2026-10-10T10:51:34.685Z">10 Oct 2026, 13:51</time>
 *     </p>
 *     <p class="comment-text">Great article!</p>
 *   </li>
 * When there are no comments yet, the list may hold <li class="empty-state">...</li>;
 * it is removed when the first comment is added.
 *
 * Load after apiClient.js:
 *   <script src="/js/shared/apiClient.js"></script>
 *   <script src="/js/articleComments.js"></script>
 *
 * Security: everything a reader typed is put on the page with textContent, never
 * innerHTML, so a comment containing <script> or other HTML is shown as plain text
 * and never runs.
 *
 * Owner: OS.
 */

// The same limits the server checks (controllers/commentController.js). Checking here
// too gives an instant message; the server still checks, because a browser can be bypassed.
const MAX_AUTHOR_NAME_LENGTH = 50;
const MAX_COMMENT_TEXT_LENGTH = 1000;

/**
 * Formats a comment's date like "10 Oct 2026, 13:51". The article page formats the
 * server-rendered comments with the same options, so all dates look the same.
 *
 * @param {string} isoDate - The date from the API, for example "2026-10-10T10:51:34.685Z".
 * @returns {string} The date for people to read, in the reader's own time zone.
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
 * Builds the <li> for one comment, with the markup described in the header.
 * Every piece of text is set with textContent, so nothing a reader typed is ever
 * treated as HTML.
 *
 * @param {{id: string, authorName: string, text: string, createdAt: string}} comment -
 *   A comment as returned by the API.
 * @returns {HTMLLIElement} The finished list item.
 */
function createCommentElement(comment) {
  const item = document.createElement('li');
  item.className = 'comment';

  const meta = document.createElement('p');
  meta.className = 'comment-meta';

  const author = document.createElement('span');
  author.className = 'comment-author';
  author.textContent = comment.authorName;

  // <time datetime="..."> gives browsers and search engines the exact date,
  // while people read the formatted one.
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
 * Checks the fields before sending, with the same rules and messages as the server.
 *
 * @param {string} authorName - The name, already trimmed.
 * @param {string} text - The comment, already trimmed.
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
 * Connects the comment form on this page. Does nothing on a page without #comments,
 * so the script can never break another page.
 *
 * The handlers below are defined inside this function, so they can use its
 * variables (the form, the list, the article id) without making them global.
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
   * Shows an error message under the form, as plain text.
   *
   * @param {string} message - The text to show.
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
   * Adds a comment at the top of the list and removes the "no comments yet" note.
   * Only this one element is added; the rest of the list is not reloaded.
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
   * @param {SubmitEvent} event - The form's submit event.
   * @returns {Promise<void>}
   */
  async function submitComment(event) {
    // Stop the normal submit, which would load a new page.
    event.preventDefault();

    const authorName = commentForm.elements.authorName.value.trim();
    const text = commentForm.elements.text.value.trim();

    const fieldError = findCommentFieldError(authorName, text);
    if (fieldError) {
      showCommentError(fieldError);
      return;
    }

    // Disabled while waiting, so a double click doesn't post the comment twice.
    submitButton.disabled = true;
    clearCommentError();

    const result = await apiClient.post(`/api/articles/${encodeURIComponent(articleId)}/comments`, {
      authorName: authorName,
      text: text,
    });

    submitButton.disabled = false;

    if (!result.success) {
      // For example "Please enter your name." or the 3-per-minute limit message.
      showCommentError(result.error);
      return;
    }

    addCommentToTop(result.data);
    // Clear the comment but keep the name, for the reader's next comment.
    commentForm.elements.text.value = '';
  }

  commentForm.addEventListener('submit', submitComment);
}

// The page may load this script in <head> or at the end of <body>. If the page is
// still loading, wait until all elements exist; otherwise start right away.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setUpCommentForm);
} else {
  setUpCommentForm();
}
