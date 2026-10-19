/**
 * public/js/public/readingProgress.js
 *
 * Fills the reading progress bar as the user scrolls through the article text.
 * Uses passive event listeners for high performance scrolling.
 * 
 * Owner: SH.
 */

document.addEventListener('DOMContentLoaded', () => {
    const progressBar = document.getElementById('reading-progress');
    const article = document.querySelector('.article-full');

    if (!progressBar || !article) {
        return;
    }

    function updateProgress() {
        // Calculate how far the article is from the top of the page
        const articleTop = article.offsetTop;
        const articleHeight = article.offsetHeight;
        const windowHeight = window.innerHeight;
        const scrollTop = window.scrollY || document.documentElement.scrollTop;

        // The total distance the user needs to scroll to finish the article
        const scrollableDistance = articleHeight - windowHeight;

        let progress = 0;

        if (scrollTop >= articleTop) {
            if (scrollableDistance > 0) {
                progress = ((scrollTop - articleTop) / scrollableDistance) * 100;
            } else {
                // If the article is shorter than the screen, it's 100% read instantly
                progress = 100;
            }
        }

        // Keep it strictly between 0 and 100
        progress = Math.max(0, Math.min(100, progress));
        progressBar.style.width = `${progress}%`;
    }

    // Passive: true tells the browser we won't call preventDefault(), making scrolling smoother
    window.addEventListener('scroll', updateProgress, { passive: true });
    
    // Call once on load in case the user refreshes halfway down the page
    updateProgress();
});