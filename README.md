# The Daily Web

A news site where reporters write articles, an editor reviews and publishes them, and guests read
and comment. Built with Node.js, Express, EJS and MongoDB (Mongoose) in the MVC pattern, with plain
JavaScript and Ajax in the browser.

New to the code? Read the [guide to the code](docs/PROJECT_GUIDE.md): what each folder and kind of file is
for, the naming conventions, and how to follow a request from the browser to the database and back.

<!--
  Shared file: every student adds or corrects the part about their own area in a small pull request.
-->

## Contents

- [Main features](#main-features)
- [Where each requirement lives](#where-each-requirement-lives)
- [Technologies](#technologies)
- [Install and run](#install-and-run)
- [Demo users](#demo-users)
- [Folder structure](#folder-structure)
- [How a request flows](#how-a-request-flows)
- [Design decisions](#design-decisions)
- [Pages and API](#pages-and-api)
- [Self-check scripts](#self-check-scripts)
- [Team](#team)

## Main features

### Guests (no login)
- **Feed** of live articles, 20 at a time with infinite scroll, with search (title and summary),
  a category filter, a "viewed / not viewed" filter for this browser, and sorting by newest or
  most popular. Nothing reloads the page.
- **Article page** with the full text, rendered on the server (so search engines see it), and
  guest comments. A new comment appears at once without reloading the list. A guest can post at most
  3 comments per minute from the same device; the server blocks the fourth with a clear message.
- **Weather widget** in the sidebar (Open-Meteo, a free service that needs no API key). What a reader sees
  is never more than 15 minutes old.

### Reporters
- A **dashboard** with only their own articles and the status of each one, and the editor's note
  on a returned article.
- An **article editor** that **autosaves** the draft while they type (no Save button), keeps working
  after a refresh, a closed browser or on another computer, and a **Submit for approval** button.
- They can update an article that is already live: readers keep seeing the approved version until the
  editor approves the new one.

### Editor
- A **dashboard** with every article, a status filter, title search and pages of 20, without page reloads.
- A **review page**: the live version and the submitted changes side by side, with the changed fields
  marked, the publish history, and **Approve and publish** or **Return for corrections** (with a required note).
- **Edit any article**: a submitted or in-progress version keeps its status; editing a live article with no
  update in progress publishes the correction at once (the editor is the approver), with a chart marker.
- **Delete** an article together with its comments and statistics.
- **Comment moderation**: search, edit and delete comments.
- **User management**: search, create, edit and delete reporters and editors, with safety rules
  (no deleting yourself, never zero editors, no deleting a reporter who has articles).
- **Impact Analytics**: find an article by title, choose a period (24 hours up to 365 days), and see its
  views on a line chart with a numbered dashed line at every publish, so the views before and after each
  update can be compared. The editor can also reset an article's statistics.

### Article statuses

| Status | Meaning |
|---|---|
| In preparation (`draft`) | The reporter is writing |
| Awaiting editor approval (`pending`) | Submitted; only the editor can act on it |
| Published (`published`) | Approved and visible to readers |
| Returned for corrections (`returned`) | Sent back by the editor with a note |

The status describes the article's **working copy**. What readers see is a separate, approved copy, so a live
article stays online, unchanged, while its next version is written and reviewed.

## Where each requirement lives

Each row is one requirement from the project document, and the files that implement it, in the order a
request goes through them (route → middleware → controller → service / model → view → browser script).
Route files are in `routes/pageRoutes/` (pages) and `routes/apiRoutes/` (JSON), named after the area.

| Requirement | Server side | Page and browser script |
|---|---|---|
| Feed: only published articles, 20 per page, infinite scroll | `controllers/feedController.js` (`listFeedArticles`, `showFeedPage`) | `views/public/feed.ejs`, `public/js/public/feed.js` |
| Search, category and viewed filters, sort by date or popularity, without reload | `controllers/feedController.js` (`readFeedQuery`, `buildFeedFilter`), `models/DeviceArticleView.js` | `public/js/public/feed.js` |
| Full article page, readable by search engines | `controllers/articlePageController.js` | `views/public/article.ejs` |
| Every visit counts for the statistics | `services/viewTracker.js` (`recordView`), `models/ArticleViewStats.js` | |
| Comments: list and add without reloading the list | `controllers/commentController.js` (`listArticleComments`, `addComment`), `models/Comment.js` | `public/js/public/articleComments.js` |
| A guest may post at most 3 comments a minute per device | `middleware/commentRateLimiter.js`, `middleware/assignDeviceId.js` | |
| Login for reporters and editors; each goes to their own area | `controllers/authController.js`, `config/session.js` | `views/public/login.ejs`, `public/js/public/login.js` |
| Permissions from the logged-in user, checked on the server | `middleware/requireLogin.js`, `middleware/requireRole.js`, `middleware/setCurrentUser.js` | |
| Passwords never stored in plain text | `models/User.js`, `controllers/userController.js` (bcrypt) | |
| Still logged in after a server restart | `config/session.js` (sessions stored in MongoDB) | |
| Reporter: own articles and their status, create, edit, submit, see the editor's note, resubmit | `controllers/reporterController.js` | `views/reporter/dashboard.ejs`, `public/js/reporter/dashboard.js` |
| Status transitions; every other transition refused | `services/articleWorkflow.js` (`canTransition`) | |
| Work saved continuously, never lost (refresh, closed browser, another computer) | `controllers/reporterController.js` (`autosaveDraft`, `showArticleEditor`), `services/draftValidation.js` | `views/reporter/articleEditor.ejs`, `public/js/reporter/articleEditor.js` |
| Editing a live article: readers keep the approved version until approval | `models/Article.js` (`draft` / `published`), `controllers/editorController.js` (`approveArticle`) | |
| Editor: all articles, filter by status | `controllers/editorController.js` (`listAllArticles`) | `views/editor/dashboard.ejs`, `public/js/editor/dashboard.js` |
| Editor: view, edit, approve, return with a note, delete | `controllers/editorController.js` | `views/editor/articleReview.ejs`, `public/js/editor/articleReview.js` |
| Editor sees what is live and what awaits approval | `controllers/editorController.js` (`toReviewView`, `findChangedFields`) | `views/editor/partials/articleContent.ejs` |
| Impact Analytics chart with publish markers | `controllers/analyticsController.js`, `services/viewTracker.js` (`getViewsOverTime`) | `views/editor/analytics.ejs`, `public/js/editor/analytics.js` |
| Statistics that scale to thousands of readers | `models/ArticleViewStats.js` (one counter per article per hour) | |
| Full CRUD on every model, search on a main field | See [CRUD coverage](#crud-coverage) | |
| Errors and invalid data never crash the server | `middleware/errorHandler.js`, `utils/requestValidation.js`, `utils/httpErrors.js` | `views/public/error.ejs` |
| Logs of errors and important events | `services/logger.js` (`logs/app.log`, `logs/error.log`) | |
| Weather widget from an external service, at most 15 minutes old | `services/weatherService.js`, `controllers/weatherController.js` | `views/partials/sidebar.ejs`, `public/js/public/weatherWidget.js` |
| Semantic HTML5, responsive layout (computer, tablet, phone) | | `views/partials/*.ejs`, `public/css/main.css` |
| Demo data: 500+ articles, several reporters, comments, updates, view history | `scripts/seed.js` | |

### CRUD coverage

| Model | Create | Read, list and search | Update | Delete |
|---|---|---|---|---|
| `User` | User management (`POST /api/users`) | `GET /api/users?search=` | `PATCH /api/users/:id` | `DELETE /api/users/:id` |
| `Article` | Reporter creates (`POST /api/reporter/articles`) | Feed search, editor dashboard search, reporter dashboard | Autosave, editor's edit, approve | Editor delete |
| `Comment` | Article page (`POST /api/articles/:id/comments`) | Article page, moderation search (`GET /api/comments?search=`) | Moderation (`PATCH /api/comments/:id`) | Moderation, and with its article |
| `ArticleViewStats` | `recordView` (upsert) | Views API with a date range, the chart | `recordView` (`$inc`) | Reset statistics, and with its article |
| `DeviceArticleView` | `recordView` (upsert) | The feed's viewed / not-viewed filter | `recordView` (upsert refreshes it) | "Reset viewed marks", and with its article |

## Technologies

- **Server:** Node.js (20.6 or newer), Express 5, EJS templates, MongoDB with Mongoose.
- **Browser:** HTML5, CSS3 with Flexbox, and plain JavaScript (`fetch` for the Ajax calls). No front-end framework.
  Chart.js (4.5.1) draws the Impact Analytics chart; it is loaded from the cdnjs CDN on that page only
  (with an integrity hash), so that page needs an internet connection to show the chart.
- **Packages:** only those in `package.json`, all approved by the lecturer: `express`, `ejs`, `mongoose`,
  `express-session`, `connect-mongo` (sessions are stored in MongoDB, so they survive a server restart),
  `bcrypt` (password hashing) and `dotenv` (reads `.env`).

## Install and run

You need **Node.js 20.6 or newer** and **MongoDB** running on your computer
(the default address is `mongodb://127.0.0.1:27017`).

1. **Get the code and install the packages**
   ```
   git clone https://github.com/Applications-Development-Project/The-Daily-Web.git
   cd The-Daily-Web
   npm install
   ```
   Newer versions of npm may warn that `bcrypt`'s install script was not run. That is expected and safe:
   `bcrypt` ships ready-built files for Windows, Mac and Linux, so it works without the script.

2. **Create your `.env` file** from the template, then fill in the values:
   ```
   copy .env.example .env      (Windows)
   cp .env.example .env        (Mac / Linux)
   ```

   | Variable | What to put |
   |---|---|
   | `MONGODB_URI` | `mongodb://127.0.0.1:27017/the-web-daily` |
   | `SESSION_SECRET` | A long random text. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
   | `PORT` | Optional. Empty means 3000 |
   | `WEATHER_CITY`, `WEATHER_LATITUDE`, `WEATHER_LONGITUDE` | Optional: the city shown in the weather widget and its coordinates. Empty means Tel Aviv. The weather comes from Open-Meteo, which needs no API key |
   | `SEED_DEMO_PASSWORD` | The password every demo user will get (choose any) |

   `.env` holds secrets, so it is in `.gitignore` and never committed. Only `.env.example`, with empty values, is in the repository.

3. **Fill the database with demo data**
   ```
   npm run seed
   ```
   **Warning:** this first deletes everything in the database named in `MONGODB_URI`. It creates the demo
   users, 510 articles in every status and category (some updated several times after publishing), about
   1,400 guest comments, and 30 days of hourly view statistics. It takes a few seconds. The statistics are
   relative to the moment you run it, so run it again shortly before a demo.

4. **Start the server**
   ```
   npm start
   ```
   Then open <http://localhost:3000>. While developing, `npm run dev` restarts the server whenever a file changes.

Logs are written to the terminal and to `logs/app.log` and `logs/error.log` (not committed).

## Demo users

`npm run seed` creates these users. Their password is the `SEED_DEMO_PASSWORD` you chose in `.env`;
no password is written anywhere in the repository.

| Username | Role | Name |
|---|---|---|
| `editor` | Editor | Maya Cohen |
| `reporter1` | Reporter | Dana Levi |
| `reporter2` | Reporter | Omer Ben-David |
| `reporter3` | Reporter | Noa Friedman |
| `reporter4` | Reporter | Yossi Mizrahi |
| `reporter5` | Reporter | Tamar Avraham |

Log in at <http://localhost:3000/login>. A guest needs no login.

## Folder structure

The folders follow MVC: **models** (the data), **views** (the pages), **controllers** (handle a request).
The browser code and the views are split by the same three areas: `public` (guests), `reporter` and
`editor`, so the script of `views/<area>/<page>.ejs` is `public/js/<area>/<page>.js`.

```
The-Daily-Web/
├── server.js                 Loads .env, connects to MongoDB, then starts the server
├── app.js                    The Express app: middleware, routers, 404 and error handling, in that order
├── config/
│   ├── database.js           Connect to / disconnect from MongoDB
│   └── session.js            Login sessions stored in MongoDB (survive a restart)
├── models/                   Mongoose schemas and indexes
│   ├── User.js               Reporters and editors (bcrypt hash only)
│   ├── Article.js            Two copies of the content: draft (worked on) and published (what readers see)
│   ├── Comment.js            Guest comments (with the device id for the comment limit)
│   ├── ArticleViewStats.js   One view counter per article per hour
│   └── DeviceArticleView.js  Which browser has opened which article (viewed filter)
├── routes/
│   ├── pageRoutes/           <area>PageRoutes.js: URLs that render EJS pages, mounted at "/"
│   └── apiRoutes/            <area>ApiRoutes.js: JSON URLs used by the browser scripts, mounted at "/api"
├── controllers/              One file per area: read the request, use models and services, send a page or JSON
│   ├── feedController.js           Feed page and feed API (public)
│   ├── articlePageController.js    Full article page (public)
│   ├── weatherController.js        Weather API (public)
│   ├── commentController.js        Comments on articles and comment moderation
│   ├── authController.js           Login and logout
│   ├── userController.js           User management
│   ├── reporterController.js       Reporter dashboard, editor page, autosave, submit
│   ├── editorController.js         Editor dashboard, review, edit, approve, return, delete
│   └── analyticsController.js      Impact Analytics page, views API, reset statistics
├── middleware/               Runs before the controllers
│   ├── assignDeviceId.js     A long-lived id cookie for every browser (guests too)
│   ├── setCurrentUser.js     Refreshes the session user from the database; currentUser for the views
│   ├── requireLogin.js       Only logged-in users (401 JSON or redirect to /login)
│   ├── requireRole.js        Only one role (403)
│   ├── commentRateLimiter.js 3 comments per minute per guest device (429)
│   ├── notFoundHandler.js    No route matched: a 404 error
│   └── errorHandler.js       Every error ends here: a status, a log line, JSON or the error page
├── services/                 Business rules shared by controllers
│   ├── articleWorkflow.js    Status names, labels and canTransition() (the transition table)
│   ├── draftValidation.js    The rules for an article's content (reporter and editor share them)
│   ├── viewTracker.js        recordView() and the chart data
│   ├── weatherService.js     Open-Meteo weather with a shared in-memory copy
│   └── logger.js             Console, logs/app.log and logs/error.log
├── utils/                    Small helpers every controller uses
│   ├── httpErrors.js         createHttpError(status, message)
│   ├── requestValidation.js  Id check, regex escaping, ?search= and ?page= readers
│   └── isApiRequest.js       Is this an /api request? (JSON or page answer)
├── views/
│   ├── partials/             head, header (login state and logout), footer, sidebar (weather)
│   ├── public/               feed, article, login, error
│   ├── reporter/             dashboard, articleEditor
│   └── editor/               dashboard, articleReview, analytics, users, comments, partials/ (nav, article content)
├── public/                   Served as static files
│   ├── css/main.css          The one stylesheet
│   ├── images/               placeholder.svg (shown when an article image can't load)
│   └── js/
│       ├── shared/apiClient.js   fetch() wrapper every page script uses: always { success, data, error, status }
│       ├── public/               feed.js, articleComments.js, weatherWidget.js, login.js
│       ├── reporter/             dashboard.js, articleEditor.js (autosave)
│       └── editor/               dashboard.js, articleReview.js, analytics.js (chart), users.js, comments.js
├── scripts/seed.js           Demo data (npm run seed)
├── tests/                    Self-check scripts (see below)
├── docs/PROJECT_GUIDE.md     A guide to navigating the code
├── CONVENTIONS.md            The team's code conventions
└── .env.example              Template for your own .env
```

## How a request flows

`app.js` runs middleware in the order it is written, for every request:

1. **Body parsers** (`express.json`, `express.urlencoded`), so `req.body` exists.
2. **Static files** from `public/` (CSS, scripts, images), answered before any session work.
3. **Session** (`config/session.js`): `req.session.user = { id, role, displayName }` after login.
4. **Device id** (`assignDeviceId`): `req.deviceId` for every browser, guests included.
5. **Current user** (`setCurrentUser`): reloads the role from the database; `currentUser` for every view.
6. **Routers**: page routers at `/`, API routers at `/api`. Protected routes run `requireLogin` /
   `requireRole` first, then the controller.
7. **404** (`notFoundHandler`), then **`errorHandler`** last, which answers every error: JSON
   `{ success: false, error }` for `/api/...`, the error page otherwise.

Every JSON answer is `{ success: true, data }` or `{ success: false, error: "<message a user can read>" }`.
Controllers report a problem with `throw createHttpError(404, 'Article not found.')`; with Express 5 an error
thrown in an async controller reaches `errorHandler` without any try/catch.

## Design decisions

The questions we expect, and where the answer is written in the code.

- **Two copies of each article (`draft` and `published`).** Reporters and the editor only edit `draft`; the
  public site only reads `published`; approving copies one into the other. That is how a live article stays
  unchanged while its update is written and reviewed. "Live" means `published` is not null, whatever the
  status. (`models/Article.js`, `controllers/editorController.js`)
- **`published` → `draft` in the transition table.** The requirements list four transitions but also require
  that an edited live article goes through approval again while readers keep the old version. `status`
  describes the working copy, so starting to edit a live article makes the new version "In preparation".
  (`services/articleWorkflow.js`)
- **Hourly view counters.** One small document per article per hour, increased with an atomic
  `$inc` + `upsert`, instead of one document per view: thousands of readers create at most 24 documents per
  article per day, simultaneous views are never lost, and a 30-day chart reads at most 720 documents.
  `Article.totalViews` keeps a running total for the popularity sort. (`models/ArticleViewStats.js`,
  `services/viewTracker.js`)
- **Sessions in MongoDB, a separate device cookie.** The session (only after login) survives a server restart;
  the `httpOnly` device id identifies a guest's browser for the comment limit and the viewed filter.
  (`config/session.js`, `middleware/assignDeviceId.js`)
- **Permissions only on the server.** The role comes from the server-side session, reloaded from the database
  on every request, never from anything the browser sends. Hidden buttons protect nothing.
  (`middleware/requireRole.js`, `middleware/setCurrentUser.js`)
- **Security against injection and XSS.** Every request value is type-checked before it reaches a query (a JSON
  body can hold `{ "$ne": "" }`); search text is escaped before it becomes a regular expression; text from users
  is shown with `textContent` in scripts and `<%= %>` in EJS, never `innerHTML` or `<%-`.
  (`utils/requestValidation.js`, `controllers/authController.js`)
- **Login.** bcrypt hashes with a salt; the same message *and* the same time for an unknown user and a wrong
  password; a new session id at login (session fixation); the session deleted at logout; a taken username
  caught by the unique index, not a check-then-save. (`controllers/authController.js`, `models/User.js`)
- **Comment limit.** Counting the device's comments of the last 60 seconds in MongoDB (with an index) keeps
  the limit correct after a restart without extra storage. Known limits: two comments sent at the very same
  moment could both pass, and clearing cookies gives a new device id. (`middleware/commentRateLimiter.js`)
- **Weather.** Open-Meteo needs no API key, so the widget works on any computer (our `.env` is never in the
  repository). The server refreshes its one shared copy after 5 minutes and never serves a copy older than
  10 minutes, even when the service is down; the widget asks again every 5 minutes. So a reader sees data at
  most 15 minutes old, and thousands of readers cause at most one outside call every 5 minutes.
  (`services/weatherService.js`, `public/js/public/weatherWidget.js`)
- **Performance with thousands of articles.** Paging (20 per page), `.select()` of only the shown fields,
  `.lean()` plain objects, and indexes that match each list's filter and sort, with `_id` as a tie-breaker so
  pages never repeat or skip a row. (`models/Article.js`, the controllers)
- **Autosave.** 2 seconds after the last key press, one request at a time, retried after a network failure,
  a last save with `fetch(..., { keepalive: true })` when the page closes, and the edit page always filled
  from the server, never from browser storage. (`public/js/reporter/articleEditor.js`)
- **Chart.js without extra packages.** A linear x-axis of timestamps (a time axis would need a date-adapter
  package) and our own small plugin (`afterDraw`) for the dashed publish markers. (`public/js/editor/analytics.js`)

## Pages and API

Pages (rendered on the server with EJS):

| Page | Who |
|---|---|
| `GET /` feed, `GET /articles/:id` article, `GET /login` | Everyone |
| `GET /reporter` dashboard, `GET /reporter/articles/:id/edit` editor | Reporter (their own articles) |
| `GET /editor`, `GET /editor/articles/:id` review, `GET /editor/analytics`, `GET /editor/users`, `GET /editor/comments` | Editor |
| `POST /logout` (a plain HTML form in the header, works without JavaScript) | Logged in |

JSON API (all under `/api`, used by the browser scripts):

| Method and path | Purpose | Who |
|---|---|---|
| `GET /api/articles?search=&category=&viewed=&sort=&page=` | 20 live articles and `hasMore` | Everyone |
| `DELETE /api/articles/viewed` | Reset this browser's viewed marks | Everyone |
| `GET /api/weather` | The cached weather | Everyone |
| `GET /api/articles/:id/comments`, `POST /api/articles/:id/comments` | List and add comments (guests: 3 a minute) | Everyone |
| `POST /api/auth/login` | Log in; answers where to go next | Everyone |
| `GET /api/reporter/articles`, `POST /api/reporter/articles` | My articles, create one | Reporter |
| `PATCH /api/reporter/articles/:id/draft`, `POST /api/reporter/articles/:id/submit` | Autosave, submit | Reporter (owner) |
| `GET /api/editor/articles?status=&search=&page=` | All articles, 20 per page | Editor |
| `PATCH /api/editor/articles/:id/draft` | Edit any article (a live one is published at once) | Editor |
| `POST /api/editor/articles/:id/approve`, `POST /api/editor/articles/:id/return` | Publish; return with a note | Editor |
| `DELETE /api/editor/articles/:id` | Delete with its comments and statistics | Editor |
| `GET /api/editor/articles/:id/views?from=&to=`, `DELETE /api/editor/articles/:id/views` | Chart data; reset statistics | Editor |
| `GET /api/users?search=&page=`, `POST /api/users`, `PATCH /api/users/:id`, `DELETE /api/users/:id` | User management | Editor |
| `GET /api/comments?search=&page=`, `PATCH /api/comments/:id`, `DELETE /api/comments/:id` | Comment moderation | Editor |

Status codes: `200` OK, `201` created, `400` invalid input, `401` not logged in, `403` not allowed,
`404` not found, `409` not allowed in the current status, `429` too many comments, `503` weather unavailable,
`500` server error (details only in the log).

## Self-check scripts

The repository has no test library (only course technologies), so the checks are small Node scripts
that use `console.assert`-style checks and print a summary.

| Command | Checks | Needs |
|---|---|---|
| `npm run test:workflow` | The status rules (which role may move an article from which status to which) | Nothing |
| `npm run test:reporter` | The reporter routes: permissions, ownership, statuses, invalid input | A running server and a test database |
| `npm run test:editor` | The editor routes and view counting: permissions, list, approve, return, delete, statistics, invalid input | A running server and a test database |

The two API scripts create and delete articles, so they **refuse to run** unless the database name ends
with `-test`. Each script's header has the exact steps; in short (PowerShell):

```
$env:MONGODB_URI='mongodb://127.0.0.1:27017/the-web-daily-test'; $env:PORT='3098'; npm run seed
npm start                                   (in a second terminal, with the same two values)
npm run test:editor                         (back in the first terminal)
```

## Team

Every file's header comment names its owner. Each student owned one area:

| Student | Area |
|---|---|
| OS | Project skeleton, login and sessions, permissions, user management, comments and moderation, error handling, logging, the full seed |
| SM | Editor area (dashboard, review, approve, return, delete), view counting and Impact Analytics |
| SH | Public site (feed, article page), weather, shared layout and stylesheet |
| EZ | Reporter area (dashboard, editor with autosave, submit) and the article status rules |

We work with a branch per task and pull requests into `dev`; `main` receives only tested releases.
