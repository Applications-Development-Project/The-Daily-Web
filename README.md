# The Daily Web

A news site where reporters write articles, an editor reviews and publishes them, and guests read and
comment. Built with Node.js, Express, EJS and MongoDB (Mongoose) in the MVC pattern, with plain JavaScript
and Ajax in the browser.

For a tour of the code (every folder, where each requirement lives, every URL and the design decisions),
see the [guide to the code](docs/PROJECT_GUIDE.md).

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

## What to try

1. **As a guest** (no login): scroll the feed (20 articles at a time), search, filter by category or "not viewed
   yet", sort by most popular; open an article and post a comment (at most 3 a minute). The sidebar shows the weather.
2. **As `reporter1`**: create an article. It saves itself while you type (no Save button), even after a refresh
   or from another computer. Submit it for approval, or update an article that is already live: readers keep the
   approved version until the editor approves the new one.
3. **As `editor`**: filter the dashboard by "Awaiting editor approval", open an article to see the live version
   and the submitted changes side by side, then approve it or return it with a note. The editor can also edit or
   delete any article, moderate comments and manage users.
4. **Impact Analytics** (editor): pick an article and a period to see its views on a chart, with a numbered dashed
   line at every publish.

An article's status is one of: **In preparation**, **Awaiting editor approval**, **Published**, or **Returned for
corrections**.

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
