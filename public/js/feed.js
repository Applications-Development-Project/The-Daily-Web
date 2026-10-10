/**
 * public/js/feed.js
 * 
 * Client-side logic for the news feed.
 * Handles infinite scrolling, search, filtering, and rendering articles.
 */

document.addEventListener('DOMContentLoaded', () => {
    const feedList = document.getElementById('feed-list');
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');
    const viewedFilter = document.getElementById('viewed-filter');
    const sortSelect = document.getElementById('sort-select');

    let currentPage = 1;
    let isLoading = false;
    let hasMore = true;

    // Create a sentinel element to detect when the user scrolls to the bottom
    const sentinel = document.createElement('div');
    sentinel.id = 'feed-sentinel';
    sentinel.style.textAlign = 'center';
    sentinel.style.padding = '1rem';
    sentinel.style.color = '#666';
    sentinel.textContent = 'Loading more articles...';

    // Load articles from our API
    async function loadArticles(reset = false) {
        if (isLoading || (!hasMore && !reset)) return;
        
        isLoading = true;
        if (reset) {
            currentPage = 1;
            hasMore = true;
            feedList.innerHTML = ''; // Clear current feed
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

            const response = await fetch(`/api/articles?${params.toString()}`);
            const result = await response.json();

            if (result.success) {
                const articles = result.data;
                
                if (articles.length === 0) {
                    hasMore = false;
                    if (reset) {
                        feedList.innerHTML = '<p class="empty-state">No articles found matching your criteria.</p>';
                    } else {
                        sentinel.textContent = 'No more articles to show.';
                        if (!feedList.contains(sentinel)) feedList.appendChild(sentinel);
                    }
                } else {
                    // Render the fetched articles
                    articles.forEach(article => {
                        const articleEl = document.createElement('article');
                        articleEl.className = 'card';
                        articleEl.style.marginBottom = 'var(--spacing-md)';
                        
                        // Format the date
                        const dateStr = new Date(article.publishedAt).toLocaleString('en-GB', {
                            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                        });
                        
                        articleEl.innerHTML = `
                            <span class="status-badge status-published">${article.category || 'News'}</span>
                            <h3 style="margin: var(--spacing-sm) 0;">
                                <a href="/article/${article._id}" style="text-decoration: none; color: inherit;">${article.title}</a>
                            </h3>
                            <p style="font-size: 0.9rem; color: #666; margin-bottom: var(--spacing-sm);">
                                By ${article.authorName} | ${dateStr} | ${article.views || 0} views
                            </p>
                            <p>${article.summary}</p>
                        `;
                        feedList.appendChild(articleEl);
                    });
                    
                    currentPage++;
                    sentinel.textContent = 'Loading more articles...';
                    feedList.appendChild(sentinel); // Move sentinel to the new bottom
                }
            } else {
                console.error('Failed to load articles:', result.error);
                if (reset) feedList.innerHTML = '<p class="empty-state form-error">Error loading articles.</p>';
            }
        } catch (error) {
            console.error('Error fetching articles:', error);
        } finally {
            isLoading = false;
        }
    }

    // Use Intersection Observer to trigger loadArticles when sentinel comes into view
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            loadArticles();
        }
    }, { rootMargin: '100px' }); // Trigger slightly before it enters the viewport

    // Add event listeners for filters (with debounce for the text search)
    let searchTimeout;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => loadArticles(true), 300);
    });

    categoryFilter.addEventListener('change', () => loadArticles(true));
    viewedFilter.addEventListener('change', () => loadArticles(true));
    sortSelect.addEventListener('change', () => loadArticles(true));

    // Initial setup
    feedList.innerHTML = '';
    feedList.appendChild(sentinel);
    observer.observe(sentinel);
    
    // Trigger the first load
    loadArticles(true);
});