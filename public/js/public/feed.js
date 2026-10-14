/**
 * public/js/public/feed.js
 * 
 * Client-side logic for the news feed.
 * Handles infinite scrolling, search, filtering, and rendering articles safely.
 * Owner: SH.
 * 
 * Related files: controllers/feedController.js, views/public/feed.ejs
 */

document.addEventListener('DOMContentLoaded', () => {
    const feedList = document.getElementById('feed-list');
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');
    const viewedFilter = document.getElementById('viewed-filter');
    const sortSelect = document.getElementById('sort-select');
    const resetViewsBtn = document.getElementById('reset-views-btn'); // Item 8

    // Item 9: Check if the server already rendered initial articles
    const initialArticlesCount = feedList.querySelectorAll('article').length;
    
    // Defense Question - Architecture: Why start at page 2?
    // The server already rendered the first 20 articles in the HTML (SSR) for performance and SEO.
    // We start client-side pagination at page 2 to avoid fetching and rendering duplicate content on load.
    let currentPage = initialArticlesCount > 0 ? 2 : 1;
    let isLoading = false;
    let hasMore = true;

    // Create a sentinel element to detect when the user scrolls to the bottom
    const sentinel = document.createElement('div');
    sentinel.id = 'feed-sentinel';
    sentinel.style.textAlign = 'center';
    sentinel.style.padding = '1rem';
    sentinel.style.color = '#666';
    sentinel.textContent = initialArticlesCount > 0 ? 'Loading more articles...' : '';
    feedList.appendChild(sentinel);

    /**
     * Load articles from our API
     * @param {boolean} reset - If true, clears the feed and resets pagination to page 1.
     */
    async function loadArticles(reset = false) {
        // Defense Question - State Management: Why check isLoading?
        // "Never start a second request while one is running." 
        // This prevents race conditions and duplicating articles if the user scrolls aggressively.
        if (isLoading || (!hasMore && !reset)) return;
        
        isLoading = true;
        if (reset) {
            currentPage = 1;
            hasMore = true;
            feedList.innerHTML = ''; // Clear current feed for new filters
            feedList.appendChild(sentinel);
        }

        try {
            // Build query parameters based on filters
            const params = new URLSearchParams({
                page: currentPage,
                sort: sortSelect.value,
                category: categoryFilter.value,
                search: searchInput.value,
                viewed: viewedFilter.value
            });

            // Defense Question - Contracts: What is the expected response shape?
            // We depend on feedController returning { success: true, data: { articles, hasMore } }.
            const response = await fetch(`/api/articles?${params.toString()}`);
            const result = await response.json();

            if (result.success) {
                const articles = result.data.articles;
                hasMore = result.data.hasMore;
                
                if (articles.length === 0 && reset) {
                    sentinel.textContent = 'No articles found matching your criteria.';
                } else {
                    // Render the fetched articles
                    // Defense Question - Security: Why use createElement and textContent instead of innerHTML?
                    // If a reporter includes a malicious script tag in an article's summary or title, 
                    // setting it via innerHTML would execute the script (Cross-Site Scripting / XSS). 
                    // textContent treats everything strictly as safe text.
                    articles.forEach(article => {
                        const articleEl = document.createElement('article');
                        articleEl.className = 'card';
                        articleEl.style.marginBottom = 'var(--spacing-md)';
                        
                        // Category Badge
                        const badge = document.createElement('span');
                        badge.className = 'status-badge status-published';
                        badge.textContent = article.category || 'News';
                        articleEl.appendChild(badge);
                        
                        // Title and Link
                        const titleH3 = document.createElement('h3');
                        titleH3.style.margin = 'var(--spacing-sm) 0';
                        const linkEl = document.createElement('a');
                        linkEl.href = `/articles/${article.id}`;
                        linkEl.style.textDecoration = 'none';
                        linkEl.style.color = 'inherit';
                        linkEl.textContent = article.title; 
                        titleH3.appendChild(linkEl);
                        articleEl.appendChild(titleH3);
                        
                        // Meta info
                        const dateStr = new Date(article.publishedAt).toLocaleString('en-GB', {
                            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                        });
                        const metaP = document.createElement('p');
                        metaP.style.fontSize = '0.9rem';
                        metaP.style.color = '#666';
                        metaP.style.marginBottom = 'var(--spacing-sm)';
                        metaP.textContent = `By ${article.reporterName} | ${dateStr} | ${article.totalViews || 0} views`;
                        articleEl.appendChild(metaP);
                        
                        // Image (if available)
                        if (article.imageUrl) {
                            const img = document.createElement('img');
                            img.src = article.imageUrl;
                            img.alt = article.title;
                            img.style.width = '100%';
                            img.style.borderRadius = '8px';
                            img.style.marginBottom = 'var(--spacing-sm)';
                            articleEl.appendChild(img);
                        }

                        // Summary
                        const summaryP = document.createElement('p');
                        summaryP.textContent = article.summary; 
                        articleEl.appendChild(summaryP);
                        
                        // Insert before the sentinel
                        feedList.insertBefore(articleEl, sentinel);
                    });
                    
                    currentPage++;
                    sentinel.textContent = hasMore ? 'Loading more articles...' : 'No more articles to show.';
                }
            } else {
                console.error('Failed to load articles:', result.error);
                sentinel.textContent = 'Error loading articles.';
            }
        } catch (error) {
            console.error('Error fetching articles:', error);
            sentinel.textContent = 'Network error occurred.';
        } finally {
            isLoading = false;
        }
    }

    // Defense Question - Performance: Why IntersectionObserver instead of a scroll event listener?
    // Scroll events fire hundreds of times per second, blocking the main thread and causing lag.
    // IntersectionObserver runs highly optimized in the background by the browser, only waking up our JS 
    // when the sentinel element actually enters the viewport.
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            loadArticles();
        }
    }, { rootMargin: '100px' }); 

    // Add event listeners for filters (with debounce for the text search)
    let searchTimeout;
    searchInput.addEventListener('input', () => {
        // Defense Question - Performance: What is this 300ms delay and why?
        // This is a "debounce". Without it, typing "Israel" would fire 6 separate HTTP requests to our database.
        // By clearing and resetting the 300ms timer on every keystroke, we wait until the user pauses before searching.
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => loadArticles(true), 300);
    });

    categoryFilter.addEventListener('change', () => loadArticles(true));
    viewedFilter.addEventListener('change', () => loadArticles(true));
    sortSelect.addEventListener('change', () => loadArticles(true));

    // Item 8: Reset Viewed Marks
    // Edge case: If the user resets views, we fetch fresh data without a full page reload for better UX.
    if (resetViewsBtn) {
        resetViewsBtn.addEventListener('click', async () => {
            try {
                const response = await fetch('/api/articles/viewed', { method: 'DELETE' });
                if (response.ok) {
                    loadArticles(true); // Reload the list without reloading the page
                } else {
                    console.error('Failed to reset views');
                }
            } catch (err) {
                console.error('Network error resetting views:', err);
            }
        });
    }

    // Initialize Intersection Observer
    observer.observe(sentinel);
    
    // Trigger the first load ONLY if there are no server-rendered articles
    if (initialArticlesCount === 0) {
        loadArticles(true);
    }

    // Item 10: Weather Widget Logic (Reuse sidebar loadWeather)
    // Refresh every 5 minutes (300,000 milliseconds)
    setInterval(() => {
        if (typeof window.loadWeather === 'function') {
            window.loadWeather();
        }
    }, 5 * 60 * 1000);
});