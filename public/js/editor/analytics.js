/**
 * public/js/editor/analytics.js
 *
 * The Impact Analytics page: search an article, choose a period, and see a Chart.js line
 * of its views with a numbered dashed line at every publish; reset its statistics.
 * Nothing here reloads the page.
 *
 * The x-axis is a "linear" axis of timestamps (Chart.js's "time" axis needs an extra
 * package). Up to 30 days the chart shows views per hour; longer periods are added up
 * per day, because thousands of hourly points can't be read.
 *
 * Loaded by: views/editor/analytics.ejs, after public/js/shared/apiClient.js and Chart.js.
 * Owner: SM.
 */

const ARTICLES_API_URL = '/api/editor/articles';

// Wait this long after the last key before searching.
const SEARCH_DELAY_MS = 300;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Longer periods are shown per day instead of per hour.
const MAX_HOURLY_DAYS = 30;

/**
 * Reads a colour from main.css (a canvas can't use CSS variables directly).
 *
 * @param {string} variableName - For example '--color-accent'.
 * @param {string} fallback - Used if the stylesheet doesn't define it.
 * @returns {string} A CSS colour.
 */
function readCssColour(variableName, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  return value || fallback;
}

/**
 * Formats a moment, for example "10 Oct 2026, 14:00", in the editor's time zone.
 *
 * @param {number|string} moment - Milliseconds or an ISO date.
 * @returns {string}
 */
function formatDateTime(moment) {
  return new Date(moment).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Formats one x-axis label: the time for a 24-hour period, otherwise the date.
 *
 * @param {number} milliseconds - The tick's value on the axis.
 * @param {number} rangeDays - The chosen period in days.
 * @returns {string} For example "14:00" or "10 Oct".
 */
function formatAxisLabel(milliseconds, rangeDays) {
  const date = new Date(milliseconds);
  if (rangeDays <= 1) {
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * Places the x-axis labels on round times: every 3 hours for 24 hours, otherwise on
 * midnights a few days apart (about 7 labels). On its own, Chart.js would pick round
 * numbers of milliseconds, which are odd times like "22:20".
 *
 * @param {number} from - The axis start, in milliseconds.
 * @param {number} to - The axis end, in milliseconds.
 * @param {number} rangeDays - The chosen period in days.
 * @returns {{value: number}[]} The ticks, in the form Chart.js expects.
 */
function buildTimeTicks(from, to, rangeDays) {
  const ticks = [];
  const tick = new Date(from);
  if (rangeDays <= 1) {
    // The first whole hour divisible by 3 after "from".
    tick.setMinutes(0, 0, 0);
    do {
      tick.setHours(tick.getHours() + 1);
    } while (tick.getHours() % 3 !== 0);
    for (; tick.getTime() <= to; tick.setHours(tick.getHours() + 3)) {
      ticks.push({ value: tick.getTime() });
    }
    return ticks;
  }
  // The smallest step that gives at most about 7 labels.
  const stepDays = [1, 2, 5, 7, 14, 30, 61].find((days) => rangeDays / days <= 7) || 61;
  tick.setHours(24, 0, 0, 0);
  // setDate keeps the ticks on midnight across daylight saving changes.
  for (; tick.getTime() <= to; tick.setDate(tick.getDate() + stepDays)) {
    ticks.push({ value: tick.getTime() });
  }
  return ticks;
}

/**
 * Turns the server's hourly buckets into chart points { x: milliseconds, y: views },
 * adding the hours up per (local) day when perDay is true.
 *
 * @param {{hourStart: string, views: number}[]} buckets - Oldest first, one per hour.
 * @param {boolean} perDay - true to add the hours up into days.
 * @returns {{x: number, y: number}[]} Oldest first.
 */
function toChartPoints(buckets, perDay) {
  if (!perDay) {
    return buckets.map((bucket) => ({ x: new Date(bucket.hourStart).getTime(), y: bucket.views }));
  }
  // A Map keeps the days in the order they were added (oldest first).
  const viewsPerDay = new Map();
  buckets.forEach((bucket) => {
    const dayStart = new Date(bucket.hourStart);
    dayStart.setHours(0, 0, 0, 0);
    const key = dayStart.getTime();
    viewsPerDay.set(key, (viewsPerDay.get(key) || 0) + bucket.views);
  });
  return Array.from(viewsPerDay, ([dayStart, views]) => ({ x: dayStart, y: views }));
}

/**
 * Our own Chart.js plugin: after Chart.js draws the line (afterDraw), it draws a numbered
 * dashed line at each publish time. The numbers match the list under the chart. Numbers
 * that would touch are moved one row lower. The times come from
 * options.plugins.publishMarkers.times.
 */
const publishMarkerPlugin = {
  id: 'publishMarkers',

  /**
   * @param {Object} chart - The Chart.js chart being drawn.
   * @param {Object} args - Unused.
   * @param {{times: number[], colour: string}} options - Our plugin's options.
   * @returns {void}
   */
  afterDraw(chart, args, options) {
    const { ctx: context, chartArea, scales } = chart;
    // save() and restore(): our dash and colour must not leak into Chart.js's drawing.
    context.save();
    context.strokeStyle = options.colour;
    context.fillStyle = options.colour;
    context.lineWidth = 2;
    context.setLineDash([6, 4]);
    context.font = 'bold 12px sans-serif';
    context.textAlign = 'left';
    context.textBaseline = 'top';

    let lastLabelRight = -Infinity;
    let row = 0;
    options.times.forEach((publishTime, index) => {
      // getPixelForValue turns a time into its x position on the canvas.
      const x = scales.x.getPixelForValue(publishTime);
      if (x < chartArea.left || x > chartArea.right) {
        return;
      }
      context.beginPath();
      context.moveTo(x, chartArea.top);
      context.lineTo(x, chartArea.bottom);
      context.stroke();

      const label = String(index + 1);
      const labelX = x + 3;
      row = labelX < lastLabelRight ? (row + 1) % 3 : 0;
      context.fillText(label, labelX, chartArea.top + 2 + row * 14);
      lastLabelRight = labelX + context.measureText(label).width + 3;
    });

    context.restore();
  },
};

/**
 * Connects the search, the period, the chart and the reset button. Does nothing on a
 * page without the analytics panel.
 *
 * @returns {void}
 */
function setUpAnalyticsPage() {
  const page = document.getElementById('analytics-page');
  if (!page) {
    return;
  }
  const pickerForm = document.getElementById('article-picker');
  const searchInput = document.getElementById('article-search');
  const resultsList = document.getElementById('article-results');
  const resultsMessage = document.getElementById('article-results-message');
  const panel = document.getElementById('analytics-panel');
  const articleHeading = document.getElementById('chart-article-title');
  const rangeSelect = document.getElementById('range-select');
  const summary = document.getElementById('chart-summary');
  const chartMessage = document.getElementById('chart-message');
  const canvas = document.getElementById('views-chart');
  const publishList = document.getElementById('publish-list');
  const publishEmpty = document.getElementById('publish-empty');
  const resetButton = document.getElementById('reset-views');
  const resetMessage = document.getElementById('reset-message');

  let chosenArticle = null;
  // Kept so it can be destroyed before the next chart is drawn on the same canvas.
  let chart = null;
  let searchTimer = null;

  // Late answers to older requests are ignored, as on the dashboard.
  let latestSearchNumber = 0;
  let latestChartNumber = 0;

  /**
   * Shows a message, or hides the element when the text is empty.
   *
   * @param {HTMLElement} element - Where to show it.
   * @param {string} text - The message, or '' to hide it.
   * @param {string} className - 'loading', 'empty-state', 'form-error' or ''.
   * @returns {void}
   */
  function showMessage(element, text, className) {
    element.textContent = text;
    element.className = className;
    element.hidden = text === '';
  }

  /**
   * Shows that the session ended, with a link to log in again.
   *
   * @param {HTMLElement} element - Where to show it.
   * @returns {void}
   */
  function showLoggedOutMessage(element) {
    showMessage(element, 'Your session has ended. ', 'form-error');
    const loginLink = document.createElement('a');
    loginLink.href = '/login';
    loginLink.textContent = 'Log in again';
    element.append(loginLink);
  }

  /**
   * Builds one search result: a button with the title, the status and whether it is live.
   *
   * @param {{id: string, title: string, statusLabel: string, isLive: boolean}} article
   * @returns {HTMLLIElement}
   */
  function createResultItem(article) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    const liveText = article.isLive ? '' : ', not published yet';
    button.textContent = `${article.title} (${article.statusLabel}${liveText})`;
    button.addEventListener('click', function handleResultClick() {
      chooseArticle(article.id, article.title);
    });
    item.append(button);
    return item;
  }

  /**
   * Searches articles by title with the dashboard's list API (up to 20 results).
   *
   * @returns {Promise<void>}
   */
  async function searchArticles() {
    const searchText = searchInput.value.trim();
    latestSearchNumber += 1;
    const searchNumber = latestSearchNumber;

    if (searchText === '') {
      resultsList.replaceChildren();
      showMessage(resultsMessage, '', '');
      return;
    }

    showMessage(resultsMessage, 'Searching...', 'loading');
    const query = new URLSearchParams({ search: searchText });
    const result = await apiClient.get(`${ARTICLES_API_URL}?${query.toString()}`);
    if (searchNumber !== latestSearchNumber) {
      return;
    }

    if (!result.success) {
      resultsList.replaceChildren();
      if (result.status === 401) {
        showLoggedOutMessage(resultsMessage);
      } else {
        showMessage(resultsMessage, result.error, 'form-error');
      }
      return;
    }

    const { articles, totalArticles } = result.data;
    resultsList.replaceChildren(...articles.map(createResultItem));
    if (articles.length === 0) {
      showMessage(resultsMessage, 'No article has this in its title.', 'empty-state');
    } else if (totalArticles > articles.length) {
      showMessage(resultsMessage, `Showing ${articles.length} of ${totalArticles} matches. Type more of the title to narrow it down.`, '');
    } else {
      showMessage(resultsMessage, '', '');
    }
  }

  /**
   * On every key press: waits until typing pauses, then searches.
   *
   * @returns {void}
   */
  function searchAfterTyping() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(searchArticles, SEARCH_DELAY_MS);
  }

  /**
   * Enter in the search box: search now instead of submitting the form.
   *
   * @param {SubmitEvent} event - The form's submit event.
   * @returns {void}
   */
  function searchNow(event) {
    event.preventDefault();
    clearTimeout(searchTimer);
    searchArticles();
  }

  /**
   * Puts an article on the chart and writes ?article=<id> in the address bar (without
   * reloading), so a refresh or a copied link opens the same article.
   *
   * @param {string} articleId
   * @param {string} articleTitle - For the heading.
   * @returns {void}
   */
  function chooseArticle(articleId, articleTitle) {
    chosenArticle = { id: articleId, title: articleTitle };
    articleHeading.textContent = articleTitle;
    panel.hidden = false;
    showMessage(resetMessage, '', '');
    history.replaceState(null, '', `?article=${encodeURIComponent(articleId)}`);
    loadChart();
  }

  /**
   * Lists the publish times under the chart (numbered like the dashed lines), readable as
   * text and by screen readers.
   *
   * @param {number[]} publishTimes - Milliseconds, oldest first.
   * @returns {void}
   */
  function showPublishList(publishTimes) {
    publishList.hidden = publishTimes.length === 0;
    publishEmpty.hidden = publishTimes.length !== 0;
    publishList.replaceChildren(...publishTimes.map((publishTime) => {
      const item = document.createElement('li');
      const time = document.createElement('time');
      time.dateTime = new Date(publishTime).toISOString();
      time.textContent = formatDateTime(publishTime);
      item.append(time);
      return item;
    }));
  }

  /**
   * Draws (or redraws) the chart. If Chart.js didn't load (no internet to the CDN), the
   * summary and the publish list still show the numbers.
   *
   * @param {{x: number, y: number}[]} points - The chart's points.
   * @param {number[]} publishTimes - Where to draw the dashed lines.
   * @param {{from: number, to: number, rangeDays: number, perDay: boolean}} period
   * @returns {void}
   */
  function drawChart(points, publishTimes, period) {
    if (typeof Chart === 'undefined') {
      showMessage(chartMessage, 'The chart could not be loaded (the chart library is not available). The numbers above are still correct.', 'form-error');
      return;
    }
    if (chart) {
      chart.destroy();
    }
    const unitWord = period.perDay ? 'day' : 'hour';
    // Chart.js's own grey text and grid are made for a white page: in the dark theme the
    // grid disappears. These tokens have a light and a dark value in main.css.
    const axisTextColour = readCssColour('--color-muted', '#6b5f57');
    const gridColour = readCssColour('--color-border', '#ece3d8');

    chart = new Chart(canvas, {
      type: 'line',
      data: {
        datasets: [{
          label: `Views per ${unitWord}`,
          data: points,
          borderColor: readCssColour('--color-accent', '#3498db'),
          borderWidth: 2,
          // No dots: with hundreds of points they would hide the line.
          pointRadius: 0,
          pointHitRadius: 6,
        }],
      },
      options: {
        responsive: true,
        // A taller shape on phones (the default 2 would leave a chart about 170px tall).
        aspectRatio: canvas.parentElement.clientWidth < 600 ? 1.2 : 2,
        animation: false,
        // The points are already { x, y } numbers in order, so Chart.js can skip parsing.
        parsing: false,
        normalized: true,
        // The tooltip shows the point nearest the mouse, without hitting the thin line exactly.
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        scales: {
          x: {
            type: 'linear',
            min: period.from,
            max: period.to,
            // Replaces Chart.js's own ticks with ours (buildTimeTicks).
            afterBuildTicks: (scale) => {
              scale.ticks = buildTimeTicks(period.from, period.to, period.rangeDays);
            },
            ticks: {
              maxRotation: 0,
              autoSkip: true,
              color: axisTextColour,
              callback: (value) => formatAxisLabel(value, period.rangeDays),
            },
            grid: { color: gridColour },
            border: { color: gridColour },
          },
          y: {
            beginAtZero: true,
            // Whole numbers only: no "2.5 views".
            ticks: { precision: 0, color: axisTextColour },
            grid: { color: gridColour },
            border: { color: gridColour },
            title: { display: true, text: `Views per ${unitWord}`, color: axisTextColour },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => (period.perDay
                ? new Date(items[0].parsed.x).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                : formatDateTime(items[0].parsed.x)),
              label: (item) => `${item.parsed.y} ${item.parsed.y === 1 ? 'view' : 'views'}`,
            },
          },
          publishMarkers: { times: publishTimes, colour: readCssColour('--color-danger', '#e74c3c') },
        },
      },
      plugins: [publishMarkerPlugin],
    });
  }

  /**
   * Loads the chosen article's views for the chosen period and shows the summary, the
   * chart and the publish list.
   *
   * @returns {Promise<void>}
   */
  async function loadChart() {
    if (!chosenArticle) {
      return;
    }
    latestChartNumber += 1;
    const chartNumber = latestChartNumber;

    const rangeDays = Number(rangeSelect.value);
    const to = Date.now();
    const from = to - rangeDays * DAY_MS;
    const period = { from, to, rangeDays, perDay: rangeDays > MAX_HOURLY_DAYS };
    const periodLabel = rangeSelect.options[rangeSelect.selectedIndex].textContent.toLowerCase();

    showMessage(chartMessage, 'Loading the chart...', 'loading');
    // Full ISO timestamps: a date alone would be read as midnight UTC.
    const query = new URLSearchParams({ from: new Date(from).toISOString(), to: new Date(to).toISOString() });
    const result = await apiClient.get(`${ARTICLES_API_URL}/${encodeURIComponent(chosenArticle.id)}/views?${query.toString()}`);
    if (chartNumber !== latestChartNumber) {
      return;
    }

    if (!result.success) {
      summary.textContent = '';
      if (result.status === 401) {
        showLoggedOutMessage(chartMessage);
      } else if (result.status === 404) {
        showMessage(chartMessage, 'This article no longer exists (it may have been deleted). Search for another one.', 'form-error');
      } else {
        showMessage(chartMessage, result.error, 'form-error');
      }
      return;
    }

    const { buckets, publishEvents } = result.data;
    const totalViews = buckets.reduce((sum, bucket) => sum + bucket.views, 0);
    const publishTimes = publishEvents.map((publishEvent) => new Date(publishEvent.publishedAt).getTime());

    const viewWord = totalViews === 1 ? 'view' : 'views';
    const publishWord = publishTimes.length === 1 ? 'time' : 'times';
    const summaryText = `${totalViews.toLocaleString('en-GB')} ${viewWord} in the ${periodLabel}; published ${publishTimes.length} ${publishWord} in this period.`;
    summary.textContent = summaryText;
    canvas.setAttribute('aria-label', `Chart of views over time for "${chosenArticle.title}": ${summaryText}`);

    // Drawn even with no views: the flat line and the markers still answer the question.
    showMessage(chartMessage, totalViews === 0 ? 'No views in this period.' : '', totalViews === 0 ? 'empty-state' : '');
    showPublishList(publishTimes);
    drawChart(toChartPoints(buckets, period.perDay), publishTimes, period);
  }

  /**
   * Asks for confirmation, resets the chosen article's statistics and reloads the chart.
   *
   * @returns {Promise<void>}
   */
  async function resetStatistics() {
    if (!chosenArticle) {
      return;
    }
    const confirmed = await showConfirmDialog(
      `Reset the statistics of "${chosenArticle.title}"?\n\nEvery counted view will be deleted and its total set to 0. This can't be undone.`,
      'Reset',
      true
    );
    if (!confirmed) {
      return;
    }

    // Disabled while waiting, against double clicks.
    resetButton.disabled = true;
    const result = await apiClient.delete(`${ARTICLES_API_URL}/${encodeURIComponent(chosenArticle.id)}/views`);
    resetButton.disabled = false;

    if (result.status === 401) {
      showLoggedOutMessage(resetMessage);
      return;
    }
    if (!result.success) {
      showMessage(resetMessage, result.error, 'form-error');
      return;
    }
    const counterCount = result.data.deletedViewStats;
    const counterWord = counterCount === 1 ? 'counter' : 'counters';
    showMessage(resetMessage, `Statistics reset (${counterCount} hourly ${counterWord} deleted).`, '');
    loadChart();
  }

  searchInput.addEventListener('input', searchAfterTyping);
  pickerForm.addEventListener('submit', searchNow);
  rangeSelect.addEventListener('change', loadChart);
  resetButton.addEventListener('click', resetStatistics);

  // Opened from the review page's link: the server put the article on the page.
  if (page.dataset.initialArticleId) {
    chooseArticle(page.dataset.initialArticleId, page.dataset.initialArticleTitle);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setUpAnalyticsPage);
} else {
  setUpAnalyticsPage();
}
