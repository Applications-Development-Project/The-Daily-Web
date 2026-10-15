# The Daily Web

A news site where reporters write articles, an editor reviews and publishes them, and guests read and
comment. Built with Node.js, Express, EJS and MongoDB (Mongoose) in the MVC pattern, with plain JavaScript
and Ajax in the browser.

- **New to the code?** The [guide to the code](docs/PROJECT_GUIDE.md) explains every folder and kind of file,
  follows a request from the browser to the database and back, and lists every page and API URL.
- **How we write code:** [CONVENTIONS.md](CONVENTIONS.md).

<!--
  Shared file: every student adds or corrects the part about their own area in a small pull request.
  Longer explanations go in docs/PROJECT_GUIDE.md, so this page stays short.
-->

## Install and run

You need **Node.js 20.6 or newer** and **MongoDB** running on your computer (`mongodb://127.0.0.1:27017`).

1. **Get the code and install the packages**
   ```
   git clone https://github.com/Applications-Development-Project/The-Daily-Web.git
   cd The-Daily-Web
   npm install
   ```
   Newer npm versions may warn that `bcrypt`'s install script was not run. That is safe: `bcrypt` ships
   ready-built files for Windows, Mac and Linux.

2. **Create `.env`** by copying `.env.example` (`copy .env.example .env` on Windows, `cp` on Mac / Linux),
   then fill it in:

   | Variable | Value |
   |---|---|
   | `MONGODB_URI` | `mongodb://127.0.0.1:27017/the-web-daily` |
   | `SESSION_SECRET` | A long random text: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
   | `SEED_DEMO_PASSWORD` | The password every demo user will get (choose any) |
   | `PORT`, `WEATHER_CITY`, `WEATHER_LATITUDE`, `WEATHER_LONGITUDE` | Optional. Empty means port 3000 and the weather of Tel Aviv |

   `.env` holds secrets, so it is in `.gitignore` and never committed.

3. **Fill the database with demo data:** `npm run seed`.
   **Warning:** this first deletes everything in the database named in `MONGODB_URI`. It then creates the demo
   users, 510 articles in every status and category, about 1,400 comments and 30 days of hourly view statistics.
   The statistics end at the moment it runs, so run it again shortly before a demo.

4. **Start the server:** `npm start`, then open <http://localhost:3000>.
   While developing, `npm run dev` restarts the server whenever a file changes.

The weather widget and the Impact Analytics chart (Chart.js from a CDN) need an internet connection.
Logs are written to the terminal and to `logs/app.log` and `logs/error.log`.

## Demo users

Log in at <http://localhost:3000/login> with the `SEED_DEMO_PASSWORD` from your `.env` (no password is written
anywhere in the repository). Guests need no login.

| Username | Role | Name |
|---|---|---|
| `editor` | Editor | Maya Cohen |
| `reporter1` to `reporter5` | Reporter | Dana Levi, Omer Ben-David, Noa Friedman, Yossi Mizrahi, Tamar Avraham |

## Main features

**Guests** (no login)
- A **feed** of live articles, 20 at a time with infinite scroll, with search, a category filter, a "viewed / not
  viewed" filter for this browser and sorting by newest or most popular, all without reloading the page.
- The **article page**, rendered on the server so search engines can read it, with guest **comments** that appear
  at once (at most 3 a minute from the same device).
- A **weather widget** (Open-Meteo, no API key needed) that is never more than 15 minutes old.

**Reporters**
- A **dashboard** of their own articles, with each one's status and the editor's note on a returned article.
- An **article editor** that **autosaves** while they type (no Save button), so nothing is lost after a refresh,
  a closed browser or on another computer, and a **Submit for approval** button.
- Updating a live article: readers keep the approved version until the editor approves the new one.

**Editor**
- A **dashboard** of every article, with a status filter, title search and pages of 20.
- A **review page**: the live version and the submitted changes side by side with the changed fields marked,
  the publish history, and **Approve and publish** or **Return for corrections** (with a required note).
- **Edit any article** (a live article with no update in progress is published at once, after a confirmation)
  and **delete** an article together with its comments and statistics.
- **Comment moderation** and **user management** (search, create, edit, delete), with safety rules such as
  never deleting the last editor.
- **Impact Analytics**: an article's views over a chosen period (24 hours to 365 days) on a line chart, with a
  numbered dashed line at every publish, to compare the views before and after each update.

| Article status | Meaning |
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

## Design decisions in short

Each one is explained in a comment next to its code, and in more detail in the guide's
[section 10.4](docs/PROJECT_GUIDE.md#104-what-everyone-must-be-able-to-explain).

- **Two copies of each article:** everyone edits `draft`, the public site reads only `published`, and approving
  copies one into the other. "Live" means `published` is not null, whatever the status. (`models/Article.js`)
- **`published` → `draft` is an allowed transition**, because an edited live article must be approved again
  while readers keep the old version. (`services/articleWorkflow.js`)
- **Hourly view counters** with an atomic `$inc` + `upsert`: at most 24 small documents per article per day,
  however many readers, and no view is lost. (`models/ArticleViewStats.js`, `services/viewTracker.js`)
- **Sessions stored in MongoDB**, so a login survives a server restart; a separate `deviceId` cookie identifies a
  guest's browser for the comment limit and the viewed filter. (`config/session.js`, `middleware/assignDeviceId.js`)
- **Permissions only on the server:** the role comes from the session and is reloaded from the database on every
  request. (`middleware/requireRole.js`, `middleware/setCurrentUser.js`)
- **Injection and XSS:** every request value is type-checked, search text is escaped before it becomes a regular
  expression, and user text is shown with `textContent` and `<%= %>`. (`utils/requestValidation.js`)
- **Thousands of articles:** pages of 20, only the shown fields, and indexes that match each list's filter and
  sort. (`models/Article.js`)
- **Weather at most 15 minutes old:** one shared copy on the server, never older than 10 minutes, plus the
  widget's 5-minute refresh. (`services/weatherService.js`)

## Technologies

- **Server:** Node.js (20.6 or newer), Express 5, EJS templates, MongoDB with Mongoose.
- **Browser:** HTML5, CSS3 with Flexbox and plain JavaScript (`fetch` for Ajax); no front-end framework.
  Chart.js 4.5.1 draws the analytics chart, loaded from the cdnjs CDN (with an integrity hash) on that page only.
- **Packages:** only those in `package.json`, all approved by the lecturer: `express`, `ejs`, `mongoose`,
  `express-session` and `connect-mongo` (sessions in MongoDB), `bcrypt` (password hashing), `dotenv` (reads `.env`).

## Self-check scripts

There is no test library (only course technologies), so the checks are small Node scripts that print a summary.

| Command | Checks |
|---|---|
| `npm run test:workflow` | Which role may move an article from which status to which (needs nothing else) |
| `npm run test:reporter` | The reporter routes: permissions, ownership, statuses, invalid input |
| `npm run test:editor` | The editor routes and view counting: permissions, list, edit, approve, return, delete, statistics |

The two API scripts need a running server, and they **refuse to run** unless the database name ends with
`-test`, because they create and delete articles. Each script's header has the exact steps; in short (PowerShell):

```
$env:MONGODB_URI='mongodb://127.0.0.1:27017/the-web-daily-test'; $env:PORT='3098'; npm run seed
npm start                                   (in a second terminal, with the same two values)
npm run test:editor                         (back in the first terminal)
```

## Team

Each student built one area, named as the owner in each file's header. In the final stage everyone
reviewed and polished every area.

| Student | Area |
|---|---|
| OS | Project skeleton, login and sessions, permissions, user management, comments and moderation, error handling, logging, the full seed |
| SM | Editor area (dashboard, review, approve, return, delete), view counting and Impact Analytics |
| SH | Public site (feed, article page), weather, shared layout and stylesheet |
| EZ | Reporter area (dashboard, editor with autosave, submit) and the article status rules |

We work with a branch per task and pull requests into `dev`; `main` receives only tested releases.
