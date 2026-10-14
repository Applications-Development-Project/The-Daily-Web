# The Daily Web

A news site where reporters write articles, an editor reviews and publishes them, and guests read
and comment. Built with Node.js, Express, EJS and MongoDB, following the MVC structure taught in the course.

<!--
  Shared file (see CONVENTIONS.md): first version by SM; each student adds or corrects the part
  about their own area in a small, separate pull request.
-->

## Contents

- [Main features](#main-features)
- [Technologies](#technologies)
- [Install and run](#install-and-run)
- [Demo users](#demo-users)
- [Folder structure](#folder-structure)
- [Self-check scripts](#self-check-scripts)
- [Team](#team)

## Main features

### Guests (no login)
- **Feed** of live articles, 20 at a time with infinite scroll, with search, a category filter,
  a "viewed / not viewed" filter for this device, and sorting by newest or most popular.
- **Article page** with the full text and guest comments. A guest can post at most 3 comments
  per minute from the same device; the server blocks the fourth with a clear message.
- **Weather widget** for the configured city, refreshed from OpenWeatherMap at most every 10 minutes.

### Reporters
- A **dashboard** with only their own articles and the status of each one.
- An **article editor** that **autosaves** the draft while they type, and a **Submit for approval** button.
- They can update an article that is already live: readers keep seeing the approved version until the
  editor approves the new one.

### Editor
- A **dashboard** with every article, a status filter, title search and pages of 20, without page reloads.
- A **review page**: the live version and the submitted changes side by side, with the changed fields
  marked, the publish history, and **Approve and publish** or **Return for corrections** (with a required note).
- **Delete** an article together with its comments and statistics.
- **Comment moderation**: search, edit and delete comments.
- **User management**: create, edit and delete users.
- **Impact Analytics**: find an article by title and choose a period (24 hours up to 365 days) to see its
  views on a line chart, with a numbered dashed line at every publish, so the views before and after each
  update can be compared. A live article's review page links straight to its chart. The editor can also
  reset an article's statistics.

### Article statuses

| Status | Meaning |
|---|---|
| In preparation (`draft`) | The reporter is writing |
| Awaiting approval (`pending`) | Submitted; only the editor can act on it |
| Published (`published`) | Approved and visible to readers |
| Returned for corrections (`returned`) | Sent back by the editor with a note |

The status describes the article's **working copy**. What readers see is a separate, approved copy, so a live
article stays online, unchanged, while its next version is written and reviewed.

## Technologies

- **Server:** Node.js (20.6 or newer), Express 5, EJS templates, MongoDB with Mongoose.
- **Browser:** HTML5, CSS3 and plain JavaScript (`fetch` for the Ajax calls). No front-end framework.
  Chart.js (4.5.1) draws the Impact Analytics chart; it is loaded from the cdnjs CDN on that page only,
  so the page needs an internet connection to show the chart (the numbers are shown without it).
- **Packages:** only those in `package.json`: `express`, `ejs`, `mongoose`, `express-session`,
  `connect-mongo` (sessions are stored in MongoDB, so they survive a server restart), `bcrypt`
  (password hashing) and `dotenv` (reads `.env`).

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
   | `WEATHER_API_KEY` | A free OpenWeatherMap API key. Optional: without it everything else works, and the weather widget shows "Weather unavailable" |
   | `WEATHER_CITY` | For example `Tel Aviv` |
   | `SEED_DEMO_PASSWORD` | The password every demo user will get (choose any) |

   `.env` holds secrets, so it is in `.gitignore` and never committed. Only `.env.example`, with empty values, is in the repository.

3. **Fill the database with demo data**
   ```
   npm run seed
   ```
   **Warning:** this first deletes everything in the database named in `MONGODB_URI`. It creates the demo
   users, 500+ articles in every status and category, guest comments, and 30 days of view statistics.
   The statistics are relative to the moment you run it, so run it again shortly before a demo.

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

```
The-Daily-Web/
├── server.js            Connects to MongoDB, then starts the server
├── app.js               The Express app: middleware, routers, 404 and error handling, in that order
├── config/              Database connection and session settings
├── models/              Mongoose schemas: User, Article, Comment, ArticleViewStats, DeviceArticleView
├── controllers/         One file per feature: reads the request, uses the models, sends a page or JSON
├── routes/
│   ├── pageRoutes/      Routes that render EJS pages (GET /, /login, /editor, ...)
│   └── apiRoutes/       JSON routes, all under /api (used by the pages' JavaScript)
├── middleware/          Login and role checks, device id cookie, comment limit, 404 and error handlers
├── services/            Logic shared by controllers: status rules, view counting, weather, logger
├── views/
│   ├── partials/        Head, header, footer and sidebar, shared by every page
│   ├── public/          Feed, article, login and error pages
│   ├── reporter/        Reporter dashboard and article editor
│   └── editor/          Editor dashboard, review, Impact Analytics, comments and users pages
├── public/
│   ├── css/main.css     The shared stylesheet
│   └── js/              Browser scripts, one per page; shared/apiClient.js wraps fetch for all of them
├── scripts/             The seed and the self-check scripts
├── CONVENTIONS.md       The team's code conventions
└── .env.example         Template for your own .env
```

**Request flow:** route → (middleware) → controller → model → view (EJS page) or JSON.
Permissions are checked on the server by `requireLogin` and `requireRole` before every protected
controller; hiding a button in the browser is never the protection.

## Self-check scripts

The repository has no test library (only course technologies), so the checks are small Node scripts
that use `console.assert` and print a summary.

| Script | Checks | Needs |
|---|---|---|
| `node tests/testWorkflow.js` | The status rules (which role may move an article from which status to which) | Nothing |
| `node tests/testReporterApi.js` | The reporter routes: permissions, ownership, statuses, invalid input | A running server and a test database |
| `node tests/testEditorApi.js` | The editor routes and view counting: permissions, list, approve, return, delete, statistics, invalid input | A running server and a test database |

The two API scripts create and delete articles, so they **refuse to run** unless the database name ends
with `-test`. Each script's header has the exact steps; in short (PowerShell):

```
$env:MONGODB_URI='mongodb://127.0.0.1:27017/the-web-daily-test'; $env:PORT='3098'; npm run seed
npm start                                   (in a second terminal, with the same two values)
node tests/testEditorApi.js               (back in the first terminal)
```

## Team

Every file's header comment names its owner. Each student owns one area:

| Student | Area |
|---|---|
| OS | Project skeleton, login and sessions, user management, comments and moderation, logging, the full seed |
| SM | Editor area (dashboard, review, approve, return, delete), view counting and Impact Analytics |
| SH | Public site (feed, article page), weather, shared layout and stylesheet |
| EZ | Reporter area (dashboard, editor with autosave, submit) and the article status rules |

We work with a branch per task and pull requests into `dev`; `main` receives only tested releases.
