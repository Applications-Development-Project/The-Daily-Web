/**
 * public/js/editor/dashboard.js
 *
 * Fills the editor dashboard's table from GET /api/editor/articles, 20 per page. The
 * status filter, the title search and the paging reload only the table, never the page.
 * Each row has a Review link and a Delete button (with confirmation).
 *
 * Text from the server goes in with textContent, never innerHTML, so a title can't run
 * as code. Nothing here is a permission check: the server answers 401/403 itself.
 *
 * Loaded by: views/editor/dashboard.ejs, after public/js/shared/apiClient.js.
 * Owner: SM.
 */

const ARTICLES_API_URL = '/api/editor/articles';

// Wait this long after the last key before searching, so typing a word sends one request.
const SEARCH_DELAY_MS = 300;

/**
 * Formats a date from the server, for example "10 Oct 2026, 14:32", in the editor's time zone.
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
  // A value placed in a URL is always encoded, so it can never change the address.
  const reviewUrl = `/editor/articles/${encodeURIComponent(article.id)}`;

  const titleCell = document.createElement('td');
  const titleLink = document.createElement('a');
  titleLink.href = reviewUrl;
  titleLink.textContent = article.title;
  titleCell.append(titleLink);

  // The badge's colour comes from main.css (status-draft, status-pending...).
  const statusCell = document.createElement('td');
  const statusBadge = document.createElement('span');
  statusBadge.className = `status-badge status-${article.status}`;
  statusBadge.textContent = article.statusLabel;
  statusCell.append(statusBadge);

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
 * Finds the dashboard's elements, loads the first page and connects the filter, the
 * search box and the paging buttons. Does nothing on a page without the table.
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
  const statusSummaryCards = document.querySelectorAll('.status-summary-card');

  // '' for status or search means "no filter". page and totalPages come from the server.
  const listState = { status: '', search: '', page: 1, totalPages: 1 };

  let searchTimer = null;

  // An answer to an older request that arrives late is ignored, so the table always
  // shows the editor's latest action (the network doesn't promise the order).
  let latestRequestNumber = 0;

  /**
   * Shows a message above the table.
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
   * Builds the API address for the current filter, search and page (URLSearchParams
   * encodes the values).
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
   * Asks the server for the current page and redraws the table.
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
   * Asks for confirmation (a deleted article can't be brought back), deletes the article
   * and reloads the current page of the table.
   *
   * @param {{id: string, title: string}} article - The article in the clicked row.
   * @param {HTMLButtonElement} deleteButton - Disabled while deleting, against double clicks.
   * @returns {Promise<void>}
   */
  async function deleteArticle(article, deleteButton) {
    const confirmed = await showConfirmDialog(
      `Delete "${article.title}"?\n\nIts comments and view statistics will be deleted too. This can't be undone.`,
      'Delete',
      true
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
      // For example 404 if someone else deleted it already; the reload shows the truth.
      showActionMessage(result.error, 'form-error');
    } else {
      const commentCount = result.data.deletedComments;
      const commentWord = commentCount === 1 ? 'comment' : 'comments';
      showActionMessage(`Deleted "${article.title}" (with ${commentCount} ${commentWord}).`, '');
    }

    // If that was the only row on the last page, go back one page.
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
   * Reads the filter and search and loads page 1 of the new results.
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
   * A click on a status counter: sets the status filter to that status and reuses
   * applyFilters(), so the table loads exactly as if the editor had chosen it in the list.
   *
   * @param {MouseEvent} event - The click; currentTarget is the counter's button.
   * @returns {void}
   */
  function handleSummaryCardClick(event) {
    const button = event.currentTarget;
    statusFilter.value = button.dataset.status;
    applyFilters();
  }

  /**
   * On every key press: cancels the waiting search and waits again, so the search runs
   * only once typing pauses.
   *
   * @returns {void}
   */
  function searchAfterTyping() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applyFilters, SEARCH_DELAY_MS);
  }

  /**
   * Enter in the search box: search now instead of submitting the form (a page reload).
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
  // Each status counter filters the table by its status.
  statusSummaryCards.forEach((card) => {
    card.addEventListener('click', handleSummaryCardClick);
  });

  loadArticles();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setUpEditorDashboard);
} else {
  setUpEditorDashboard();
}
