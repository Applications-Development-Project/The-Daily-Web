# The Daily Web

A news site where reporters write articles, an editor reviews and publishes them, and guests read and
comment. Built with Node.js, Express, EJS and MongoDB (Mongoose) in the MVC pattern, with plain JavaScript
and Ajax in the browser.

For a detailed tour of the code (every file, where each requirement lives, every URL and the design
decisions), see the [guide to the code](docs/PROJECT_GUIDE.md).

<!--
  Shared file: every student adds or corrects the part about their own area in a small pull request.
  This page is for installing and using the site; explanations go in docs/PROJECT_GUIDE.md.
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

3. **Fill the database with demo data:** `npm run seed`.
   **Warning:** this first deletes everything in the database named in `MONGODB_URI`. It then creates the demo
   users, 510 articles in every status and category, about 1,400 comments and 30 days of hourly view statistics.
   The statistics end at the moment it runs, so run it again shortly before a demo.

4. **Start the server:** `npm start`, then open <http://localhost:3000>.

The weather widget and the Impact Analytics chart need an internet connection.
Logs are written to the terminal and to `logs/app.log` and `logs/error.log`.

## Demo users

Log in at <http://localhost:3000/login> with the `SEED_DEMO_PASSWORD` from your `.env`. Guests need no login.

| Username | Role |
|---|---|
| `editor` | Editor |
| `reporter1` to `reporter5` | Reporter |

## Main features

- **Guests** (no login): a feed of published articles with infinite scroll (20 at a time), search, a category
  filter, a "viewed / not viewed" filter and sorting by newest or most popular, all without reloading; the full
  article page, with related articles from the same category; comments (at most 3 a minute per device); a
  weather widget.
- **Reporters**: their own articles and statuses, with a status filter; an article editor that saves while they
  type (no Save button, nothing lost after a refresh or on another computer); submitting for approval; updating a
  live article, while readers keep the approved version until the editor approves the new one.
- **Editor**: all articles with a count per status, a status filter and search; the live version and the
  submitted changes side by side; approve, return with a note, edit or delete any article; comment moderation;
  user management.
- **Impact Analytics** (editor): an article's views over time on a chart, with a numbered dashed line at every
  publish, to compare the views before and after each update.
- **Everyone**: pages that fit a phone, a tablet and a desktop, and a light or dark theme (a button in the
  header; until the reader chooses, it follows their system, and the choice is kept in that browser).

An article's status is one of: **In preparation**, **Awaiting editor approval**, **Published**, or **Returned for
corrections**. Logins survive a server restart (sessions are stored in MongoDB).

## Project structure

The project follows MVC: **models** (data), **views** (pages), **controllers** (handle a request).

```
The-Daily-Web/
├── server.js            Starts the app: loads .env, connects to MongoDB, listens
├── app.js               The Express app: middleware, routes, 404 and error handling
├── config/              Database connection and login sessions
├── models/              Mongoose schemas: User, Article, Comment, ArticleViewStats, DeviceArticleView
├── routes/
│   ├── pageRoutes/      URLs that return pages (HTML)
│   └── apiRoutes/       URLs that return JSON, under /api
├── controllers/         One per area: feed, article page, comments, auth, users, reporter, editor, analytics, weather
├── middleware/          Login and role checks, the comment limit, the device cookie, error handling
├── services/            Shared rules: article statuses, draft rules, view counting, weather, logger
├── utils/               Small helpers: request validation, HTTP errors
├── views/               EJS pages, by area: public/, reporter/, editor/, and partials/ (header, footer...)
├── public/              Files sent to the browser: css/main.css, images/, and js/ (one script per page,
│                        plus js/shared/: the fetch wrapper, the theme and the confirm box)
├── scripts/seed.js      Demo data (npm run seed)
├── tests/               Self-check scripts
└── docs/PROJECT_GUIDE.md  A detailed guide to the code
```

## Self-check scripts

| Command | Checks |
|---|---|
| `npm run test:workflow` | Which role may move an article from which status to which |
| `npm run test:reporter`, `npm run test:editor` | The reporter and editor routes; they need a running server on a database whose name ends with `-test` (see the header of each script) |

## Team

| Student | Area |
|---|---|
| OS | Project skeleton, login and sessions, permissions, user management, comments and moderation, error handling, logging, the full seed |
| SM | Editor area (dashboard, review, approve, return, delete), view counting and Impact Analytics |
| SH | Public site (feed, article page), weather, shared layout and stylesheet |
| EZ | Reporter area (dashboard, editor with autosave, submit) and the article status rules |
