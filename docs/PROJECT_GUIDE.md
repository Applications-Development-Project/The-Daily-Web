# The Daily Web: a guide to the code

This guide explains how the project is organised, so that anyone on the team can open any file and know
what it is for, where its request came from and where it goes next. For installing and running the
project, and for the list of features, see the main [README](../README.md). For the rules we write code
by, see [CONVENTIONS.md](../CONVENTIONS.md).

## Contents

1. [Technologies](#1-technologies)
2. [The big picture: MVC](#2-the-big-picture-mvc)
3. [The kinds of files, and what each one does](#3-the-kinds-of-files-and-what-each-one-does)
4. [Directory by directory](#4-directory-by-directory)
5. [File naming conventions](#5-file-naming-conventions)
6. [How to find anything: three ways in](#6-how-to-find-anything-three-ways-in)
7. [Following a request from start to finish](#7-following-a-request-from-start-to-finish)
8. [Words that appear everywhere in the code](#8-words-that-appear-everywhere-in-the-code)
9. [How each file explains itself](#9-how-each-file-explains-itself)
10. [Preparing for the defense](#10-preparing-for-the-defense)

- [Appendix: where each requirement lives](#appendix-where-each-requirement-lives)
- [Appendix: every page and API URL](#appendix-every-page-and-api-url)

## 1. Technologies

Only technologies taught in the course, plus the four packages the lecturer approved.

| Layer | Technology | What we use it for |
|---|---|---|
| Server runtime | **Node.js** (20.6 or newer) | Runs the server code |
| Web framework | **Express 5** | URLs (routing), middleware, sending pages and JSON |
| Pages | **EJS** | HTML templates filled on the server (`views/`) |
| Database | **MongoDB** | Stores users, articles, comments, statistics and login sessions |
| Database library | **Mongoose 9** | Schemas, validation and queries (`models/`) |
| Browser | **HTML5, CSS3 (Flexbox), plain JavaScript** | The pages, the layout, and the interactive parts with `fetch` (Ajax) |
| Chart | **Chart.js 4** (loaded from a CDN on one page) | The Impact Analytics chart |
| Approved packages | **express-session**, **connect-mongo** | Login sessions, stored in MongoDB so they survive a server restart |
| | **bcrypt** | Password hashing (passwords are never stored as text) |
| | **dotenv** | Reads settings and secrets from `.env` |
| External service | **Open-Meteo** | Current weather for the sidebar (free, no API key) |

There is no front-end framework (no React, Vue, jQuery, Bootstrap), no bundler and no test library.

## 2. The big picture: MVC

The project follows the **Model-View-Controller** pattern taught in the course:

- **Model**: what the data looks like and its rules (`models/`). Example: an article has a title of at
  most 200 characters.
- **View**: what the user sees (`views/`, EJS templates that become HTML).
- **Controller**: the code that handles one request: reads it, checks it, asks the models, and answers
  with a view (an HTML page) or JSON (`controllers/`).

Around these three, Express adds a few more kinds of files: **routes** decide which controller answers
which URL, **middleware** runs before the controllers (login checks, cookies), **services** hold business
rules shared by several controllers, and **browser scripts** (`public/js/`) make pages interactive without
reloading them.

```
Browser ──request──> app.js ──> middleware ──> route ──> controller ──> service / model ──> MongoDB
   ^                                                         │
   └──────────── HTML page (EJS view) or JSON ───────────────┘
```

## 3. The kinds of files, and what each one does

| Kind | Folder | Its one job | Example |
|---|---|---|---|
| **Entry point** | `server.js` | Loads `.env`, connects to MongoDB, starts listening | `npm start` runs it |
| **App setup** | `app.js` | Builds the Express app: the order of middleware and routers | Body parsing, then static files, then the session... |
| **Config** | `config/` | Settings for one external piece | `config/session.js`: how sessions are stored |
| **Route file** | `routes/` | Says *which URL* goes to *which controller function* and *who may use it*. No logic | `router.post('/editor/articles/:id/approve', requireRole('editor'), approveArticle)` |
| **Middleware** | `middleware/` | Runs before controllers on many routes; can stop a request | `requireRole('editor')` answers 403 to a reporter |
| **Controller** | `controllers/` | Handles one request: check the input, use models and services, answer | `approveArticle` publishes an article |
| **Service** | `services/` | A business rule used by several controllers, with no knowledge of HTTP | `canTransition()`: which status changes are allowed |
| **Utility** | `utils/` | A tiny helper used everywhere | `isValidObjectId()`, `createHttpError()` |
| **Model** | `models/` | A MongoDB collection: its fields, validation and indexes | `models/Article.js` |
| **View** | `views/` | An EJS template that becomes the HTML page | `views/public/article.ejs` |
| **Partial** | `views/partials/`, `views/editor/partials/` | A piece of a view shared by several pages | The site header |
| **Browser script** | `public/js/` | Runs in the browser: Ajax calls, infinite scroll, autosave | `public/js/reporter/articleEditor.js` |
| **Stylesheet** | `public/css/main.css` | All the styles of the site | |
| **Script** | `scripts/` | A program you run by hand | `scripts/seed.js` fills the database with demo data |
| **Self-check** | `tests/` | Sends real requests and checks the answers | `npm run test:editor` |

Two kinds of routes and answers:

- **Page routes** (`routes/pageRoutes/`, mounted at `/`) answer with an **HTML page** rendered from a view.
- **API routes** (`routes/apiRoutes/`, mounted at `/api`) answer with **JSON**, always
  `{ success: true, data }` or `{ success: false, error }`. Browser scripts call them with `fetch`
  through `public/js/shared/apiClient.js`.

## 4. Directory by directory

### The whole tree

The browser code and the views are split by the same three areas, `public` (guests), `reporter` and `editor`,
so the script of `views/<area>/<page>.ejs` is `public/js/<area>/<page>.js`.

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
├── middleware/               Runs before the controllers: device cookie, current user, login and role checks,
│                             comment limit, 404, error handler
├── services/                 Business rules shared by controllers: status rules, draft rules, view counting,
│                             weather, logger
├── utils/                    Small helpers every controller uses: errors, request checks, "is this an API request?"
├── views/
│   ├── partials/             head, header (login state and logout), footer, sidebar (weather)
│   ├── public/               feed, article, login, error
│   ├── reporter/             dashboard, articleEditor
│   └── editor/               dashboard, articleReview, analytics, users, comments, partials/ (nav, article content)
├── public/                   Served as static files
│   ├── css/main.css          The one stylesheet
│   ├── images/               placeholder.svg (when an article image can't load), favicon.svg
│   └── js/
│       ├── shared/apiClient.js   fetch() wrapper every page script uses: always { success, data, error, status }
│       ├── public/               feed.js, articleComments.js, weatherWidget.js, login.js
│       ├── reporter/             dashboard.js, articleEditor.js (autosave)
│       └── editor/               dashboard.js, articleReview.js, analytics.js (chart), users.js, comments.js
├── scripts/seed.js           Demo data (npm run seed)
├── tests/                    Self-check scripts (npm run test:workflow, test:reporter, test:editor)
├── docs/PROJECT_GUIDE.md     This guide
├── CONVENTIONS.md            The team's code conventions
└── .env.example              Template for your own .env
```

The sections below go through each folder file by file.

### Top level

| File | What it is |
|---|---|
| `server.js` | The entry point. Connects to MongoDB first, then starts the HTTP server |
| `app.js` | The Express app. Read its header first: it lists the middleware order and why |
| `package.json` | The packages and the `npm` commands (`start`, `dev`, `seed`, `test:*`) |
| `.env.example` | The settings each of us copies into our own `.env` (which is never committed) |
| `README.md` | For the lecturer: how to install and run the project, the demo users and the main features |
| `CONVENTIONS.md` | How we write code: comments, naming, where files go, Git |

### `config/`: connecting to outside pieces

- `database.js`: opens and closes the Mongoose connection to MongoDB.
- `session.js`: login sessions (cookie named `sessionId`, stored in MongoDB's `sessions` collection, 7 days).

### `models/`: the data

One file per MongoDB collection, named in PascalCase after the model:

- `User.js`: reporters and editors. Only a bcrypt hash of the password, never returned to the browser.
- `Article.js`: the central model. Two copies of the content, `draft` (being worked on) and `published`
  (what readers see), plus `status`, the publish history and the view total. Also the category list.
- `Comment.js`: guest comments, with the device id used by the 3-per-minute limit.
- `ArticleViewStats.js`: one view counter per article per hour (for the chart).
- `DeviceArticleView.js`: which browser has opened which article (for the viewed / not-viewed filter).

### `routes/`: which URL goes where

Two folders, one file per area in each. A route file is short on purpose: it can be read in one glance
to see every URL of an area and who may use it.

- `pageRoutes/<area>PageRoutes.js`: pages (`GET /`, `GET /editor`, ...).
- `apiRoutes/<area>ApiRoutes.js`: JSON (`GET /api/articles`, `POST /api/editor/articles/:id/approve`, ...).

The areas are `feed`, `articlePage`, `weather`, `auth`, `user`, `comment`, `reporter`, `editor` and
`analytics`. Inside a router file, paths are written without the `/api` prefix; `app.js` adds it.

### `middleware/`: runs before the controllers

| File | What it does |
|---|---|
| `assignDeviceId.js` | Gives every browser a long-lived `deviceId` cookie (guests too) and sets `req.deviceId` |
| `setCurrentUser.js` | Reloads the logged-in user's role and name from the database; sets `currentUser` for every view |
| `requireLogin.js` | Lets only logged-in users through (401 JSON for the API, redirect to `/login` for pages) |
| `requireRole.js` | Lets only one role through, for example `requireRole('editor')` (403 otherwise) |
| `commentRateLimiter.js` | A guest's 4th comment within a minute gets 429 |
| `notFoundHandler.js` | No route matched: turns the request into a 404 error |
| `errorHandler.js` | The last stop for every error: chooses the status, logs it, answers JSON or the error page |

### `controllers/`: one file per area

| File | Area | Answers |
|---|---|---|
| `feedController.js` | Public | The feed page and the feed API (search, filters, sort, paging) |
| `articlePageController.js` | Public | The full article page |
| `weatherController.js` | Public | The weather API |
| `commentController.js` | Public and editor | Comments on an article; comment moderation |
| `authController.js` | Everyone | Login page, login, logout |
| `userController.js` | Editor | User management |
| `reporterController.js` | Reporter | Dashboard, editor page, create, autosave, submit |
| `editorController.js` | Editor | Dashboard, review page, edit, approve, return, delete |
| `analyticsController.js` | Editor | Impact Analytics page, chart data, reset statistics |

### `services/`: business rules

| File | What it holds |
|---|---|
| `articleWorkflow.js` | The four statuses, their labels, and `canTransition()`, the table of allowed status changes |
| `draftValidation.js` | The rules for an article's content, shared by the reporter's autosave and the editor's edit |
| `viewTracker.js` | `recordView()` (counts a visit) and `getViewsOverTime()` (the chart's data) |
| `weatherService.js` | Gets the weather from Open-Meteo and keeps one shared copy in memory |
| `logger.js` | `logger.info`, `logger.warn`, `logger.error`: the console, `logs/app.log` and `logs/error.log` |

### `utils/`: small shared helpers

- `httpErrors.js`: `createHttpError(404, 'Article not found.')`, the way every controller reports a problem.
- `requestValidation.js`: `isValidObjectId`, `escapeRegExp`, `readSearchText`, `readPageNumber`.
- `isApiRequest.js`: is this an `/api` request? (decides between a JSON answer and an HTML page).

### `views/`: the pages (EJS)

Split by who uses them, the same three areas as the browser scripts:

- `partials/`: `head.ejs` (title, stylesheet), `header.ejs` (site name, login state, logout button),
  `footer.ejs`, `sidebar.ejs` (the weather widget).
- `public/`: `feed.ejs`, `article.ejs`, `login.ejs`, `error.ejs` (every error page, including 404).
- `reporter/`: `dashboard.ejs`, `articleEditor.ejs`.
- `editor/`: `dashboard.ejs`, `articleReview.ejs`, `analytics.ejs`, `users.ejs`, `comments.ejs`, and
  `partials/` with the editor navigation bar and the block that shows one version of an article.

### `public/`: files sent to the browser as they are

Express serves this folder at `/`, so `public/css/main.css` is at `/css/main.css`.

- `css/main.css`: the one stylesheet, in sections (tokens, base, layout, shared components, areas, phones).
- `images/`: `placeholder.svg` (shown when an article image can't load) and `favicon.svg` (the tab icon).
- `js/shared/apiClient.js`: the `fetch` wrapper every page script uses. It always resolves to
  `{ success, data, error, status }` and never throws, so a page only checks `result.success`.
- `js/public/`: `feed.js` (infinite scroll, search, filters), `articleComments.js` (posting comments),
  `weatherWidget.js`, `login.js`.
- `js/reporter/`: `dashboard.js` (new article, submit), `articleEditor.js` (autosave).
- `js/editor/`: `dashboard.js`, `articleReview.js` (approve, return, edit), `analytics.js` (the chart),
  `users.js`, `comments.js`.

### `scripts/` and `tests/`

- `scripts/seed.js`: deletes everything in the database and creates the demo data (`npm run seed`).
- `tests/testWorkflow.js`: checks every allowed and forbidden status change (needs nothing).
- `tests/testReporterApi.js`, `tests/testEditorApi.js`: send real requests to a running server on a
  `-test` database and check every answer (see the header of each file for how to run them).

### Created while running (not in Git)

- `logs/`: `app.log` (everything) and `error.log` (errors with stack traces).
- `node_modules/`: the installed packages (`npm install` recreates it).
- `.env`: your own settings and secrets.

## 5. File naming conventions

| What | Convention | Examples |
|---|---|---|
| Models | PascalCase, singular, the model's name | `Article.js`, `ArticleViewStats.js` |
| Every other file | camelCase | `feedController.js`, `commentRateLimiter.js` |
| Controllers | `<area>Controller.js` | `editorController.js` |
| Route files | `<area>PageRoutes.js` or `<area>ApiRoutes.js` | `reporterPageRoutes.js`, `reporterApiRoutes.js` |
| Views | `views/<area>/<page>.ejs` | `views/editor/articleReview.ejs` |
| A page's script | `public/js/<area>/<page>.js`, the same name as its view | `views/editor/users.ejs` uses `public/js/editor/users.js` |
| A script for one part of a page | named after that part | `articleComments.js`, `weatherWidget.js` |
| Functions | start with a verb, no abbreviations | `submitArticleForApproval`, `findOwnedArticle`, `readPageNumber` |
| Constants | UPPER_CASE | `ARTICLES_PER_PAGE`, `MAX_AGE_MS` |
| Element ids and CSS classes | lowercase with dashes | `#comment-list`, `.article-card` |

One word per idea everywhere: always "reporter" (never "writer" or "author"), always "editor", "article",
"comment". The areas are always `public`, `reporter` and `editor`.

## 6. How to find anything: three ways in

**From a URL.** Find the URL in a route file (`routes/pageRoutes/` for pages, `routes/apiRoutes/` without
the `/api` prefix for JSON). The route names the controller function; the controller's JSDoc lists every
answer it can give. Example: `POST /api/editor/articles/:id/return` is in `routes/apiRoutes/editorApiRoutes.js`
and goes to `returnArticleToReporter` in `controllers/editorController.js`. The
[appendix](#appendix-every-page-and-api-url) lists every URL.

**From a page.** The page's view is `views/<area>/<page>.ejs`; its script, if it has one, is
`public/js/<area>/<page>.js`. The view's header says which controller renders it and with which values.

**From a requirement.** The table ["Where each requirement lives"](#appendix-where-each-requirement-lives)
lists the files for each requirement of the project document.

## 7. Following a request from start to finish

Every request first goes through `app.js`, which runs middleware in the order it is written:

1. **Body parsers** (`express.json`, `express.urlencoded`), so `req.body` exists.
2. **Static files** from `public/` (CSS, scripts, images), answered before any session work.
3. **Session** (`config/session.js`): `req.session.user = { id, role, displayName }` after login.
4. **Device id** (`assignDeviceId`): `req.deviceId` for every browser, guests included.
5. **Current user** (`setCurrentUser`): reloads the role from the database; `currentUser` for every view.
6. **Routers**: page routers at `/`, API routers at `/api`. Protected routes run `requireLogin` /
   `requireRole` first, then the controller.
7. **404** (`notFoundHandler`), then **`errorHandler`** last, which answers every error: JSON
   `{ success: false, error }` for `/api/...`, the error page otherwise.

Controllers report a problem with `throw createHttpError(404, 'Article not found.')`; with Express 5 an error
thrown in an async controller reaches `errorHandler` without any try/catch.

Three requests, followed file by file:

**A guest posts a comment.**

1. `views/public/article.ejs` has the form; `public/js/public/articleComments.js` catches the submit and
   calls `apiClient.post('/api/articles/<id>/comments', { authorName, text })`.
2. `app.js` runs the shared middleware: the body is read, `assignDeviceId` sets `req.deviceId`.
3. `routes/apiRoutes/commentApiRoutes.js`: `POST /articles/:id/comments` runs `commentRateLimiter` first.
4. `middleware/commentRateLimiter.js` counts this device's comments of the last minute; at 3 it stops
   with a 429 error, which `errorHandler.js` sends as `{ success: false, error }`.
5. `controllers/commentController.js` `addComment` checks the name and text, checks the article is live,
   and saves the comment with `models/Comment.js`. It answers `201` with the new comment.
6. Back in the browser, `articleComments.js` adds the comment to the top of the list with `textContent`.

**The editor approves an update to a live article.**

1. `views/editor/articleReview.ejs` shows both versions side by side; `public/js/editor/articleReview.js`
   sends `POST /api/editor/articles/<id>/approve` after a confirmation.
2. `routes/apiRoutes/editorApiRoutes.js`: `requireRole('editor')` lets only an editor through.
3. `controllers/editorController.js` `approveArticle` asks `services/articleWorkflow.js`
   `canTransition(status, 'published', 'editor')`, then `publishWorkingCopy` copies `draft` into
   `published` and adds a publish to the history.
4. From this moment the feed and the article page (which read only `published`) show the new version, and
   the chart in Impact Analytics shows a new dashed marker.

**A reader opens an article.**

1. `routes/pageRoutes/articlePageRoutes.js`: `GET /articles/:id`, open to everyone.
2. `controllers/articlePageController.js` checks the id, loads the live article and its newest comments,
   and calls `recordView()` in `services/viewTracker.js`, which adds 1 to this hour's counter, to the
   article's total, and marks the article as viewed by this browser.
3. `views/public/article.ejs` is rendered on the server with the full text, so search engines can read it.

## 8. Words that appear everywhere in the code

| Word | Meaning |
|---|---|
| **draft** / **published** | The two copies of an article's content: the working copy, and what readers see |
| **live** | An article that readers can see: `published` is not `null`, whatever its status |
| **status** | The state of the working copy: `draft`, `pending`, `published`, `returned` |
| **transition** | A status change; only those in `services/articleWorkflow.js` are allowed |
| **deviceId** | A random id in a cookie that identifies a browser, for guests too |
| **session** | The server-side record of who is logged in: `req.session.user = { id, role, displayName }` |
| **currentUser** | The session user (or `null`), available in every view |
| **bucket** / **hourStart** | One hour's view counter in `ArticleViewStats` |
| **contract** | A name, path or response shape other files depend on (for example the comment element ids) |

## 9. How each file explains itself

Every file starts with a short **header comment** (about 5 to 15 lines): what it does, who uses it and its
owner. Every function has a **JSDoc comment**: its purpose, parameters, return value and the errors it throws,
plus a sentence or two on *why* when the choice is not obvious. A tricky line has a short **"why" comment**
right next to it, for example why `$inc` with `upsert` is safe when two readers arrive together, or why a value
must be a string before it reaches a query. In EJS views these notes are EJS comments, so they never reach the
browser.

The comments are kept short so the code stays easy to read; the longer explanations are in this guide
(sections 7, 10.4 and 10.5). So the fastest way to understand any file is to read its header, then the JSDoc
of the function you are looking at, then the "why" comments in its body.

## 10. Preparing for the defense

### 10.1 What the defense is

From the requirements document:

- The lecturer checks **only the submitted version** of the code; nothing can be changed during the defense.
  The lecturer **operates the system** and tests its stability, completeness and behaviour.
- **Any of us may be asked about any line**, not only our own area. Not being able to explain code (including
  code written with AI) counts as not controlling the project and can lower the grade a lot.
- After the defense the lecturer also checks the whole project alone, so it must run on another computer from the
  zip or the repository.
- The grade covers: the defense, code quality, look, user experience, stability, teamwork (seen in the Git history)
  and meeting the technical requirements.
- Each student is examined once; there is no second attempt.

### 10.2 Timeline and checklist

**Before submitting** (the box closes at 23:59 the day before the defense; 20 points off if late):

- [ ] The finalization pull request is reviewed and merged into `dev`; then `dev` is merged into `main`
      (`gh pr create --base main --head dev`), and `main` is set back as the default branch.
- [ ] Every student pulls `main`, runs `npm install`, `npm run seed` and `npm start`, and clicks through the demo
      script below on their own laptop.
- [ ] **Fresh install test** on a computer that never had the project: clone the public repo, `npm install`,
      copy `.env.example` to `.env`, fill in `MONGODB_URI`, `SESSION_SECRET` and `SEED_DEMO_PASSWORD`, seed, start.
      This is exactly what the lecturer will do.
- [ ] The repository is **public** and holds no secret (`.env` is never committed; the seed password is never
      written in a file).
- [ ] The zip is made from `main` (without `node_modules` and `.env`), uploaded to Moodle, with the repository link
      in the submission note.
- [ ] Each student fills in the AI-use declaration form on the course site (the course requires it; it is
      separate from Git).

**The day before the defense**

- [ ] Agree who presents which part of the demo, and rehearse it once, end to end, with a timer.
- [ ] Each student does one mock-defense round on an area they did **not** build (10.6).

**The morning of the defense** (on the laptop that will be used)

- [ ] MongoDB is running (on Windows it is a service; `mongosh` connects).
- [ ] Run `npm run seed` again: the view statistics cover the 30 days **before** the seed runs, so an old seed makes
      the chart look empty. (The seed also logs everyone out, because it clears the sessions.)
- [ ] `npm start`, open <http://localhost:3000>, and check that the weather widget shows the weather (it needs
      internet, and so does the Chart.js chart).
- [ ] Two browsers ready: a normal window (logged in) and a private window (guest), to show permissions and
      "another computer" side by side.
- [ ] The terminal with the server log visible, and `logs/app.log` and `logs/error.log` open in the editor.
- [ ] VS Code open on the project, so any file can be shown at once.

### 10.3 The demo script (every requirement, in order)

Each step says what to do, what the lecturer should see, and where the code is. Demo users: `editor` and
`reporter1` to `reporter5`; the password is `SEED_DEMO_PASSWORD` from `.env`.

| # | Requirement | Do this | Expected | Code |
|---|---|---|---|---|
| 1 | The feed shows only published articles | Open `/` as a guest | 20 cards: title, image, summary, category, reporter, date | `feedController.js`, `feed.ejs` |
| 2 | Infinite scroll, 20 more | Scroll to the bottom | 20 more cards, no reload, no repeats | `public/js/public/feed.js` (IntersectionObserver) |
| 3 | Search, filter and sort without reload | Type "marathon"; pick a category; "Not viewed yet"; "Most popular" | The list changes, the page doesn't reload | `feed.js`, `feedController.js` (`readFeedQuery`) |
| 4 | The full article, readable by search engines | Open an article, then View Page Source (Ctrl+U) | The full text is in the source | `articlePageController.js`, `article.ejs` |
| 5 | Viewed / not viewed | Go back and choose "Not viewed yet" | The article you just opened is gone; "Reset viewed marks" brings it back | `DeviceArticleView.js`, `viewTracker.js` |
| 6 | A new comment appears without reloading the list | Post a comment, for example `<script>alert(1)</script>` | It appears at the top, as plain text | `articleComments.js`, `commentController.js` |
| 7 | A guest posts at most 3 comments a minute | Post 3 more quickly | The 4th is refused with a clear message (429) | `commentRateLimiter.js` |
| 8 | The weather widget, at most 15 minutes old | Point at the sidebar | City, temperature, "Updated 14:32" | `weatherService.js`, `weatherWidget.js` |
| 9 | Login; each role goes to its area | Log in as `reporter1`, then as `editor` | `/reporter`, then `/editor` | `authController.js` |
| 10 | Permissions are checked on the server | As a guest open `/editor`; as `reporter1` open `/editor` | A redirect to the login page; a 403 page | `requireRole.js` |
| 11 | The same when the API is called directly | As `reporter1`, in the browser console: `fetch('/api/editor/articles').then(r => r.status)` | `403` | `requireRole.js` |
| 12 | A reporter sees their own articles and statuses | The `reporter1` dashboard | Only Dana Levi's articles, with status labels and the editor's notes | `reporterController.js` |
| 13 | Create; saved without a Save button | "New article", type a title, wait 2 seconds | "Saved at 14:32" | `public/js/reporter/articleEditor.js` |
| 14 | Refresh, closed browser, another computer | Refresh; then open the same article in the private window after logging in | The latest text is there | `showArticleEditor` (fills from the server), `keepalive` |
| 15 | Submit for approval; required fields | Submit with an empty summary, then fill it in and submit | First a clear message, then "Awaiting editor approval" | `submitArticleForApproval` |
| 16 | A pending article is read-only for the reporter | Look at the dashboard row | No Edit button; the API answers 409 | `EDITABLE_STATUSES` |
| 17 | Editing a live article | As the reporter, edit a published article and submit it; open it as a guest | The guest still sees the old version | `Article.draft` / `Article.published` |
| 18 | The editor sees all articles and filters by status | Editor dashboard, status "Awaiting editor approval" | Only pending articles, in pages, without reloading | `listAllArticles` |
| 19 | The editor sees the live and the new version | Open the live article's review page | "Currently live" and "Submitted changes" side by side, changed fields marked | `toReviewView`, `articleContent.ejs` |
| 20 | Return with a required note | Return with an empty note, then with a note | Refused, then "Returned"; the reporter sees the note | `returnArticleToReporter` |
| 21 | Fix and resubmit | As the reporter, edit and submit again | "Awaiting editor approval" | `canTransition` (returned to pending) |
| 22 | The editor edits and approves | Edit the submitted version, then "Approve and publish" | The guest now sees the new version | `editArticleDraft`, `approveArticle` |
| 23 | The editor deletes | Delete an article from the dashboard and confirm | Gone, together with its comments and statistics | `deleteArticle` |
| 24 | Impact Analytics | "See its views over time" on that article | A chart with a numbered dashed line at every publish | `analytics.js`, `viewTracker.js` |
| 25 | Full CRUD on users and comments | Users: add, edit, delete; try to delete `reporter1` (who has articles) | Works without reloading; deleting the reporter is refused (409) | `userController.js`, `commentController.js` |
| 26 | Still logged in after a server restart | Stop the server (Ctrl+C), `npm start`, refresh | Still logged in | `config/session.js` (sessions in MongoDB) |
| 27 | Invalid input never crashes the server | Open `/articles/abc` and `/nope` | Clean 404 pages; the server keeps running | `errorHandler.js` |
| 28 | Logs | Show `logs/app.log` and `logs/error.log` | Logins, status changes, warnings, errors | `services/logger.js` |
| 29 | Demo data | Show the seed's output and the editor dashboard's total | 510 articles in every status and category, 6 users | `scripts/seed.js` |

### 10.4 What everyone must be able to explain

These are the decisions the lecturer is most likely to ask about. Each one has a "why" comment in the file named.

**Architecture and Express**

- **MVC here:** models (`models/`), views (`views/`), controllers (`controllers/`); routes only connect URLs to
  controllers, and services hold the shared rules (section 2).
- **The middleware order in `app.js`**, and why: body parsers, static files (before the session, so a CSS file never
  touches MongoDB), session, device id, current user, routers, 404, and the error handler last (`app.js` header).
- **How Express recognises the error handler:** it has four parameters, `(error, request, response, next)` (`errorHandler.js`).
- **Express 5:** an error thrown in an `async` controller reaches `errorHandler` without try/catch; `req.body` is
  `undefined` when there is no body; inside a router, `request.path` is relative to where the router is mounted.
- **Why `server.js` and `app.js` are separate:** one builds the app; the other connects to MongoDB first and only then
  starts listening (`server.js` header).
- **REST:** the URL names the resource and the method says the action (GET reads, POST creates or runs an action,
  PATCH changes part, DELETE removes). Every JSON answer is `{ success, data }` or `{ success, error }`.

**Data and performance**

- **Two copies of an article** (`draft` and `published`), and why "live" means `published` is not null, whatever the
  status (`models/Article.js`).
- **Why `published` to `draft` is in the transition table**, and why every other transition is refused. The
  requirements list four transitions but also require that an edited live article goes through approval again while
  readers keep the old version; `status` describes the working copy, so starting to edit a live article makes the new
  version "In preparation". `canTransition` looks the change up in a table, and anything not in it is `false`
  (`services/articleWorkflow.js`).
- **Hourly view counters:** one document per article per hour; `$inc` with `upsert` is atomic, so simultaneous views
  are never lost; a unique index stops duplicates; 30 days is at most 720 documents per article
  (`models/ArticleViewStats.js`, `services/viewTracker.js`).
- **`totalViews` on the article**, for the popularity sort, instead of adding up the counters on every request.
- **`recordView` never throws**, so a statistics failure never breaks the article page.
- **Indexes and the `_id` tie-breaker:** each list's filter and sort match an index, so a page reads 20 documents
  whatever the size of the collection; `_id` gives equal dates a fixed order, so pages never repeat or skip a row.
- **`.select()` and `.lean()`:** only the shown fields, as plain objects (the feed never loads an article's body).
- **Paging:** 20 per page with `skip`; the feed asks for 21 to know `hasMore` without counting.
- **The comment limit** counts the device's comments of the last 60 seconds in MongoDB, with an index, so it still
  works after a restart. Known limits: two comments at the very same moment could both pass, and clearing cookies
  gives a new device id (`middleware/commentRateLimiter.js`).
- **Weather:** Open-Meteo needs no key, so it works on the lecturer's computer; one shared copy refreshed after
  5 minutes and never older than 10, plus the widget's 5-minute refresh, gives at most 15 minutes; readers arriving
  during a refresh share one request; thousands of readers cause at most one outside call every 5 minutes
  (`services/weatherService.js`).

**Security**

- **Passwords:** a bcrypt hash with a salt (cost 10), never stored or sent as text; `passwordHash` has
  `select: false` and is removed in `toJSON` (`models/User.js`).
- **Login:** the same message and the same time for an unknown user and a wrong password; a new session id at login
  (against session fixation); the session is deleted at logout; logout is a POST form; a taken username is caught by
  the unique index, not by a check-then-save (`authController.js`, `models/User.js`).
- **Sessions:** the browser holds only a signed, `httpOnly` cookie; the data is in MongoDB; the role is reloaded from
  the database on every request, so a demotion applies at once (`config/session.js`, `setCurrentUser.js`).
- **Permissions on the server:** `requireLogin` and `requireRole` in every route file; ownership in the controller
  (`findOwnedArticle`, 403); the reporter's id always from the session, never from the request body.
- **NoSQL injection:** every request value is checked to be a string before it reaches a query
  (`utils/requestValidation.js`, `authController.js`).
- **Regex escaping** before search text becomes a `RegExp` (`escapeRegExp`).
- **XSS:** user text is shown with `textContent` in scripts and `<%= %>` in EJS, never `innerHTML` or `<%-`; image
  addresses must be `http(s)`, so a `javascript:` link can't be saved (`services/draftValidation.js`).
- **No secrets in the repository:** `.env` is in `.gitignore`; `.env.example` has empty values.

**Front end**

- **Ajax through `apiClient`:** one `fetch` wrapper that never throws and always returns `{ success, data, error, status }`.
- **Infinite scroll:** an `IntersectionObserver` on an empty element at the end of the list, not the scroll event.
- **Debounce:** 300 ms for searches, 2 seconds for autosave.
- **Answers that arrive out of order:** every list request has a number, and an older answer is ignored.
- **Autosave:** one request at a time; a retry after 5 seconds on a network or server error (not on 4xx); a last save
  with `fetch(..., { keepalive: true })` when the page closes; a clear message when the session has ended; the edit
  page is always filled from the server, never from browser storage, so another computer sees the same text.
- **Validation in two places:** the browser's check is only a quick answer; the server's check is the real one.
- **Chart.js:** a linear x-axis of timestamps (a time axis would need an extra date-adapter package); our own
  `afterDraw` plugin draws the dashed publish markers; over 30 days the hours are added up into days.
- **A responsive Flexbox layout and semantic HTML5** (`main`, `aside`, `article`, `section`, `nav`, `time`, labels).

### 10.5 Likely questions, with short answers

| Question | Short answer | Where |
|---|---|---|
| What happens when I open `/articles/<id>`? | The route calls `showArticlePage`: it checks the id, loads the live article and its comments, calls `recordView`, renders `article.ejs` | `articlePageController.js` |
| Why is the article page rendered on the server but the editor dashboard in the browser? | Search engines must read articles without JavaScript; the dashboard is behind a login and must filter and page without reloading | `article.ejs`, `editor/dashboard.ejs` |
| How do you stop a reporter from publishing? | No reporter route publishes; `canTransition` allows pending to published only for the editor; the role comes from the session | `articleWorkflow.js`, `requireRole.js` |
| How do you stop a reporter from editing someone else's article? | `findOwnedArticle` compares `article.reporter` with the session's user id and answers 403 | `reporterController.js` |
| What if I change my role in the browser? | The browser holds only a signed session id; the role is on the server and reloaded from the database on every request | `config/session.js`, `setCurrentUser.js` |
| Why are sessions stored in MongoDB? | The default memory store is wiped on a restart; the requirements say a logged-in user keeps working after one | `config/session.js` |
| Why one counter per hour, not one document per view? | Thousands of readers would create millions of documents; `$inc` is atomic; the chart reads at most 24 documents a day | `ArticleViewStats.js` |
| What if two readers open the article at the same millisecond? | MongoDB applies both `$inc`s; the unique index makes a racing upsert retry as an update | `viewTracker.js` |
| How does the "not viewed" filter know who I am without a login? | The `deviceId` cookie; `DeviceArticleView` stores one (device, article) pair | `assignDeviceId.js` |
| How does the comment limit work, and can it be bypassed? | It counts the device's comments of the last minute (indexed); limits: a race at the same instant, clearing cookies | `commentRateLimiter.js` |
| Why doesn't a search like `(((` crash? | The text is escaped before it becomes a RegExp | `utils/requestValidation.js` |
| What is a NoSQL injection, and how do you prevent it? | A JSON value like `{ "$ne": "" }` becoming a query operator; every value must be a string | `authController.js` |
| How are comments protected from XSS? | Stored as typed, shown with `textContent` / `<%= %>`, which escape HTML | `articleComments.js`, `article.ejs` |
| Why does approving copy `draft` into `published`? | Readers read only `published`, so they keep the approved version until the moment of approval | `publishWorkingCopy` |
| How does the chart mark updates? | Every publish is in `publishHistory`; the views API returns them; an `afterDraw` plugin draws dashed lines | `analytics.js` |
| How is the weather never older than 15 minutes? | A 5-minute refresh and a 10-minute maximum age on the server, plus the widget's 5-minute refresh | `weatherService.js` |
| What if the weather service is down? | The last copy for up to 10 minutes, then "Weather unavailable"; logged as a warning; the page keeps working | `weatherService.js` |
| Why Open-Meteo and not OpenWeatherMap? | No API key, so it works on any computer; our `.env` is never in the repository | `weatherService.js` header |
| What happens if MongoDB stops while the server runs? | Requests fail cleanly with 500 through `errorHandler`; "Lost connection" is logged; Mongoose reconnects by itself | `config/database.js` |
| What does `errorHandler` do with an error it doesn't know? | 500 with a generic message; the details and stack trace only in `logs/error.log` | `errorHandler.js` |
| Why 409 and not 403 for "can't delete a reporter who has articles"? | The editor is allowed to manage users (so not 403); the current state of the data forbids it | `userController.js` |
| Why `findById` and `save()` instead of `findByIdAndUpdate`? | `save()` always runs the model's validators, and the rules can be checked on the loaded document first | `commentController.js` |
| How does autosave avoid old text overwriting new text? | Only one save at a time, and each save reads the form at the moment it is sent | `articleEditor.js` |
| Why can the editor edit a live article and publish it at once? | Requirements p.6: the editor can edit all articles; the editor is the approver, and they confirm first | `editArticleDraft` |
| What is in the seed, and why? | 510 articles in every status and category, users, comments and 30 days of statistics, so every requirement can be shown | `scripts/seed.js` |
| How did you split the work, and how is that visible? | Each student owned an area; a branch per task, pull requests into `dev` with reviews, `main` only for releases | The Git history |

### 10.6 How to practise

1. **Walkthroughs:** each student takes one request from section 7 or the demo table and explains it to the others,
   opening every file on the way from the browser script to the model. Rotate, so nobody presents their own area.
2. **Read every file once, in this order:** `server.js`, `app.js`, `config/`, `middleware/`, `utils/`, `models/`,
   `services/`, `routes/`, `controllers/`, `views/partials/`, then the views and browser scripts of one area at a time.
   For each file read the header, then each function's JSDoc, then the code.
3. **Mock defense:** one student plays the lecturer with the table in 10.5, then picks random lines in a file the
   other student did not write and asks "what does this line do, and why this way?". An AI tool can also play the
   lecturer on a chosen file.
4. **Run the self-checks** (`npm run test:workflow`, `test:reporter`, `test:editor`) and be able to say what each proves.

### 10.7 How to answer in the room

- **Open the file** and read its header comment: it says what the file does and who uses it. The "why" of a
  choice is in the comment next to its line.
- **Answer the "why", not only the "what":** the requirement it serves, the simpler alternative and why we didn't
  choose it, and any limit we accepted.
- **Name the known limits yourself:** the comment-limit race, page-number paging while the list changes, `sameSite`
  cookies instead of CSRF tokens, the reporter's list without paging, Chart.js needing internet. Showing you know the
  trade-off is better than being caught by it.
- **If you don't know, say how you would find out** (which file, which test) instead of guessing.

## Appendix: where each requirement lives

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

## Appendix: every page and API URL

Pages (rendered on the server with EJS), in `routes/pageRoutes/`:

| Page | Who |
|---|---|
| `GET /` feed, `GET /articles/:id` article, `GET /login` | Everyone |
| `GET /reporter` dashboard, `GET /reporter/articles/:id/edit` editor | Reporter (their own articles) |
| `GET /editor`, `GET /editor/articles/:id` review, `GET /editor/analytics`, `GET /editor/users`, `GET /editor/comments` | Editor |
| `POST /logout` (a plain HTML form in the header, works without JavaScript) | Logged in |

JSON API (all under `/api`, used by the browser scripts), in `routes/apiRoutes/`:

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

Every JSON answer is `{ success: true, data }` or `{ success: false, error: "<message a user can read>" }`.

Status codes: `200` OK, `201` created, `400` invalid input, `401` not logged in, `403` not allowed,
`404` not found, `409` not allowed in the current status, `429` too many comments, `503` weather unavailable,
`500` server error (details only in the log).
