/**
 * public/js/editor/dashboard.js
 *
 * Fills the editor dashboard's table (views/editor/dashboard.ejs) with articles from
 * GET /api/editor/articles, 20 per page. Changing the status filter, typing in the title
 * search and moving between pages all reload only the table, never the page (Ajax).
 * Each row links to the article's review page and has a Delete button, which asks
 * for confirmation and then deletes the article with its comments and statistics.
 *
 * Requirements this serves: the editor sees every article and filters them by status;
 * search, filtering and paging happen without a full page reload (Ajax with fetch,
 * through apiClient.js).
 *
 * Every text from the server is put on the page with textContent, never innerHTML,
 * so a title like "<script>..." is shown as plain text and can't run as code.
 *
 * Nothing here is a permission check. The server decides: the list and delete APIs
 * answer 401/403 to anyone who isn't an editor, whatever this script does. Checks in
 * the browser (the 200-character limit on the search box, the delete confirmation)
 * are only for a quick, friendly answer; the server checks the same things again.
 *
 * The answer it reads, { articles: [{ id, title, reporterName, status, statusLabel,
 * isLive, updatedAt }], page, totalPages, totalArticles }, is SM's own contract with
 * listAllArticles in controllers/editorController.js.
 *
 * Loaded by: views/editor/dashboard.ejs, after public/js/shared/apiClient.js.
 * Related: controllers/editorController.js (listAllArticles, deleteArticle).
 * Owner: SM.
 */

const ARTICLES_API_URL = '/api/editor/articles';

// How long to wait after the last key in the search box before searching, so typing
// "council" sends one request instead of seven (the same delay as user management).
const SEARCH_DELAY_MS = 300;

/**
 * Formats a date from the server for the table, for example "10 Oct 2026, 14:32".
 * It runs in the browser, so the time is shown in the editor's own time zone; the
 * server sends the exact moment in ISO format (UTC).
 *
 * @param {string} isoDate - A date in ISO format, as JSON sends it.
 * @returns {string}
 */
function formatDateTime(isoDate) {
  return new Date(isoDate).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Creates a table cell holding plain text.
 *
 * @param {string} text - What the cell shows.
 * @returns {HTMLTableCellElement}
 */
function createTextCell(text) {
  const cell = document.createElement('td');
  cell.textContent = text;
  return cell;
}

/**
 * Builds one table row for an article from the API.
 *
 * @param {{id: string, title: string, reporterName: string, status: string,
 *   statusLabel: string, isLive: boolean, updatedAt: string}} article
 * @param {function(Object, HTMLButtonElement): void} onDeleteClick - Called with the
 *   article and its Delete button when the button is clicked.
 * @returns {HTMLTableRowElement}
 */
function createArticleRow(article, onDeleteClick) {
  const row = document.createElement('tr');
  // encodeURIComponent: a value placed inside a URL is always encoded, so even an
  // unexpected id could never change the address (ids are 24 hex characters today).
  const reviewUrl = `/editor/articles/${encodeURIComponent(article.id)}`;

  const titleCell = document.createElement('td');
  const titleLink = document.createElement('a');
  titleLink.href = reviewUrl;
  titleLink.textContent = article.title;
  titleCell.append(titleLink);

  // The badge's colour comes from main.css: status-draft, status-pending...
  const statusCell = document.createElement('td');
  const statusBadge = document.createElement('span');
  statusBadge.className = `status-badge status-${article.status}`;
  statusBadge.textContent = article.statusLabel;
  statusCell.append(statusBadge);

  // <time datetime="..."> keeps the exact date for machines; people read the formatted one.
  const updatedCell = document.createElement('td');
  const updatedTime = document.createElement('time');
  updatedTime.dateTime = article.updatedAt;
  updatedTime.textContent = formatDateTime(article.updatedAt);
  updatedCell.append(updatedTime);

  const actionsCell = document.createElement('td');
  const reviewLink = document.createElement('a');
  reviewLink.href = reviewUrl;
  reviewLink.className = 'btn btn-primary';
  reviewLink.textContent = 'Review';

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'btn btn-danger';
  deleteButton.textContent = 'Delete';
  deleteButton.addEventListener('click', function handleDeleteClick() {
    onDeleteClick(article, deleteButton);
  });

  actionsCell.append(reviewLink, ' ', deleteButton);

  row.append(
    titleCell,
    createTextCell(article.reporterName),
    statusCell,
    createTextCell(article.isLive ? 'Yes' : 'No'),
    updatedCell,
    actionsCell
  );
  return row;
}

/**
 * Finds the dashboard's elements, loads the first page and connects the filter,
 * the search box and the paging buttons. Does nothing on a page without the table.
 *
 * @returns {void}
 */
function setUpEditorDashboard() {
  const tableBody = document.getElementById('article-rows');
  if (!tableBody) {
    return;
  }
  const listMessage = document.getElementById('article-list-message');
  const actionMessage = document.getElementById('article-action-message');
  const filterForm = document.getElementById('article-filters');
  const statusFilter = document.getElementById('status-filter');
  const titleSearch = document.getElementById('title-search');
  const previousButton = document.getElementById('previous-page');
  const nextButton = document.getElementById('next-page');
  const pageInfo = document.getElementById('page-info');

  // What the table shows right now: '' for status or search means "no filter".
  // The server's answer is the truth for page and totalPages, so they are updated
  // from every answer.
  const listState = { status: '', search: '', page: 1, totalPages: 1 };

  // The waiting search, so a new key press can cancel it (see searchAfterTyping).
  let searchTimer = null;

  // Every request gets a number. If an older request answers after a newer one (the
  // network doesn't promise the order), its answer is ignored, so the table always
  // shows the result of the editor's latest action.
  let latestRequestNumber = 0;

  /**
   * Shows a message above the table (loading, empty, error).
   *
   * @param {string} text - The message.
   * @param {string} className - 'loading', 'empty-state' or 'form-error' (main.css).
   * @returns {void}
   */
  function showListMessage(text, className) {
    listMessage.textContent = text;
    listMessage.className = className;
    listMessage.hidden = false;
  }

  /**
   * Shows that the session ended, with a link to log in again.
   *
   * @returns {void}
   */
  function showLoggedOutMessage() {
    showListMessage('Your session has ended. ', 'form-error');
    const loginLink = document.createElement('a');
    loginLink.href = '/login';
    loginLink.textContent = 'Log in again';
    listMessage.append(loginLink);
  }

  /**
   * Builds the API address for the current filter, search and page. URLSearchParams
   * encodes the values, so a search like "C++ & AI" reaches the server unchanged.
   *
   * @returns {string} For example "/api/editor/articles?status=pending&search=council&page=1".
   */
  function buildListUrl() {
    const queryParameters = new URLSearchParams({ page: String(listState.page) });
    if (listState.status !== '') {
      queryParameters.set('status', listState.status);
    }
    if (listState.search !== '') {
      queryParameters.set('search', listState.search);
    }
    return `${ARTICLES_API_URL}?${queryParameters.toString()}`;
  }

  /**
   * Turns the paging buttons on or off and writes "Page X of Y".
   *
   * @param {number} totalArticles - How many articles match, on all pages.
   * @returns {void}
   */
  function updatePaging(totalArticles) {
    const articleWord = totalArticles === 1 ? 'article' : 'articles';
    pageInfo.textContent = `Page ${listState.page} of ${listState.totalPages} (${totalArticles} ${articleWord})`;
    previousButton.disabled = listState.page <= 1;
    nextButton.disabled = listState.page >= listState.totalPages;
  }

  /**
   * Asks the server for the current page and redraws the table with the answer.
   *
   * @returns {Promise<void>}
   */
  async function loadArticles() {
    latestRequestNumber += 1;
    const requestNumber = latestRequestNumber;

    showListMessage('Loading articles...', 'loading');
    // Disabled while waiting, so a fast double click can't skip a page.
    previousButton.disabled = true;
    nextButton.disabled = true;

    const result = await apiClient.get(buildListUrl());
    if (requestNumber !== latestRequestNumber) {
      return;
    }

    if (!result.success) {
      tableBody.replaceChildren();
      pageInfo.textContent = '';
      if (result.status === 401) {
        showLoggedOutMessage();
      } else {
        showListMessage(result.error, 'form-error');
      }
      return;
    }

    const { articles, page, totalPages, totalArticles } = result.data;
    listState.page = page;
    listState.totalPages = totalPages;

    // replaceChildren removes the old rows and adds the new ones in one step.
    const rows = articles.map((article) => createArticleRow(article, deleteArticle));
    tableBody.replaceChildren(...rows);
    if (articles.length === 0) {
      const isFiltered = listState.status !== '' || listState.search !== '';
      showListMessage(isFiltered ? 'No articles match this filter and search.' : 'There are no articles yet.', 'empty-state');
    } else {
      listMessage.hidden = true;
    }
    updatePaging(totalArticles);
  }

  /**
   * Shows the result of the editor's last action above the table.
   *
   * @param {string} text - The message.
   * @param {string} className - '' for a normal message, 'form-error' for an error.
   * @returns {void}
   */
  function showActionMessage(text, className) {
    actionMessage.textContent = text;
    actionMessage.className = className;
    actionMessage.hidden = false;
  }

  /**
   * Asks the editor to confirm, then deletes the article and reloads the current page.
   * The server checks again that the user is an editor; the confirmation only protects
   * against a slip of the mouse, because a deleted article can't be brought back.
   *
   * @param {{id: string, title: string}} article - The article in the clicked row.
   * @param {HTMLButtonElement} deleteButton - Disabled while deleting, so a double
   *   click can't send the request twice.
   * @returns {Promise<void>}
   */
  async function deleteArticle(article, deleteButton) {
    const confirmed = window.confirm(
      `Delete "${article.title}"?\n\nIts comments and view statistics will be deleted too. This can't be undone.`
    );
    if (!confirmed) {
      return;
    }

    deleteButton.disabled = true;
    const result = await apiClient.delete(`${ARTICLES_API_URL}/${encodeURIComponent(article.id)}`);

    if (result.status === 401) {
      deleteButton.disabled = false;
      showLoggedOutMessage();
      return;
    }
    if (!result.success) {
      // For example 404: someone else already deleted it. The reload below shows the truth.
      showActionMessage(result.error, 'form-error');
    } else {
      const commentCount = result.data.deletedComments;
      const commentWord = commentCount === 1 ? 'comment' : 'comments';
      showActionMessage(`Deleted "${article.title}" (with ${commentCount} ${commentWord}).`, '');
    }

    // If that was the only row on the last page, that page no longer exists:
    // go back one page instead of showing an empty table.
    if (tableBody.children.length === 1 && listState.page > 1) {
      listState.page -= 1;
    }
    await loadArticles();
  }

  /**
   * Goes one page back.
   *
   * @returns {void}
   */
  function showPreviousPage() {
    if (listState.page > 1) {
      listState.page -= 1;
      loadArticles();
    }
  }

  /**
   * Goes one page forward.
   *
   * @returns {void}
   */
  function showNextPage() {
    if (listState.page < listState.totalPages) {
      listState.page += 1;
      loadArticles();
    }
  }

  /**
   * Reads the filter and search boxes and loads the first page of the new results.
   * A new filter starts again from page 1: page 3 of the old results may not exist.
   *
   * @returns {void}
   */
  function applyFilters() {
    clearTimeout(searchTimer);
    listState.status = statusFilter.value;
    listState.search = titleSearch.value.trim();
    listState.page = 1;
    loadArticles();
  }

  /**
   * Called on every key press in the search box. Each press cancels the waiting
   * search and starts the wait again, so the search runs only once typing pauses.
   *
   * @returns {void}
   */
  function searchAfterTyping() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applyFilters, SEARCH_DELAY_MS);
  }

  /**
   * Pressing Enter in the search box would normally submit the form and reload the
   * page; we stop that and search right away instead.
   *
   * @param {SubmitEvent} event - The form's submit event.
   * @returns {void}
   */
  function searchNow(event) {
    event.preventDefault();
    applyFilters();
  }

  statusFilter.addEventListener('change', applyFilters);
  titleSearch.addEventListener('input', searchAfterTyping);
  filterForm.addEventListener('submit', searchNow);
  previousButton.addEventListener('click', showPreviousPage);
  nextButton.addEventListener('click', showNextPage);
  loadArticles();
}

// The script is loaded at the end of <body>, but we still wait if the page is loading,
// so it works wherever the script tag is placed.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setUpEditorDashboard);
} else {
  setUpEditorDashboard();
}
