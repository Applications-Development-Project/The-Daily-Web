/**
 * public/js/public/feed.js
 *
 * Runs the home page feed (views/public/feed.ejs): infinite scroll, search, the category
 * and viewed / not-viewed filters, sorting, and "Reset viewed marks", all without
 * reloading the page (Ajax through public/js/shared/apiClient.js).
 *
 * Requirements this serves: 20 more articles load automatically when the reader nears the
 * bottom; search, filtering, sorting and loading more happen without a full page reload.
 *
 * How it works, and why:
 * - The server already rendered page 1 into the HTML (controllers/feedController.js), so this
 *   script starts by loading page 2, and only when the reader scrolls near the bottom.
 * - Infinite scroll uses an IntersectionObserver on an empty "sentinel" element at the end of
 *   the list. The browser tells us when the sentinel comes within 300px of the screen; we
 *   never listen to the scroll event, which fires dozens of times per second while scrolling.
 * - Search waits 300 ms after the last key press (a "debounce"), so typing "election" sends
 *   one request, not eight. A filter or sort change reloads the list at once.
 * - Never two requests for the same list at once: while a page is loading, scrolling doesn't
 *   start another one. A search or filter change does start a new list immediately, and
 *   every request gets a number; an answer is used only if no newer list was started since.
 *   Without the number, a slow answer for "elec" could arrive after the answer for
 *   "election" and replace it with results for text that is no longer in the box.
 * - A card that is already on the page is not added again. Pages are numbered on the server,
 *   so if an article is published (or its view count changes) while the reader scrolls, the
 *   next page can start with an article we already show (see feedController.js).
 * - When the reader comes back with the browser's Back button, the browser may show this page
 *   from its memory, as it was. If a viewed filter is on, the list is reloaded, because
 *   opening an article has just changed which articles are "viewed".
 *
 * Every text from the server is put on the page with textContent or as a property, never
 * with innerHTML, so a title like "<script>...</script>" is shown as text and never runs.
 *
 * The answer it reads is GET /api/articles -> { success: true, data: { articles, hasMore } },
 * with the "Feed card fields" { id, title, summary, imageUrl, category, reporterName,
 * publishedAt, totalViews }.
 *
 * Loaded by: views/public/feed.ejs, after public/js/shared/apiClient.js.
 * Related: controllers/feedController.js (the API), views/public/feed.ejs (the same card markup).
 * Owner: SH.
 */

// Wait this long after the last key press before searching.
const FEED_SEARCH_DELAY_MS = 300;

// Start loading the next page when the end of the list is this close to the screen, so the
// reader rarely has to wait at the very bottom ("when the reader nears the bottom").
const FEED_PRELOAD_MARGIN = '300px';

const PLACEHOLDER_IMAGE_URL = '/images/placeholder.svg';

/**
 * Formats a publish date like the server-rendered cards: "10 Oct 2026, 14:32", in the
 * reader's own time zone.
 *
 * @param {string} isoDate - The date from the API.
 * @returns {string}
 */
function formatFeedDate(isoDate) {
  return new Date(isoDate).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Builds one feed card with the same markup and classes as views/public/feed.ejs.
 *
 * @param {{id: string, title: string, summary: string, imageUrl: string, category: string,
 *   reporterName: string, publishedAt: string, totalViews: number}} card - From the API.
 * @returns {HTMLElement} An article element.
 */
function createArticleCard(card) {
  const article = document.createElement('article');
  article.className = 'card article-card';
  article.dataset.articleId = card.id;

  const badge = document.createElement('span');
  badge.className = 'status-badge status-published';
  badge.textContent = card.category;

  const heading = document.createElement('h3');
  heading.className = 'article-card-title';
  const link = document.createElement('a');
  // encodeURIComponent keeps the id inside the path, whatever it holds.
  link.href = `/articles/${encodeURIComponent(card.id)}`;
  link.textContent = card.title;
  heading.append(link);

  const meta = document.createElement('p');
  meta.className = 'article-card-meta';
  const time = document.createElement('time');
  time.dateTime = card.publishedAt;
  time.textContent = formatFeedDate(card.publishedAt);
  meta.append(`By ${card.reporterName} | `, time, ` | ${card.totalViews} views`);

  article.append(badge, heading, meta);

  if (card.imageUrl) {
    const image = document.createElement('img');
    image.className = 'article-card-image';
    image.src = card.imageUrl;
    image.alt = card.title;
    image.loading = 'lazy';
    // A broken link or a host that is down shows our placeholder instead of a broken-image
    // icon. Removing the listener first means a failing placeholder can't loop forever.
    image.addEventListener('error', function showPlaceholder() {
      image.removeEventListener('error', showPlaceholder);
      image.src = PLACEHOLDER_IMAGE_URL;
    });
    article.append(image);
  }

  const summary = document.createElement('p');
  summary.textContent = card.summary;
  article.append(summary);

  return article;
}

/**
 * Connects the feed once the page has loaded. Does nothing on a page without the feed.
 *
 * All the state lives inside this function, shared by the inner functions, so no other
 * script can change it by accident.
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

  // The ids of the cards on the page, so a card is never shown twice.
  const shownArticleIds = new Set();
  feedList.querySelectorAll('.article-card').forEach((card) => shownArticleIds.add(card.dataset.articleId));

  // The server rendered page 1 (if there were any articles), so the next page to load is 2.
  let nextPage = shownArticleIds.size > 0 ? 2 : 1;
  let hasMore = feedList.dataset.hasMore === 'true';
  let isLoading = false;
  // Grows by one for every new list (a new search, filter or sort); see the header.
  let listNumber = 0;
  let searchTimer = null;

  // The sentinel: the element the IntersectionObserver watches, at the end of the list. It
  // also shows "Loading...", "No more articles" or an error, so the reader always knows.
  const sentinel = document.createElement('div');
  sentinel.id = 'feed-sentinel';
  sentinel.className = 'feed-sentinel';
  sentinel.setAttribute('role', 'status');
  feedList.append(sentinel);

  /**
   * Shows a message in the sentinel, optionally with a "Try again" button.
   *
   * @param {string} text - The message.
   * @param {boolean} [withRetry] - true after an error.
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
   * Builds the API address for the next page with the current search, filters and sort.
   * URLSearchParams encodes the search text, so "C++ & AI" reaches the server unchanged.
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
   * Asks the IntersectionObserver to check the sentinel again. Watching it anew makes the
   * observer report its current state at once, so if the list is still too short to fill the
   * screen (a tall screen, or few results) the next page loads without the reader scrolling.
   *
   * @returns {void}
   */
  function checkSentinelAgain() {
    observer.unobserve(sentinel);
    observer.observe(sentinel);
  }

  /**
   * Loads the next page of the current list and adds its cards at the end.
   * Called by the observer when the sentinel nears the screen, and by "Try again".
   *
   * @returns {Promise<void>}
   */
  async function loadNextPage() {
    // Never two requests for the same list at once, and nothing to do after the last page.
    if (isLoading || !hasMore) {
      return;
    }
    isLoading = true;
    const requestListNumber = listNumber;
    showSentinelMessage('Loading more articles...');

    const result = await apiClient.get(buildFeedUrl());

    // A newer list was started while we waited (the reader changed the search or a filter):
    // this answer belongs to the old list, so it is dropped. The new list has its own request.
    if (requestListNumber !== listNumber) {
      return;
    }
    isLoading = false;

    if (!result.success) {
      // For example "Could not reach the server..." from apiClient, or a 400 message.
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
   * Starts the list again from page 1 with the current search, filters and sort. Any answer
   * still on its way for the old list will be ignored (listNumber changes).
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
    // Removes every card and message, keeping only the sentinel.
    feedList.replaceChildren(sentinel);
    loadNextPage();
  }

  /**
   * Called on every key press in the search box: waits until typing pauses.
   *
   * @returns {void}
   */
  function searchAfterTyping() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(reloadList, FEED_SEARCH_DELAY_MS);
  }

  /**
   * "Reset viewed marks": asks the server to forget which articles this browser opened.
   * The server finds the browser by its deviceId cookie; nothing is sent in the request.
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
    // Only a viewed filter shows the marks, so only then does the list change.
    if (viewedFilter.value !== '') {
      reloadList();
    }
  }

  // The observer calls loadNextPage whenever the sentinel comes within FEED_PRELOAD_MARGIN
  // of the visible part of the page.
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      loadNextPage();
    }
  }, { rootMargin: FEED_PRELOAD_MARGIN });

  searchInput.addEventListener('input', searchAfterTyping);
  categoryFilter.addEventListener('change', reloadList);
  viewedFilter.addEventListener('change', reloadList);
  sortSelect.addEventListener('change', reloadList);
  // Enter in the search box would submit the form and reload the page; search at once instead.
  filterForm.addEventListener('submit', (event) => {
    event.preventDefault();
    reloadList();
  });
  if (resetViewsButton && actionMessage) {
    resetViewsButton.addEventListener('click', resetViewedMarks);
  }

  // event.persisted is true when the browser shows this page from its memory after "Back".
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
