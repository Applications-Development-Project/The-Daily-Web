/**
 * public/js/editor/analytics.js
 *
 * Runs the Impact Analytics page (views/editor/analytics.ejs): the editor searches an
 * article by title, picks it, chooses a period, and sees a Chart.js line chart of its
 * views over time with a dashed vertical line at every publish. A button resets the
 * article's statistics. Nothing here reloads the page (Ajax with fetch, through apiClient.js).
 *
 * Requirements this serves: the editor sees an article's views over time with a clear mark
 * at each published update, so the views before and after can be compared; the statistics
 * can be reset; the page works without full reloads.
 *
 * How the chart is drawn, and why:
 * - The x-axis is a "linear" axis of millisecond timestamps, with labels formatted in a
 *   callback (formatAxisLabel). Chart.js's "time" axis would need an extra date-adapter
 *   package, and we only use the packages the course allows.
 * - The publish markers are drawn by our own small Chart.js plugin (publishMarkerPlugin,
 *   using the afterDraw hook): after Chart.js draws the line, the plugin draws one dashed
 *   vertical line and a number at each publish time, matching the numbered list below it.
 * - The x-axis labels are placed by us on whole hours or midnights (buildTimeTicks), not
 *   on the odd moments Chart.js would pick on a linear axis.
 * - Up to 30 days, the chart shows views per HOUR, as the server stores them. For longer
 *   periods the hours are added up into DAYS in the browser: 8,760 points on a screen a
 *   few hundred pixels wide can't be read, while 365 daily points can.
 *
 * Every text from the server is put on the page with textContent, never innerHTML, so a
 * title like "<script>..." is shown as text. Nothing here is a permission check: the APIs
 * answer 401/403 to anyone who isn't an editor, whatever this script does.
 *
 * The answers it reads are SM's own contracts: { articles: [...] } from listAllArticles in
 * controllers/editorController.js, and { buckets: [{ hourStart, views }], publishEvents:
 * [{ publishedAt }] } from getArticleViews in controllers/analyticsController.js.
 *
 * Loaded by: views/editor/analytics.ejs, after public/js/shared/apiClient.js and Chart.js.
 * Related: controllers/analyticsController.js, services/viewTracker.js.
 * Owner: SM.
 */

const ARTICLES_API_URL = '/api/editor/articles';

// The same search delay as the dashboard: one request when typing pauses, not one per key.
const SEARCH_DELAY_MS = 300;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Periods longer than this are shown per day instead of per hour (see the header).
const MAX_HOURLY_DAYS = 30;

/**
 * Reads a colour from main.css (for example --color-accent), so the chart uses the site's
 * colours. A canvas can't use CSS variables directly, so we read the computed value.
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
 * Formats a moment for people, for example "10 Oct 2026, 14:00", in the editor's own time
 * zone (the server sends exact moments in UTC). The same format as the dashboard.
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
 * Formats one label of the x-axis. Shorter than formatDateTime, because many labels share
 * the axis. The ticks sit on whole hours (24 hours) or on midnights (longer periods), see
 * buildTimeTicks, so the time or the date alone says everything.
 *
 * @param {number} milliseconds - The tick's value on the linear axis.
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
 * Chooses where the x-axis labels go. On a "linear" axis Chart.js picks round numbers of
 * MILLISECONDS, which as times are odd moments like "15 Sept 22:20". We place the ticks
 * ourselves instead: every 3 hours on the hour for 24 hours, and on local midnights for
 * longer periods, a few days apart so about 7 labels fit.
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
  // The smallest step from this list that gives at most about 7 labels.
  const stepDays = [1, 2, 5, 7, 14, 30, 61].find((days) => rangeDays / days <= 7) || 61;
  tick.setHours(24, 0, 0, 0);
  // setDate (not adding milliseconds) keeps the ticks on midnight across daylight saving changes.
  for (; tick.getTime() <= to; tick.setDate(tick.getDate() + stepDays)) {
    ticks.push({ value: tick.getTime() });
  }
  return ticks;
}

/**
 * Turns the server's hourly buckets into chart points { x: milliseconds, y: views }.
 * For a long period the hours are added up per day (the editor's local day), so the
 * chart stays readable; see the header.
 *
 * @param {{hourStart: string, views: number}[]} buckets - Oldest first, one per hour.
 * @param {boolean} perDay - true to add the hours up into days.
 * @returns {{x: number, y: number}[]} Oldest first.
 */
function toChartPoints(buckets, perDay) {
  if (!perDay) {
    return buckets.map((bucket) => ({ x: new Date(bucket.hourStart).getTime(), y: bucket.views }));
  }
  // A Map keeps the days in the order they were first added, which is oldest first.
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
 * Our own Chart.js plugin: after the chart is drawn, it draws a dashed vertical line and a
 * number at each publish time, so the editor sees the views before and after each update.
 * The numbers match the numbered list under the chart, which gives each publish's exact
 * time; a short number fits even when two publishes are close together, where a word
 * would overlap. If two numbers would still touch, the second is drawn one row lower.
 * Chart.js calls afterDraw on every redraw (for example when the window is resized), so
 * the markers always sit at the right place.
 *
 * The times come from the chart's options (options.plugins.publishMarkers.times), so the
 * same plugin object serves every chart.
 */
const publishMarkerPlugin = {
  id: 'publishMarkers',

  /**
   * @param {Object} chart - The Chart.js chart being drawn.
   * @param {Object} args - Unused (Chart.js passes it to every hook).
   * @param {{times: number[], colour: string}} options - Our plugin's options.
   * @returns {void}
   */
  afterDraw(chart, args, options) {
    const { ctx: context, chartArea, scales } = chart;
    // save() and restore(): the dash and colour we set must not leak into Chart.js's own drawing.
    context.save();
    context.strokeStyle = options.colour;
    context.fillStyle = options.colour;
    context.lineWidth = 2;
    context.setLineDash([6, 4]);
    context.font = 'bold 12px sans-serif';
    context.textAlign = 'left';
    context.textBaseline = 'top';

    // Where the last number ended and on which row it was, to move the next one down if needed.
    let lastLabelRight = -Infinity;
    let row = 0;
    options.times.forEach((publishTime, index) => {
      // getPixelForValue turns a time into its x position on the canvas.
      const x = scales.x.getPixelForValue(publishTime);
      // A publish outside the visible area is skipped (it can't be, but this keeps it safe).
      if (x < chartArea.left || x > chartArea.right) {
        return;
      }
      context.beginPath();
      context.moveTo(x, chartArea.top);
      context.lineTo(x, chartArea.bottom);
      context.stroke();

      const label = String(index + 1);
      const labelX = x + 3;
      // Three rows are enough: by the fourth close publish, the first row is free again.
      row = labelX < lastLabelRight ? (row + 1) % 3 : 0;
      context.fillText(label, labelX, chartArea.top + 2 + row * 14);
      lastLabelRight = labelX + context.measureText(label).width + 3;
    });

    context.restore();
  },
};

/**
 * Finds the page's elements and connects the search, the period, the chart and the reset
 * button. Does nothing on a page without the analytics panel.
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

  // The article on the chart now; null until the editor picks one.
  let chosenArticle = null;
  // The Chart.js chart, kept so it can be destroyed before drawing the next one
  // (two charts on one canvas would flicker between old and new data).
  let chart = null;
  let searchTimer = null;

  // Each request gets a number; an older answer arriving after a newer one is ignored, so
  // the page always shows the result of the editor's latest action (as on the dashboard).
  let latestSearchNumber = 0;
  let latestChartNumber = 0;

  /**
   * Shows a message, or hides the element when the text is empty.
   *
   * @param {HTMLElement} element - Where to show it.
   * @param {string} text - The message, or '' to hide it.
   * @param {string} className - 'loading', 'empty-state', 'form-error' or '' (main.css).
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
    // A never-published article has no views yet; we still let the editor open it, and
    // the chart then says so, instead of hiding it from the results.
    const liveText = article.isLive ? '' : ', not published yet';
    button.textContent = `${article.title} (${article.statusLabel}${liveText})`;
    button.addEventListener('click', function handleResultClick() {
      chooseArticle(article.id, article.title);
    });
    item.append(button);
    return item;
  }

  /**
   * Searches articles by title with the dashboard's list API and shows up to 20 results.
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
    // URLSearchParams encodes the text, so "C++ & AI" reaches the server unchanged.
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
   * Called on every key press in the search box: waits until typing pauses.
   *
   * @returns {void}
   */
  function searchAfterTyping() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(searchArticles, SEARCH_DELAY_MS);
  }

  /**
   * Enter in the search box would submit the form and reload the page; search now instead.
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
   * Puts an article on the chart. The address bar gets ?article=<id> (without reloading),
   * so refreshing the page or copying the link opens the same article again.
   *
   * @param {string} articleId - The article's id.
   * @param {string} articleTitle - Its title, for the heading.
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
   * Lists the publish times under the chart: the same information as the dashed lines,
   * readable as text (and by screen readers). It is a numbered list (ol), and item 1 is
   * the line numbered 1 on the chart.
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
   * Draws (or redraws) the chart. If Chart.js didn't load (for example no internet
   * connection to the CDN), the page still shows the numbers and the publish list.
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

    chart = new Chart(canvas, {
      type: 'line',
      data: {
        datasets: [{
          label: `Views per ${unitWord}`,
          data: points,
          borderColor: readCssColour('--color-accent', '#3498db'),
          borderWidth: 2,
          // No dot on every point: with hundreds of points the dots would hide the line.
          pointRadius: 0,
          pointHitRadius: 6,
        }],
      },
      options: {
        responsive: true,
        // Width divided by height. Chart.js's default (2) leaves a phone with a chart only
        // about 170px tall, so narrow screens get a taller shape.
        aspectRatio: canvas.parentElement.clientWidth < 600 ? 1.2 : 2,
        // No animation: redrawing hundreds of points on every period change is slow
        // and gains nothing for reading numbers.
        animation: false,
        // The points are already { x, y } numbers in order, so Chart.js can skip its parsing step.
        parsing: false,
        normalized: true,
        // The tooltip shows the point nearest to the mouse on the x-axis, without
        // having to hit the thin line exactly.
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        scales: {
          x: {
            type: 'linear',
            min: period.from,
            max: period.to,
            // Chart.js calls this after making its own ticks; we replace them (buildTimeTicks).
            afterBuildTicks: (scale) => {
              scale.ticks = buildTimeTicks(period.from, period.to, period.rangeDays);
            },
            ticks: {
              maxRotation: 0,
              // On a narrow screen Chart.js still hides labels that would overlap.
              autoSkip: true,
              callback: (value) => formatAxisLabel(value, period.rangeDays),
            },
          },
          y: {
            beginAtZero: true,
            // precision 0: views are whole numbers, so no "2.5 views" on the axis.
            ticks: { precision: 0 },
            title: { display: true, text: `Views per ${unitWord}` },
          },
        },
        plugins: {
          // One line only, and its name is on the y-axis, so the legend adds nothing.
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
   * Loads the chosen article's views for the chosen period and shows them: the summary in
   * words, the chart and the list of publish times.
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
    // Full ISO timestamps: a date alone would be read by the server as midnight UTC.
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

    // The chart is drawn even with no views: a flat line with the publish markers still
    // answers the editor's question ("did the update change anything?").
    showMessage(chartMessage, totalViews === 0 ? 'No views in this period.' : '', totalViews === 0 ? 'empty-state' : '');
    showPublishList(publishTimes);
    drawChart(toChartPoints(buckets, period.perDay), publishTimes, period);
  }

  /**
   * Asks the editor to confirm, then resets the chosen article's statistics and reloads
   * the chart (which then shows 0). The confirmation only protects against a slip of the
   * mouse; the server checks again that the user is an editor.
   *
   * @returns {Promise<void>}
   */
  async function resetStatistics() {
    if (!chosenArticle) {
      return;
    }
    const confirmed = window.confirm(
      `Reset the statistics of "${chosenArticle.title}"?\n\nEvery counted view will be deleted and its total set to 0. This can't be undone.`
    );
    if (!confirmed) {
      return;
    }

    // Disabled while waiting, so a double click can't send the request twice.
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

  // The review page links here with ?article=<id>; the server put that article's id and
  // title on the page, so its chart opens at once.
  if (page.dataset.initialArticleId) {
    chooseArticle(page.dataset.initialArticleId, page.dataset.initialArticleTitle);
  }
}

// The script is loaded at the end of <body>, but we still wait if the page is loading,
// so it works wherever the script tag is placed.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setUpAnalyticsPage);
} else {
  setUpAnalyticsPage();
}
