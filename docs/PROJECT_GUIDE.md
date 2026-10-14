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

### Top level

| File | What it is |
|---|---|
| `server.js` | The entry point. Connects to MongoDB first, then starts the HTTP server |
| `app.js` | The Express app. Read its header first: it lists the middleware order and why |
| `package.json` | The packages and the `npm` commands (`start`, `dev`, `seed`, `test:*`) |
| `.env.example` | The settings each of us copies into our own `.env` (which is never committed) |
| `README.md` | For the lecturer: features, install, folder tree, design decisions, API table |
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
and goes to `returnArticleToReporter` in `controllers/editorController.js`.

**From a page.** The page's view is `views/<area>/<page>.ejs`; its script, if it has one, is
`public/js/<area>/<page>.js`. The view's header says which controller renders it and with which values.

**From a requirement.** The README's table ["Where each requirement lives"](../README.md#where-each-requirement-lives)
lists the files for each requirement of the project document.

## 7. Following a request from start to finish

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

Every file starts with a **header comment**: what it does, who calls it, the related files and its owner.
Every function has a **JSDoc comment**: its purpose, parameters, return value and the errors it throws.
Comments explain **why** a choice was made, often as the question a lecturer would ask ("Why one counter
per hour and not one document per view?"), including the requirement it serves and any known limit we
accepted. In EJS views these notes are EJS comments, so they never reach the browser.

So the fastest way to understand any file is to read its header, then the JSDoc of the function you are
looking at.
