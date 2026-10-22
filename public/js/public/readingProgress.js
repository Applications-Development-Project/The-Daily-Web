/**
 * public/js/public/readingProgress.js
 *
 * Fills the thin bar at the top of the article page (#reading-progress) as the reader
 * scrolls through the article text: empty while the article's top is still on screen,
 * full when its end reaches the bottom of the screen. The comments below don't count.
 *
 * Loaded by: views/public/article.ejs. Styles: #reading-progress in public/css/main.css.
 * Owner: SH.
 */

/**
 * Keeps the bar in step with scrolling and resizing. Does nothing on a page without it.
 *
 * @returns {void}
 */
function setUpReadingProgress() {
  const progressBar = document.getElementById('reading-progress');
  const article = document.querySelector('.article-full');
  if (!progressBar || !article) {
    return;
  }

  /**
   * Sets the bar's width to the share of the article scrolled past, from 0 to 100%.
   *
   * @returns {void}
   */
  function updateProgress() {
    // getBoundingClientRect is relative to the screen, so it stays right whatever the
    // article sits inside (offsetTop is relative to the nearest positioned parent).
    const box = article.getBoundingClientRect();
    const scrolledPast = -box.top;
    const scrollableDistance = box.height - window.innerHeight;

    let progress = 100;
    if (scrollableDistance > 0) {
      progress = (scrolledPast / scrollableDistance) * 100;
    }
    progress = Math.max(0, Math.min(100, progress));
    progressBar.style.width = `${progress}%`;
  }

  // passive: we never call preventDefault(), so the browser can scroll without waiting for us.
  window.addEventListener('scroll', updateProgress, { passive: true });
  // A narrower window makes the article taller.
  window.addEventListener('resize', updateProgress);
  // Once now: a reload can open the page halfway down.
  updateProgress();
}

document.addEventListener('DOMContentLoaded', setUpReadingProgress);
