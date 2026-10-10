/**
 * public/js/editorDashboard.js
 *
 * Fills the editor dashboard's table (views/editor/dashboard.ejs) with articles from
 * GET /api/editor/articles, 20 per page, and moves between pages without reloading
 * the page (Ajax). Each row links to the article's review page.
 *
 * Every text from the server is put on the page with textContent, never innerHTML,
 * so a title like "<script>..." is shown as plain text and can't run as code.
 *
 * Loaded by: views/editor/dashboard.ejs, after public/js/shared/apiClient.js.
 * Related: controllers/editorController.js (listAllArticles).
 * Owner: SM.
 */

const ARTICLES_API_URL = '/api/editor/articles';

/**
 * Formats a date from the server for the table, for example "10 Oct 2026, 14:32".
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
 * @returns {HTMLTableRowElement}
 */
function createArticleRow(article) {
  const row = document.createElement('tr');
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
  actionsCell.append(reviewLink);

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
 * Finds the dashboard's elements, loads the first page and connects the paging buttons.
 * Does nothing on a page without the dashboard table.
 *
 * @returns {void}
 */
function setUpEditorDashboard() {
  const tableBody = document.getElementById('article-rows');
  if (!tableBody) {
    return;
  }
  const listMessage = document.getElementById('article-list-message');
  const previousButton = document.getElementById('previous-page');
  const nextButton = document.getElementById('next-page');
  const pageInfo = document.getElementById('page-info');

  // What the table shows right now. The server's answer is the truth for page and
  // totalPages, so they are updated from every answer.
  const listState = { page: 1, totalPages: 1 };

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
   * Builds the API address for the current page.
   *
   * @returns {string} For example "/api/editor/articles?page=2".
   */
  function buildListUrl() {
    const queryParameters = new URLSearchParams({ page: String(listState.page) });
    return `${ARTICLES_API_URL}?${queryParameters.toString()}`;
  }

  /**
   * Turns the paging buttons on or off and writes "Page X of Y".
   *
   * @param {number} totalArticles - How many articles match, on all pages.
   * @returns {void}
   */
  function updatePaging(totalArticles) {
    pageInfo.textContent = `Page ${listState.page} of ${listState.totalPages} (${totalArticles} articles)`;
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
    tableBody.replaceChildren(...articles.map(createArticleRow));
    if (articles.length === 0) {
      showListMessage('No articles to show.', 'empty-state');
    } else {
      listMessage.hidden = true;
    }
    updatePaging(totalArticles);
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
