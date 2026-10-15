/**
 * public/js/public/feed.js
 *
 * The home page feed: infinite scroll, search, the category and viewed filters, sorting
 * and "Reset viewed marks", all without reloading the page. The server already rendered
 * page 1, so this script starts with page 2.
 *
 * Infinite scroll uses an IntersectionObserver on an empty "sentinel" at the end of the
 * list (the scroll event would fire dozens of times a second). Every new list gets a
 * number, so a slow answer for an old search can't replace the newer results.
 *
 * Loaded by: views/public/feed.ejs, after public/js/shared/apiClient.js.
 * Owner: SH.
 */

// Wait this long after the last key press before searching.
const FEED_SEARCH_DELAY_MS = 300;

// Load the next page when the end of the list is this close to the screen.
const FEED_PRELOAD_MARGIN = '300px';

const PLACEHOLDER_IMAGE_URL = '/images/placeholder.svg';

/**
 * Formats a publish date like the server-rendered cards, in the reader's time zone.
 *
 * @param {string} isoDate - The date from the API.
 * @returns {string} For example "10 Oct 2026, 14:32".
 */
function formatFeedDate(isoDate) {
  return new Date(isoDate).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Builds one feed card with the same markup as views/public/feed.ejs. All text goes in
 * with textContent, never innerHTML.
 *
 * @param {{id: string, title: string, summary: string, imageUrl: string, category: string,
 *   reporterName: string, publishedAt: string, totalViews: number}} card - From the API.
 * @returns {HTMLElement} An article element.
 */
function createArticleCard(card) {
  const article = document.createElement('article');
  article.className = card.imageUrl ? 'card article-card article-card-with-image' : 'card article-card';
  article.dataset.articleId = card.id;
  const text = document.createElement('div');
  text.className = 'article-card-text';

  const badge = document.createElement('span');
  badge.className = 'category-badge';
  badge.textContent = card.category;

  const heading = document.createElement('h3');
  heading.className = 'article-card-title';
  const link = document.createElement('a');
  link.href = `/articles/${encodeURIComponent(card.id)}`;
  link.textContent = card.title;
  heading.append(link);

  const meta = document.createElement('p');
  meta.className = 'article-card-meta';
  const time = document.createElement('time');
  time.dateTime = card.publishedAt;
  time.textContent = formatFeedDate(card.publishedAt);
  meta.append(`By ${card.reporterName} | `, time, ` | ${card.totalViews} views`);

  if (card.imageUrl) {
    const image = document.createElement('img');
    image.className = 'article-card-image';
    image.src = card.imageUrl;
    image.alt = card.title;
    image.loading = 'lazy';
    // A broken image shows our placeholder; removing the listener first prevents a loop.
    image.addEventListener('error', function showPlaceholder() {
      image.removeEventListener('error', showPlaceholder);
      image.src = PLACEHOLDER_IMAGE_URL;
    });
    article.append(image);
  }

  const summary = document.createElement('p');
  summary.textContent = card.summary;
  text.append(badge, heading, meta, summary);
  article.append(text);

  return article;
}

/**
 * Connects the feed. Does nothing on a page without it. All the state lives inside this
 * function, so no other script can change it.
 *
 * @returns {void}
 */
function setUpFeed() {
  const feedList = document.getElementById('feed-list');
  const filterForm = document.getElementById('feed-filters');
  const searchInput = document.getElementById('search-input');
  const categoryFilter = document.getElementById('category-filter');
  const viewedFilter = document.getElementById('viewed-filter');
  const sortSelect = document.getElementById('sort-select');
  const resetViewsButton = document.getElementById('reset-views-btn');
  const actionMessage = document.getElementById('feed-action-message');

  if (!feedList || !filterForm || !searchInput || !categoryFilter || !viewedFilter || !sortSelect) {
    return;
  }

  // The cards on the page: if the order shifts while scrolling, a card is never shown twice.
  const shownArticleIds = new Set();
  feedList.querySelectorAll('.article-card').forEach((card) => shownArticleIds.add(card.dataset.articleId));

  // The server rendered page 1 (if there were articles).
  let nextPage = shownArticleIds.size > 0 ? 2 : 1;
  let hasMore = feedList.dataset.hasMore === 'true';
  let isLoading = false;
  // Grows with every new list (search, filter or sort).
  let listNumber = 0;
  let searchTimer = null;

  // Watched by the observer; also shows "Loading...", "No more articles" or an error.
  const sentinel = document.createElement('div');
  sentinel.id = 'feed-sentinel';
  sentinel.className = 'feed-sentinel';
  sentinel.setAttribute('role', 'status');
  feedList.append(sentinel);

  /**
   * Shows a message in the sentinel, with a "Try again" button after an error.
   *
   * @param {string} text - The message.
   * @param {boolean} [withRetry]
   * @returns {void}
   */
  function showSentinelMessage(text, withRetry) {
    sentinel.textContent = text;
    if (withRetry) {
      const retryButton = document.createElement('button');
      retryButton.type = 'button';
      retryButton.className = 'btn btn-secondary';
      retryButton.textContent = 'Try again';
      retryButton.addEventListener('click', loadNextPage);
      sentinel.append(' ', retryButton);
    }
  }

  /**
   * Builds the API address for the next page with the current search, filters and sort
   * (URLSearchParams encodes the values).
   *
   * @returns {string}
   */
  function buildFeedUrl() {
    const query = new URLSearchParams({ page: String(nextPage), sort: sortSelect.value });
    const searchText = searchInput.value.trim();
    if (searchText !== '') {
      query.set('search', searchText);
    }
    if (categoryFilter.value !== '') {
      query.set('category', categoryFilter.value);
    }
    if (viewedFilter.value !== '') {
      query.set('viewed', viewedFilter.value);
    }
    return `/api/articles?${query.toString()}`;
  }

  /**
   * Makes the observer check the sentinel again at once, so a list too short to fill the
   * screen keeps loading without the reader scrolling.
   *
   * @returns {void}
   */
  function checkSentinelAgain() {
    observer.unobserve(sentinel);
    observer.observe(sentinel);
  }

  /**
   * Loads the next page of the current list and adds its cards at the end.
   *
   * @returns {Promise<void>}
   */
  async function loadNextPage() {
    // Never two requests for the same list at once.
    if (isLoading || !hasMore) {
      return;
    }
    isLoading = true;
    const requestListNumber = listNumber;
    showSentinelMessage('Loading more articles...');

    const result = await apiClient.get(buildFeedUrl());

    // A newer list was started meanwhile: this answer belongs to the old one.
    if (requestListNumber !== listNumber) {
      return;
    }
    isLoading = false;

    if (!result.success) {
      showSentinelMessage(`Could not load articles: ${result.error}`, true);
      return;
    }

    const cards = result.data.articles.filter((card) => !shownArticleIds.has(card.id));
    cards.forEach((card) => {
      shownArticleIds.add(card.id);
      feedList.insertBefore(createArticleCard(card), sentinel);
    });
    hasMore = result.data.hasMore;
    nextPage += 1;

    if (shownArticleIds.size === 0) {
      showSentinelMessage('No articles match your search and filters.');
    } else if (!hasMore) {
      showSentinelMessage('No more articles.');
    } else {
      showSentinelMessage('');
      checkSentinelAgain();
    }
  }

  /**
   * Starts the list again from page 1 (a late answer for the old list is then ignored).
   *
   * @returns {void}
   */
  function reloadList() {
    clearTimeout(searchTimer);
    listNumber += 1;
    isLoading = false;
    hasMore = true;
    nextPage = 1;
    shownArticleIds.clear();
    // Keeps only the sentinel.
    feedList.replaceChildren(sentinel);
    loadNextPage();
  }

  /**
   * On every key press: waits until typing pauses (one request per search, not per letter).
   *
   * @returns {void}
   */
  function searchAfterTyping() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(reloadList, FEED_SEARCH_DELAY_MS);
  }

  /**
   * "Reset viewed marks": the server finds this browser by its deviceId cookie.
   *
   * @returns {Promise<void>}
   */
  async function resetViewedMarks() {
    resetViewsButton.disabled = true;
    const result = await apiClient.delete('/api/articles/viewed');
    resetViewsButton.disabled = false;

    if (!result.success) {
      actionMessage.textContent = `Could not reset the viewed marks: ${result.error}`;
      actionMessage.hidden = false;
      return;
    }
    actionMessage.hidden = true;
    // Only a viewed filter shows the marks.
    if (viewedFilter.value !== '') {
      reloadList();
    }
  }

  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      loadNextPage();
    }
  }, { rootMargin: FEED_PRELOAD_MARGIN });

  searchInput.addEventListener('input', searchAfterTyping);
  categoryFilter.addEventListener('change', reloadList);
  viewedFilter.addEventListener('change', reloadList);
  sortSelect.addEventListener('change', reloadList);
  // Enter would submit the form and reload the page; search at once instead.
  filterForm.addEventListener('submit', (event) => {
    event.preventDefault();
    reloadList();
  });
  if (resetViewsButton && actionMessage) {
    resetViewsButton.addEventListener('click', resetViewedMarks);
  }

  // Back to this page from the browser's memory (persisted): opening an article changed
  // which articles are "viewed", so a viewed filter must reload.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && viewedFilter.value !== '') {
      reloadList();
    }
  });

  if (shownArticleIds.size > 0 && !hasMore) {
    showSentinelMessage('No more articles.');
  }
  observer.observe(sentinel);
}

document.addEventListener('DOMContentLoaded', setUpFeed);
