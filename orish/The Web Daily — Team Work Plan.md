# The Daily Web — Team Work Plan

@Ori Sharon

**Last updated: 2026-10-14.** What changed in this version:

- **2026-10-14 (finalization, OS with the whole team):** all four of us now work on every file together; the "Owner" lines stay in the file headers for the defense. **When this plan and the requirements document disagree, the requirements win** (rule 3 under "How to use this document"). Changes, on branch `os/chore-final-polish`: the files were reorganised (browser scripts in `public/js/public|reporter|editor/`, tests in `tests/`, shared helpers in `utils/`, a team guide in `docs/PROJECT_GUIDE.md`, see "Folder structure"); the site is named **"The Daily Web"** as in the requirements (open question 1); the weather comes from **Open-Meteo, which needs no API key** (5-minute refresh, at most 10 minutes old, widget refresh every 5 minutes); the **editor can edit every article** (requirements p.6, open question 4); bugs fixed in the feed, the article page and the weather; layout and styles cleaned up (no inline styles or scripts). See "Status on 2026-10-14".

- **2026-10-11 (OS):** OS's comment moderation, log files and full seed are done (checkboxes, dependencies table and status line updated). New contract: the comment moderation API (under "Contracts added while building"). The logger task describes how it really writes the files. **The lecturer approved `express-session`, `connect-mongo`, `bcrypt` and `dotenv`** (open question 2 closed).

- **Git:** we now work with a `dev` branch (default branch). Every branch starts from `dev` and every pull request targets `dev`; `main` only receives `dev` at the end of a phase and before submission. See "Git workflow" and hard rules 12–14.
- **No AI attribution in Git, and commits under your own GitHub account** (hard rule 14, "Setup for everyone").
- **New contracts that already exist in the code:** error convention for controllers, login response, session cookie, comment and user API shapes, the HTML of one comment, route file names. See "Contracts added while building".
- **Technical notes** about Express 5, connect-mongo 6 and Mongoose that cost us time (under "Code conventions").
- **"Status on 2026-10-10"** and **"Open questions"** sections near the end, and a status column in the dependencies table. OS's task checkboxes are updated; every student updates their own.

## Instructions for AI coding agents

This section is written for an AI coding assistant (Claude, ChatGPT or similar). If you are a human teammate, read it too: it is the contract every agent follows.

You are helping **one member** of a four-student team build "The Web Daily", a news website, as the final project of a university course in web application development. Your human will tell you which student they are: **OS, SM, SH or EZ**. If they have not told you, ask before doing anything else.

**How to use this document**

1. Read the whole document once. Then go to the section "Tasks for \<initials>" for your student and work through it **in phase order**, one task at a time.
2. "Team and file ownership" lists the files your student owns. "Shared contracts" lists the model fields, routes, response shapes and shared function signatures that all four students code against. "Code conventions" and "Git workflow" say how code is written and committed. "Setup for everyone" says what to check first, and "Dependencies and how to work around them" says what each student provides and what to do when something you need isn't ready yet.
3. The official requirements document (in Hebrew) must always be uploaded together with this plan. If it is missing, ask your human to upload it before writing any code. It is the final authority on *what* the system must do. This plan decides *how the team splits it*. **If the two disagree, follow the requirements document**, tell your human, and update this plan.

**Hard rules**

1. **Only touch your student's files.** Create or edit only files listed for your student in "Team and file ownership". The one exception is phase 0 (the skeleton), when OS and SM may create any file. If a task needs a change in someone else's file, stop and write a short message your human can send to that student, saying exactly what is needed. **Since 2026-10-14 (finalization) the whole team works on every file together**, so this rule no longer limits edits; keep each file's "Owner" line, and keep the owner's logic and "why" comments when you change their file.
2. **Never break a shared contract silently.** Use the exact model field names, route paths, query parameters, response shapes and function signatures from "Shared contracts". If a contract seems wrong or incomplete, tell your human and propose the change; don't just change it.
3. **Use only the course technologies:** HTML5, CSS with Flexbox, vanilla browser JavaScript (`fetch` for AJAX), Node.js, Express, EJS, MongoDB with Mongoose, and the packages under "Allowed packages". No React, Vue, Angular, jQuery, Bootstrap, Tailwind, TypeScript, bundlers or any other npm package. If a package would make something easier, write the small piece of code yourself instead.
4. **Write code a student can defend line by line.** The lecturer may ask any student about any line in an oral exam. Prefer simple, explicit code over short or clever code. Follow every rule in "Code conventions": header comment on every file, JSDoc on every function, comments that explain why.
5. **Explain as you go.** After writing each piece, explain to your human in plain language what it does and why, and point out anything the lecturer is likely to ask about.
6. **Small commits that show gradual progress.** The lecturer grades the Git history and wants to see the project grow step by step, so never produce a whole feature in one commit. Each commit is one small, working, self-contained change: one model, one route with its controller function, one view, one piece of client JavaScript, or one bug fix. A rough guide is a change your human can review and explain in a few minutes, usually one to three files. After each step, stop, let your human run and test it, and suggest the exact `git add` files and a commit message using the prefixes in "Git workflow". Each commit must leave the app running. Never commit `.env`, passwords, API keys or tokens.
7. **Use stubs for other students' work.** Functions owned by other students (listed under "Functions that cross between students") exist from phase 0 as stubs with their final names and parameters. Call them as they are; never reimplement another student's logic in your files.
8. **Security lives on the server.** Every permission check is done in Express middleware or controllers. Hiding a button in the browser is never enough.
9. **Handle bad input without crashing.** Validate every request body and URL parameter. Invalid input returns a clear error response; it never throws an unhandled exception.
10. **Check every piece against the requirements document.** Before writing a feature, read the parts of the requirements document that cover it. After writing it, check the code against those requirements line by line and tell your human which requirements it satisfies, and any that are still missing or only partly met. Never mark a task done if it contradicts the requirements document.
11. **Never wait on a dependency.** At the start of each task, list what it depends on from other students and check in the repo whether each piece exists as a real version or a stub. If something is missing, follow the rules in "Dependencies and how to work around them": a temporary fake in your own file marked `// TEMP`, a precise message for the owner, and another task in the meantime.
12. **Work only on your student's own branch.** Before writing code, check which branch is checked out (`git branch --show-current`). If it is `main`, `dev` or another student's branch, stop and help your human create a new branch from an up-to-date `dev`, named as in "Git workflow" (initials, type, feature: `sh/feature-feed-infinite-scroll`). One branch per task; never commit to `main`, `dev` or someone else's branch; changes reach `dev` only through a reviewed pull request, and `main` only through a pull request from `dev`.
13. **Start and end each session with `dev`.** At the start of a session, help your human pull `dev` and bring it into their branch, so they build on the team's latest work, and check in the repo which pieces from other students are now real and which are still stubs. When your human says they're stopping, make sure everything is committed in small commits, the app runs, and nothing half-finished is exposed, then help them push the branch and open a pull request into `dev` (`gh pr create --base dev`). Write the description for them: what changed, how to test it, what's still missing, and which other students can now use it.
14. **No AI attribution in Git; commits belong to your student.** Commit messages and pull request descriptions must not contain `Co-Authored-By:` lines for an AI tool or lines like "Generated with …". Several AI tools add these by default; remove them. GitHub lists every co-author as a repository contributor, and the lecturer grades each student's contribution from the Git history. Before the first commit of a session, check `git config user.name` and `git config user.email`: the email must be one that is on your student's GitHub account (see "Setup for everyone"). The course still requires declaring AI use on the course site (see "Working with AI"); that declaration is separate from Git.

## Overview

We are building "The Web Daily": a news site where guests read and comment on published articles, reporters write articles, and an editor approves, returns or deletes them and watches view statistics. The server is Node.js + Express in the MVC pattern, data lives in MongoDB through Mongoose, pages are EJS, and interactive parts use vanilla JavaScript with AJAX.

The team is four students: **OS, SM, SH and EZ**. AI writes most of the code, so the hard part is working in parallel without blocking each other, and making sure all four of us can explain every file in the defense. The plan handles that in three ways:

- **A shared skeleton first.** OS and SM build it in phase 0: the folder structure, all database models, every route file mounted, and working stubs for functions that cross between students. SH and EZ prepare standalone pieces in the meantime.
- **Fixed file ownership.** Each student owns one feature area end to end and edits only their own files, so merge conflicts are rare and nobody waits.
- **Review as learning.** A pull request is approved only when the reviewer can explain it back to the author. Phase 3 adds walkthroughs and a mock defense.

## Team and file ownership

Each student owns one feature area end to end: model, controller, routes, EJS views and client JavaScript. You only edit the files in your row.

| Student | Area | Owns these files |
| --- | --- | --- |
| OS | Platform and security | `config/*`, `models/User.js`, `models/Comment.js`, `controllers/authController.js`, `controllers/userController.js`, `controllers/commentController.js`, `middleware/*`, `services/logger.js`, `scripts/seed.js`, `public/js/public/articleComments.js`, `views/public/login.ejs`, views/public/error.ejs, views/editor/users.ejs, views/editor/comments.ejs, public/js/editor/users.js, public/js/editor/comments.js |
| SM | Editor and analytics | `models/ArticleViewStats.js`, `models/DeviceArticleView.js`, `controllers/editorController.js`, `controllers/analyticsController.js`, `services/viewTracker.js`, `views/editor/*` (except users.ejs and comments.ejs), `public/js/editor/dashboard.js`, `public/js/editor/analytics.js` |
| SH | Public site | `controllers/feedController.js`, `controllers/articlePageController.js`, `controllers/weatherController.js`, `services/weatherService.js`, `views/public/*` (except login.ejs and error.ejs, which OS owns), `views/partials/*`, `public/css/*`, `public/js/public/feed.js` |
| EZ | Reporter workflow | `controllers/reporterController.js`, `services/articleWorkflow.js`, `views/reporter/*`, `public/js/reporter/articleEditor.js`, tests/testWorkflow.js |

**Shared files** are `app.js`, `server.js`, `package.json`, `.gitignore`, `.env.example`, `models/Article.js`, `public/js/shared/apiClient.js`, `README.md` and `CONVENTIONS.md`. Change them only in a small, separate pull request and post in the group chat when you do. Adding a package to `package.json` also needs the whole team's agreement (see "Allowed packages").

Route files under `routes/` follow the same split: each student owns the route files for their controller. They are named `routes/pageRoutes/<area>PageRoutes.js` (mounted at `/`) and `routes/apiRoutes/<area>ApiRoutes.js` (mounted at `/api`), for example `feedPageRoutes.js` and `feedApiRoutes.js`. The areas are `feed`, `articlePage` (page only), `weather` (API only), `auth`, `user`, `comment`, `reporter`, `editor` and `analytics`.

**Notes on specific files.** No view has an inline script any more: the login page's script is `public/js/public/login.js` (OS). Every page uses the shared partials (`views/partials/head`, `header`, `footer`); the last two that were built before the partials existed (`views/public/error.ejs`, `views/editor/users.ejs`) were switched on 2026-10-11. When another student changes the layout of your page, they keep your logic and your "why" comments.

**Finalization (2026-10-14).** All four students now work on every file. Ownership below still says who built what (and who explains it first in the defense). New files from the finalization: `utils/*` (OS), `docs/PROJECT_GUIDE.md` (shared), `public/js/public/login.js` (OS, moved out of `login.ejs`), `public/js/editor/articleReview.js` (SM, moved out of `articleReview.ejs`), `public/js/public/weatherWidget.js` (SH, moved out of `sidebar.ejs`), `public/images/placeholder.svg` and `favicon.svg` (SH), `tests/testReporterApi.js` (EZ) and `tests/testEditorApi.js` (SM).

**Phase 0 exception.** While building the skeleton, OS and SM may create any file, including first versions of files other students will own (for example the EJS partials and service stubs). From phase 1 on, ownership is strict.

**Where cross-area pieces meet.** The article page (`views/public/article.ejs`, owned by SH) contains the comments area, but its behavior (`public/js/public/articleComments.js`) belongs to OS. They meet through fixed element ids listed in "Shared contracts". The same pattern applies everywhere: agree on the interface, then each side builds their half.

## Phases

Work moves through four phases. Phase 0 is the only time anyone waits on someone else. A phase is finished when its exit check passes for the whole team.

| Phase | Who | What gets built | Exit check |
| --- | --- | --- | --- |
| 0. Skeleton and prep | OS and SM build the skeleton; SH and EZ build standalone pieces | Repo, folder structure, all models, all routes mounted, stubs for shared functions, a basic seed, conventions file. SH and EZ: HTML/CSS mockups and standalone modules | Every student can clone, run `npm install`, copy `.env.example` to `.env`, run `npm run seed` and `npm start`, and see a list of articles in the browser |
| 1. Core features | Everyone, in parallel | The basic flow of each area works end to end, still using other students' stubs where needed | A guest sees the feed and opens an article; a reporter logs in, creates an article and submits it; an editor logs in and approves it; it appears in the feed |
| 2. Hard requirements | Everyone, in parallel | Stubs replaced with real logic; autosave, editing live articles, analytics chart, comment limit, sessions after restart, full 500-article seed, edge cases | Every item in the demo checklist (under "Defense preparation") works |
| 3. Freeze and defense prep | Everyone together | No new features. Bug fixes, README, walkthroughs, mock defense, fresh-install test, submission | Each student can explain every file; the zip and repo link are submitted |

Deadlines for each phase are agreed in the team chat; this plan intentionally has no dates.

## Setup for everyone

Every student does this once, before phase 1. An AI agent should check it at the start of a session (run `node -v` and check MongoDB is reachable) and help fix anything missing.

- [ ] **Node.js 20.6 or newer** (`node -v`; the project is tested on Node 24) and **Git**. On Windows: `winget install OpenJS.NodeJS.LTS`, then restart the editor so the new PATH is used
- [ ] **Your Git identity, before your first commit:** `git config --global user.name "<your name>"` and `git config --global user.email "<email>"`, where the email is one listed on your GitHub account (GitHub → Settings → Emails). If you prefer to keep your real email private, use your GitHub noreply address from that same page (`<id>+<username>@users.noreply.github.com`). GitHub credits a commit to an account only through this email: commits made as "Your Name <you@example.com>" (Git's default) or with an email that isn't on your account don't count as yours on GitHub
- [ ] **The repo on the `dev` branch:** after cloning, `git checkout dev` (it is the default branch, so a fresh clone is already on it)
- [ ] **MongoDB Community Server installed locally** (on Windows: `winget install MongoDB.Server`, which also starts it as a service; optional `winget install MongoDB.Shell` for `mongosh`). The team uses a local database for development, so everyone has the same, non-secret connection string `mongodb://127.0.0.1:27017/the-web-daily` and nobody shares credentials. Only if a local install is impossible, use a free personal Atlas cluster; its connection string goes only in your own `.env`, never in the repo or the group chat. The defense runs on one laptop with a local database and a fresh seed
- [ ] **Your own `.env`**, copied from `.env.example`: the local `MONGODB_URI` above; a random `SESSION_SECRET` (generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`); optionally `WEATHER_CITY`, `WEATHER_LATITUDE` and `WEATHER_LONGITUDE` (empty means Tel Aviv; the weather service, Open-Meteo, needs no API key); and `SEED_DEMO_PASSWORD`, agreed privately in the group chat
- [ ] `npm install`, `npm run seed`, `npm run dev`, then open `http://localhost:3000`. `npm install` needs no build tools: `bcrypt` 6 ships ready-made binaries for Windows, macOS and Linux

## Dependencies and how to work around them

We depend on each other's **interfaces**, not on finished code. Phase 0 puts every interface in the repo at its final path and name, so after the skeleton is merged nobody has to wait for anyone.

**Rules**

1. **Code against the contract, not the implementation.** Call shared functions, models, partials and element ids exactly as "Shared contracts" defines them. If the real version isn't merged yet, the stub answers with realistic data and your code works unchanged when the real one arrives.
2. **The skeleton must contain everything in the table below**, in the form given in the "In the skeleton" column. OS and SM check this list before merging phase 0.
3. **Before the skeleton exists** (SH and EZ in phase 0), work standalone: HTML mockups that already use the contract's element ids and CSS class names, Node modules tested with small scripts, and fake data shaped exactly like the contract's models.
4. **If you're blocked after phase 0:** pull `dev` first; if the piece is still missing, write a temporary fake **in your own file**, marked `// TEMP until <owner> merges <feature>`, and remove it before your pull request is approved. Never edit the owner's file. Send the owner a short, exact request, and meanwhile continue with another task from your list.
5. **Changing an interface:** propose it in the group chat; once agreed, the owner makes the change in a small pull request and updates "Shared contracts". Interface pull requests are reviewed and merged first.

| Provider | Interface | Used by | In the skeleton | Final version | Status on `dev`, 2026-10-10 |
| --- | --- | --- | --- | --- | --- |
| OS | `requireLogin`, `requireRole(role)` | Every protected route | Working | Phase 0 | ✅ Final |
| OS | Login, logout and the session shape `req.session.user = { id, role, displayName }` | EZ's ownership checks, SM's `publishHistory.editor`, testing any protected page | Working basic login with the seeded users | Phase 1 (login page polish) | ✅ Final |
| OS | `res.locals.currentUser` | SH's header | Working | Phase 0 | ✅ Final; also reloads role and display name from the database on every request |
| OS | `req.deviceId` from `assignDeviceId` | SH's viewed filter, SM's `recordView`, OS's comment limit | Working | Phase 2 (hardening) | ✅ Final |
| OS | `logger.info`, `logger.error` | Everyone | Working (console only) | Phase 2 (log files) | ✅ Final: console, `logs/app.log` and `logs/error.log`; `logger.warn` added on 2026-10-14 |
| OS | `errorHandler` and `views/public/error.ejs` | Everyone's `next(error)`, SH's 404s | Working | Phase 2 (extra cases) | ✅ Final, with every case from phase 2 |
| OS | `User` and `Comment` models | Everyone | Final | Phase 0 | ✅ Final |
| OS | Controllers and route files | Everyone replaces their own bodies | Placeholders returning `501` | Each owner, phase 1 | ✅ All exist; owners are replacing bodies |
| OS | Full seed data | Everyone's demo | SM's seed v1 (about 50 articles) | Phase 2 | ✅ Final: 510 articles, 1 editor and 5 reporters, about 1,400 comments, 30 days of hourly view stats (about 6 seconds to run) |
| SM | `Article`, `ArticleViewStats`, `DeviceArticleView` models | Everyone | Final | Phase 0 | ✅ Final |
| SM | `apiClient.js` | All browser scripts | Complete | Phase 0 | ✅ Final |
| SM | `views/editor/partials/editorNav.ejs` | OS's user and comment pages | Complete | Phase 0 | ✅ Final, styled as a row of links |
| SM | `recordView(articleId, deviceId)` | SH's article page | Stub that only logs | Phase 2 | ✅ Final; called by the article page on every visit |
| SH | `head`, `header`, `footer` partials and `main.css` class names | Everyone's views | Plain versions by SM | SH restyles in phases 1–2 | ✅ Merged (`head`, `header`, `footer`, `sidebar`) |
| SH | `article.ejs` with the comment element ids and script tag | OS's `public/js/public/articleComments.js` | Minimal version by SM | Phase 1 | ✅ Final: rendered on the server by its controller, comments included |
| SH | `getWeather()` | SH's weather controller | Stub with sample data | Phase 1 | ✅ Final: Open-Meteo (no key), shared copy refreshed after 5 minutes, never older than 10; the widget refreshes every 5 minutes |
| EZ | `canTransition`, `STATUS`, `STATUS_LABELS` | SM's and EZ's controllers, OS's seed | Stub: constants final, `canTransition` returns `true` | First pull request of phase 1 (already written in phase 0) | ✅ Final (EZ, PR #28) |
| EZ | Draft form field names (`title`, `summary`, `category`, `imageUrl`, `body`) | SM's editor edit page | Fixed in the contract | Phase 1 | ✅ Final; the rules are shared in `services/draftValidation.js` |

## Tasks for OS: Platform and security

OS owns the application setup, login and sessions, permissions, comments, error handling, logging and the demo data. Most other areas depend on OS's middleware, so OS's phase 0 work comes first.

### Phase 0: skeleton (shared with SM)

- [x] Create the GitHub repo, protect `main` (pull request with one approval required), add SM, SH and EZ, and create a GitHub Projects board. Protection is the "PR" ruleset, which now covers both `main` and `dev` by name
- [x] `package.json` with scripts `start` (`node server.js`), `dev` (`node --watch server.js`) and `seed` (`node scripts/seed.js`)
- [x] `.gitignore` (`node_modules/`, `.env`, `logs/`) and `.env.example` with empty `MONGODB_URI`, `SESSION_SECRET`, `PORT`, `WEATHER_CITY`, `WEATHER_LATITUDE`, `WEATHER_LONGITUDE`, SEED\_DEMO\_PASSWORD (since 2026-10-14 there is no `WEATHER_API_KEY`)
- [x] `config/database.js` (connect with Mongoose, log success or failure; also `disconnectFromDatabase()` for scripts) and `config/session.js` (session settings; see phase 2)
- [x] `server.js`: load `.env`, connect to the database, start listening, log the port
- [x] `app.js`: JSON and form body parsing, static files from `public/`, EJS view engine, session, `assignDeviceId`, mount every route file under `routes/pageRoutes/` and `routes/apiRoutes/`, a 404 handler, then `errorHandler` last
- [x] `models/User.js` and `models/Comment.js` exactly as in "Shared contracts"
- [x] Every controller file with every function from the routes table as a placeholder that returns `501 { success: false, error: "Not implemented yet" }` (or a simple placeholder page), so each owner only replaces bodies
- [x] Every route file, wired to its controller and protected with `requireLogin` / `requireRole` exactly as the routes table says
- [x] Working first versions of `requireLogin`, `requireRole`, `assignDeviceId`, `errorHandler` and `logger`; `commentRateLimiter` as a stub that just calls `next()`
- [x] Basic `views/public/login.ejs` and `views/public/error.ejs`
- [x] In `app.js`, follow "Mounting, views and CRUD coverage" in "Shared contracts": page routers at `/`, API routers at `/api`, `res.locals.currentUser` set for every view, and the 404 handler rendering `public/error` with status `404`
- [x] Test `npm install` on every teammate's operating system early, especially Windows, where `bcrypt` sometimes fails to build. If it fails, see the fallbacks under "Allowed packages". (`bcrypt` 6 ships ready-made binaries, so no build tools are needed)
- [x] **Before phase 1 starts:** ask the lecturer to approve `express-session`, `connect-mongo`, `bcrypt` and `dotenv`. Write the answer in `CONVENTIONS.md` and the group chat. If any is rejected, switch to the fallback under "Allowed packages" before anyone builds on it
- [x] **Working basic login and logout in the skeleton** (`POST /api/auth/login`, `POST /logout`, a plain `login.ejs`) using the seeded users, so EZ and SM can test protected pages from the first day of phase 1. The login page polish stays in phase 1

### Phase 1: core features

- [x] **Login** (`POST /api/auth/login`): find the user by username, compare the password with `bcrypt.compare`, and on success store `{ id, role, displayName }` in `req.session.user`. Return the redirect target (`/reporter` or `/editor`). On failure return a generic "Wrong username or password" without saying which part was wrong
- [x] **Logout** (`POST /logout`, a page route): a plain HTML form `POST`, so no JavaScript is needed on any page. Destroy the session, clear the cookie and redirect to `/`. SH puts the form in the header partial
- [x] **Login page**: a form that sends the login request with `fetch`, shows errors inline, and redirects on success. The header (SH's partial) reads `currentUser` (see "Mounting, views and CRUD coverage" in "Shared contracts") to show "Log in" for guests, or the user's name, a link to their area and the logout form when logged in
- [x] **`requireLogin`**: no `req.session.user` → `401` JSON for `/api/*` routes, redirect to `/login` for pages. **`requireRole(role)`**: wrong role → `403` JSON or the error page. The role always comes from the server-side session, never from anything the browser sends
- [x] **Comments API**: `GET /api/articles/:id/comments` (newest first) and `POST /api/articles/:id/comments`. Validate `authorName` (1–50 characters) and `text` (1–1,000 characters), check the article exists and is live, save with `req.deviceId`, and return the saved comment
- [x] **`public/js/public/articleComments.js`**: on form submit, post with `apiClient`, then add the new comment to the top of `#comment-list` without reloading the list. Insert user text with `textContent`, never `innerHTML`, so comments can't inject HTML. Show server errors in `#comment-error`
- [x] **Users API** (editor only): list with `?search=` (case-insensitive match on `username` or `displayName`) and `?page=` (20 per page), create (hash the password with `bcrypt.hash`, 10 rounds), update (a new password is hashed again), delete. Never return `passwordHash` in any response. **Safety rules**, all answered with `409` and a clear message: an editor can't delete or demote their own account; no update or delete may leave the system with zero editors; a reporter who still has articles can't be deleted or changed into an editor (reassigning their articles is out of scope)
- [x] **Comments moderation API** (editor only): `GET /api/comments?search=&page=` (search on comment text or author name, newest first, 20 per page, each with its article's title), `PATCH /api/comments/:id` (edit text) and `DELETE /api/comments/:id`
- [x] **User management page** (`GET /editor/users`, `views/editor/users.ejs`, `public/js/editor/users.js`): a table of users with a search box, a form to add a reporter or editor, inline edit of display name, role and password, and a delete button with confirmation. Everything goes through the Users API without reloading the page
- [x] **Comment moderation page** (`GET /editor/comments`, `views/editor/comments.ejs`, `public/js/editor/comments.js`): a searchable, paged list of comments with their article, inline edit and delete with confirmation, all without reloading the page. Add links to both pages in the editor's navigation (agree the markup with SM, who owns the editor dashboard)

### Phase 2: hard requirements

- [x] **Sessions survive a server restart**: store sessions in MongoDB with `connect-mongo`. Cookie settings: `httpOnly: true`, `sameSite: 'lax'`, `maxAge` 7 days. Test: log in, restart the server, refresh, still logged in
- [x] **`assignDeviceId`**: read the `deviceId` cookie by parsing `req.headers.cookie` with a small helper written in the same file (split on `;`, then on the first `=`, then `decodeURIComponent`), because we don't use the `cookie-parser` package. If there is no `deviceId`, create one with `crypto.randomUUID()` and set it with Express's built-in `res.cookie` as an `httpOnly` cookie for one year. Always set `req.deviceId`. (`express-session` reads its own cookie, so it needs no parser either.)
- [x] **`commentRateLimiter`**: the requirements limit **guests**, so logged-in reporters and editors skip the check (`if (req.session.user) return next()`). For guests, count `Comment` documents with this `deviceId` created in the last 60 seconds. If there are already 3, respond `429 { success: false, error: "You can post up to 3 comments per minute. Please wait a moment and try again." }`. Counting in the database (with an index on `{ deviceId: 1, createdAt: -1 }`) keeps the limit correct across restarts and needs no extra storage
- [x] **`logger`**: every line goes to the console and to `logs/app.log` (one write stream, so lines stay in order), and errors with their stack traces also go to `logs/error.log` (`appendFileSync`, so an error right before the process exits is never lost). The folder is created if missing. A failure to write a log never crashes the server. Log server start, database connection, login success and failure, and article status changes (other students call `logger.info`)
- [x] **`errorHandler`**: log the error, then map it to a status: malformed JSON body (`error.type === 'entity.parse.failed'`) → `400` "Invalid JSON"; Mongoose `CastError` (bad id) → `400`; `ValidationError` → `400` with the message; MongoDB duplicate key (`error.code === 11000`, for example a taken username) → `409` "Already exists"; anything else → `500` with a generic message. JSON for `/api/*`, the error page for everything else
- [x] **Full seed script** (`scripts/seed.js`): clear all collections, then create 1 editor, at least 4 reporters, at least 500 articles across all categories and all four statuses (most published), several live articles with 2–4 entries in `publishHistory`, some live articles with a pending update, comments on many published articles, and hourly view stats for the last 30 days **counted back from the moment the seed runs**, with visible changes after each publish. Import the status names from `articleWorkflow.js` instead of typing them. All demo users get the password from `SEED_DEMO_PASSWORD` in `.env`, so no password is ever written in the repo; the seed refuses to run if it is missing. Print the demo usernames at the end; the README lists the usernames and says to set `SEED_DEMO_PASSWORD`. Because the stats are relative to the run time, re-seed shortly before the defense
- [ ] Be ready to explain two known limits of the comment limit in the defense. First, counting and then inserting is not atomic, so two requests sent at exactly the same moment could both pass. Second, a user can reset their device id by clearing cookies. Both are acceptable for this project; a stricter version would need an atomic counter per device and a login-free identity such as the IP address, each with its own trade-offs

### Acceptance checks for OS

- [x] Wrong password, missing fields and unknown user all return a clean error, never a crash
- [x] Calling `/api/editor/*` as a guest returns `401`, and as a reporter returns `403`, even with Postman or `curl`
- [x] After a server restart, a logged-in user is still logged in
- [x] The fourth comment within a minute from the same browser is rejected with the message above; a different browser can still comment
- [x] A comment containing `<script>` is shown as plain text (in `public/js/public/articleComments.js`, on SH's article page with `<%= %>`, and on the moderation page; checked on 2026-10-11 with the seeded demo comment)
- [x] `npm run seed` runs from an empty database without errors
- [x] Deleting a reporter who has articles, deleting your own account, or deleting the last editor is refused with `409`
- [x] The user management and comment moderation pages search, add, edit and delete without reloading
- [x] Logging out from the header works on every page, with JavaScript turned off too (checked on 2026-10-11 in headless Chrome with JavaScript disabled, on all 10 pages that a logged-in user can open: each goes to `/`, shows "Welcome, Guest", and the old session cookie then gets 401. The login page has no logout button: a logged-in user who opens it is sent to their own area)
- [x] An unknown URL shows the shared error page with status 404
- [x] An editor can't demote or delete themselves, the last editor can't be removed, and a reporter with articles can't be made an editor; each returns `409`
- [x] A request with broken JSON returns `400`, and creating a user with a taken username returns `409`, never `500`
- [x] A logged-in editor can post more than 3 comments a minute; a guest can't
- [x] Searching the repo for the demo password finds nothing (checked in every file and every commit on 2026-10-10)

## Tasks for SM: Editor area and analytics

SM owns everything the editor does (reviewing, approving, returning, deleting) and the view statistics, from counting each view to drawing the Impact Analytics chart.

### Phase 0: skeleton (shared with OS)

- [ ] `models/Article.js`, `models/ArticleViewStats.js` and `models/DeviceArticleView.js` exactly as in "Shared contracts", including all indexes
- [ ] Stub services with their final signatures: `services/articleWorkflow.js` (`canTransition` returns `true` for now; EZ replaces it), `services/viewTracker.js` (`recordView` only logs; SM replaces it in phase 2), `services/weatherService.js` (`getWeather` returns a fixed sample object; SH replaces it)
- [ ] `public/js/shared/apiClient.js`: `get`, `post`, `patch` and `delete` helpers around `fetch` that send and parse JSON and always return `{ success, data, error }`, so a network failure looks like any other error
- [ ] First versions of `views/partials/` (`head.ejs`, `header.ejs`, `footer.ejs`, `sidebar.ejs`) and a minimal `views/public/feed.ejs` that lists 20 live articles rendered on the server. This is the **reference feature**: a complete route → controller → model → view example that everyone copies
- [ ] Seed v1 (`scripts/seed.js`): 1 editor, 2 reporters, about 50 articles in all statuses, so everyone has data from day one. OS extends it in phase 2
- [ ] `CONVENTIONS.md` (copy the "Code conventions" section of this document) and a README with install and run steps
- [ ] **Interface pieces others build against**, all at their final paths so nobody waits (see "Dependencies and how to work around them"):
  - `services/articleWorkflow.js` stub also exports `STATUS` (`{ DRAFT: 'draft', PENDING: 'pending', PUBLISHED: 'published', RETURNED: 'returned' }`) and `STATUS_LABELS`, so the seed and controllers import them from day one
  - `views/partials/header.ejs` already reads `currentUser` and contains the logout form; `head.ejs` links `public/css/main.css`, which defines the shared class names listed in "Shared contracts" (plain styles; SH restyles them later)
  - `views/public/article.ejs` minimal version with the comment element ids from "Shared contracts" and the `<script>` tag for `public/js/public/articleComments.js`
  - `views/editor/partials/editorNav.ejs` with links to `/editor`, `/editor/analytics`, `/editor/users` and `/editor/comments`
  - `public/js/shared/apiClient.js` complete (not a stub)

### Phase 1: core features

- [ ] **Editor dashboard** (`GET /editor`, `public/js/editor/dashboard.js`): a table of all articles with title, reporter, status, live or not, and last update. A status filter and a title search update the table through `GET /api/editor/articles` without reloading. Pages of 20 with next and previous buttons. Each row links to the review page
- [ ] **Review page** (`GET /editor/articles/:id`): shows the submitted content. If the article is already live, show two columns, **"Currently live"** (`published`) and **"Submitted changes"** (`draft`), and mark which fields differ. Show the reporter's name and the publish history
- [ ] **Approve** (`POST /api/editor/articles/:id/approve`): check `canTransition(status, 'published', 'editor')`; copy every field of `draft` into `published`; set `status` to `published`; clear `editorNote`; set `firstPublishedAt` if empty; set `lastPublishedAt` to now; push `{ publishedAt: now, editor: session user id }` to `publishHistory`; log it
- [ ] **Return** (`POST /api/editor/articles/:id/return`, body `{ note }`): the note is required and not empty; check the transition; set `status` to `returned` and save the note in `editorNote`. The live version, if any, stays live
- [ ] **Editor edits** (`PATCH /api/editor/articles/:id/draft`): same validation as the reporter's autosave, without the ownership check. **Any article** (requirements p.6, decided 2026-10-14): the status never changes; a draft, returned or pending article changes only its working copy; a live article with no update in progress is published at once (the editor is the approver), with a publish-history entry. Reuse the same form layout as EZ's editor page; agree the field ids with EZ
- [ ] **Delete** (`DELETE /api/editor/articles/:id`): ask for confirmation in the browser; on the server delete the article and its comments, view stats and device views
- [ ] Every editor route uses `requireRole('editor')`
- [ ] **Editor navigation**: a navigation bar shared by all editor pages with links to the dashboard, analytics, user management (`/editor/users`, OS) and comment moderation (`/editor/comments`, OS). It lives in views/editor/partials/editorNav.ejs (created in phase 0), which every editor page includes, OS's two pages too, and agree the markup with OS

### Phase 2: hard requirements

- [ ] **`recordView(articleId, deviceId)`**: compute the start of the current hour; `ArticleViewStats.updateOne({ article, hourStart }, { $inc: { views: 1 } }, { upsert: true })`; `$inc` `totalViews` on the article; upsert a `DeviceArticleView` for `(deviceId, article)`. Catch and log any error so a stats failure never breaks the article page
- [ ] Be ready to explain the design: one small counter document per article per hour instead of one document per view, so thousands of readers produce a few hundred documents a day, the chart query reads at most a few hundred rows, and `$inc` is atomic, so simultaneous views are never lost
- [ ] **Views API** (`GET /api/editor/articles/:id/views`): returns `{ buckets: [{ hourStart, views }], publishEvents: [{ publishedAt }] }`, sorted by time, for the last 30 days by default
- [ ] **Analytics page** (`GET /editor/analytics`, `public/js/editor/analytics.js`): choose an article (search by title), then draw a Chart.js line chart of views over time. Use a `linear` x-axis with millisecond timestamps and format tick labels in a callback, because Chart.js's `time` axis needs an extra date-adapter package. Mark each publish event with a vertical dashed line and a label, drawn by a small custom Chart.js plugin you write yourself (`afterDraw`), so the reader sees the views before and after each update
- [ ] Edge cases: an article with no views shows an empty-state message; an invalid id returns `400`; a deleted article returns `404`
- [ ] **Full CRUD on the stats models.** The views API accepts `?from=&to=` dates (list and search by time range), and the analytics page has a date-range picker. `DELETE /api/editor/articles/:id/views` resets an article's statistics after a confirmation (also clears its `totalViews`). Updates happen through `recordView`'s `$inc`. For `DeviceArticleView`, SH's feed reads it and offers "Reset viewed marks"; deleting an article removes both. Be ready to show this table in the defense ("CRUD coverage" in "Shared contracts")

### Acceptance checks for SM

- [ ] A reporter or guest calling any editor route gets `403` or `401`
- [ ] Approving an update to a live article changes what readers see only at that moment, and adds a marker to the chart
- [ ] Returning without a note is rejected with a clear message
- [ ] Opening an article page 10 times adds 10 views to the current hour, not 10 new documents
- [ ] The chart for a seeded article with several updates clearly shows each update and the change in views around it

## Tasks for SH: Public site

SH owns everything a guest sees: the feed with infinite scroll, search, filters and sorting, the server-rendered article page, the weather widget, and the site-wide look and responsive CSS.

### Phase 0: standalone prep (no repo needed)

- [ ] Static HTML + CSS mockups of the feed page, the article page and the login page, with a header, footer and a sidebar holding a weather widget placeholder
- [ ] Use semantic HTML5 (`header`, `nav`, `main`, `article`, `aside`, `section`, `footer`, `time`) and Flexbox. Check the layout at desktop, tablet and phone widths
- [ ] ~~Open a free OpenWeatherMap account and get an API key~~ Not needed since 2026-10-14: we use Open-Meteo, which needs no key, so the widget also works on the lecturer's computer
- [ ] Write `weatherService.js` as a standalone module and test it with a small Node script (details in phase 1)
- [ ] When the skeleton is merged, move the mockups into the EJS views and partials (rename `.html` to `.ejs`, replace sample text with EJS tags) and the CSS into `public/css/`

### Phase 1: core features

- [ ] **Feed API** (`GET /api/articles`): only live articles (`published` not null). Query parameters: `search` (case-insensitive match on `published.title`; escape regex special characters first), `category`, `viewed` (`all`, `viewed` or `unviewed`, using `DeviceArticleView` records for `req.deviceId`), `sort` (`newest` by `lastPublishedAt`, or `popular` by `totalViews`; add `_id` as a tie-breaker so pages never repeat or skip articles) and `page` (1-based). Always 20 per page. Response: `{ success: true, data: { articles: [...], hasMore } }` with the card fields listed in "Shared contracts". Use `.select()` and `.lean()` so only card fields are loaded
- [ ] Reject invalid parameter values with `400` (unknown sort, page below 1, unknown category)
- [ ] **Feed page** (`GET /`): render the first 20 articles on the server, plus the search box, category select, viewed filter and sort select
- [ ] **`public/js/public/feed.js`**: an `IntersectionObserver` watches an empty element at the bottom of the list; when it becomes visible, fetch the next page and append the cards. Any change to search (wait 300 ms after the last keystroke), filter or sort clears the list and starts again from page 1. Never start a second request while one is in progress; stop when `hasMore` is false. Show loading, "no results" and error states. Nothing reloads the page
- [ ] Each card shows title, image, summary, category, reporter name and publish date, and links to `/articles/:id`
- [ ] **Article page** (`GET /articles/:id`): render title, reporter, category, publish date, main image and the full body from `published` on the server, so the full text is in the page source without JavaScript (required for search engines). If the id is invalid, missing or not live, render the shared error page (public/error, owned by OS) with status 404. Call `recordView(article._id, req.deviceId)` on every visit
- [ ] Include the comments area using the element ids in "Shared contracts" and load `public/js/public/articleComments.js` (OS writes the script; SH renders the first comments on the server)
- [ ] **`weatherService.getWeather()`**: call Open-Meteo's current weather (free, no API key) for the place in `WEATHER_LATITUDE` / `WEATHER_LONGITUDE` (default Tel Aviv), and show `WEATHER_CITY` as its name. Keep the result and its fetch time in memory, call the API again only when it is more than 5 minutes old, and never serve a copy older than 10 minutes (with the widget's 5-minute refresh, a reader sees at most 15 minutes). If several requests arrive while a fetch is running, they share that one fetch. If the API fails, return the last good result; if there is none, return an "unavailable" result. Log failures
- [ ] **Weather API and widget** (`GET /api/weather`): returns `{ city, temperature, description, icon, updatedAt }`. The sidebar loads it with `fetch` and shows "Weather unavailable" on error. The widget refreshes every 5 minutes. With thousands of readers, the external API is still called at most once every 5 minutes, because every browser reads our cached copy
- [ ] **Header partial**: use `currentUser` (set by `app.js` for every view) to show "Log in" for guests; for a logged-in user show their name, a link to `/reporter` or `/editor` by role, and a logout button inside `<form method="post" action="/logout">`. No JavaScript needed
- [ ] **"Reset viewed marks"** button near the viewed filter: calls `DELETE /api/articles/viewed`, which deletes this device's `DeviceArticleView` records, then reloads the feed list (not the page). This completes CRUD for `DeviceArticleView`

### Phase 2: hard requirements

- [ ] Test the feed with the full 500+ article seed: every filter, sort and search combination returns correct results, scrolling never duplicates or skips cards, and responses stay fast
- [ ] Responsive polish: the sidebar moves below the content on narrow screens, images scale, nothing scrolls sideways on a phone
- [ ] Accessibility basics: `alt` text on images, labels on every form field, readable contrast, a fallback image when an article image fails to load
- [ ] Consistent styling for the reporter and editor pages too: provide shared CSS classes (buttons, forms, tables, status badges) that EZ and SM use

### Acceptance checks for SH

- [ ] "View page source" on an article page shows the full article text
- [ ] Scrolling to the bottom loads 20 more articles; searching or filtering never reloads the page
- [ ] The "unviewed" filter hides an article right after you open it and come back
- [ ] Unpublished articles never appear in the feed and their URLs return 404
- [ ] Refreshing the page many times within a few minutes causes only one call to the weather API (check the log)
- [ ] The layout works at phone, tablet and desktop widths

## Tasks for EZ: Reporter area and workflow

EZ owns the reporter's side: the dashboard, creating and editing articles, autosave, submitting for approval, and the status rules (`articleWorkflow.js`) that both reporters and editors depend on.

### Phase 0: standalone prep (no repo needed)

- [ ] **`articleWorkflow.js`** as a pure JavaScript module with no database: a transition table exactly as in "Article status rules", a function `canTransition(currentStatus, nextStatus, role)` that returns `true` or `false`, and exported constants for the four status names and their display labels
- [ ] A small Node test script (`node tests/testWorkflow.js`, plain `console.assert`, no test library) that checks every allowed transition passes and a sample of forbidden ones fail, including a reporter trying to publish
- [ ] Static HTML + CSS mockups of the reporter dashboard (my articles with status badges) and the article editor form
- [ ] The autosave logic for `public/js/reporter/articleEditor.js` against a placeholder URL (details in phase 1)
- [ ] When the skeleton is merged, replace SM's `canTransition` stub with the real module and move the mockups into `views/reporter/`

### Phase 1: core features

- [ ] **Dashboard** (`GET /reporter`, `GET /api/reporter/articles`): only the logged-in reporter's articles, newest update first, each with its status label. If the article is live and the working copy is not, also show a "Live version online" badge. For `returned` articles show the editor's note prominently
- [ ] Buttons per status: **Edit** for `draft`, `returned` and `published`; **Submit for approval** for `draft` and `returned`; nothing for `pending` (it is waiting for the editor and is read-only)
- [ ] **New article** (`POST /api/reporter/articles`): create with `status: 'draft'`, an empty `draft`, `published: null` and `reporter` set from the session (never from the request body). Return the new id; the browser then opens the edit page
- [ ] **Edit page** (`GET /reporter/articles/:id/edit`): a form with title, summary, category (a select with the fixed category list), image URL and body (textarea). It is filled from the server's `draft`, not from browser storage. If the article is live, show a note that readers keep seeing the published version until the editor approves
- [ ] **Autosave** (`public/js/reporter/articleEditor.js`): 2 seconds after the last change, send the whole `draft` with `PATCH /api/reporter/articles/:id/draft`. Show "Saving…", "Saved at 14:32" or "Not saved, retrying" (retry after a few seconds on failure). Also save when the page is being closed using `fetch` with `keepalive: true`. There is no Save button
- [ ] **Autosave on the server**: `requireRole('reporter')`; the article's `reporter` must equal the session user, else `403`; editing is allowed only in `draft`, `returned` and `published`, else `409`. If the status is `published`, first check `canTransition('published', 'draft', 'reporter')` and set `status` to `draft`; `published` is never touched. Validate lengths (title up to 200 characters, summary up to 500, body up to 50,000, a valid category, an `http(s)` image URL or empty)
- [ ] **Submit** (`POST /api/reporter/articles/:id/submit`): same ownership check; title, summary, body and category must be filled; check `canTransition(status, 'pending', 'reporter')`; set `status` to `pending`; log it

### Phase 2: hard requirements

- [ ] **Continuity test**: type, close the browser without waiting, reopen on another computer and log in, and the latest text is there
- [ ] **Live article editing**: edit a live article, submit it, and confirm the public page still shows the old version until SM's approve runs
- [ ] **Forbidden actions** all return clean errors: editing another reporter's article, editing while `pending`, submitting an empty article, and any attempt to publish (there is no reporter route for it, and `canTransition` rejects it anyway)
- [ ] Show a clear message if the session expired during editing, and keep the unsaved text on screen until the user logs in again

### Acceptance checks for EZ

- [ ] `node tests/testWorkflow.js` passes
- [ ] A reporter sees only their own articles, and gets `403` when calling the API with another reporter's article id
- [ ] Refreshing the edit page right after typing shows the latest text
- [ ] A returned article shows the editor's note, and after fixing it can be submitted again
- [ ] While an update to a live article is in progress or pending, the public page is unchanged

## Shared contracts

All four students code against these definitions. Use the names exactly as written. To change one, propose it in the group chat, get agreement, and change it in a small pull request that updates this section too.

### Data models

| Model | Fields (type) | Notes |
| --- | --- | --- |
| `User` | `username` (String, required, unique, lowercase), `passwordHash` (String, required), `displayName` (String, required), `role` (String: `reporter` or `editor`), timestamps | Never store or return the plain password |
| `Article` | `reporter` (ObjectId → User, required), `status` (String: `draft`, `pending`, `published`, `returned`; default `draft`), `draft` (content object), `published` (content object or `null`), `editorNote` (String), `firstPublishedAt` (Date), `lastPublishedAt` (Date), `totalViews` (Number, default 0), `publishHistory` (array of `{ publishedAt: Date, editor: ObjectId → User }`), timestamps | A **content object** is `{ title, summary, body, imageUrl, category }`, all Strings. The public site reads only `published`; reporters and editors edit only `draft`; approving copies `draft` into `published` |
| `Comment` | `article` (ObjectId → Article, required), `authorName` (String, required), `text` (String, required), `deviceId` (String, required), timestamps | `deviceId` is used for the 3-per-minute limit |
| `ArticleViewStats` | `article` (ObjectId → Article, required), `hourStart` (Date, required), `views` (Number, default 0) | One document per article per hour, incremented with `$inc` + `upsert` |
| `DeviceArticleView` | `deviceId` (String, required), `article` (ObjectId → Article, required), timestamps | Which device has seen which article, for the viewed / not-viewed filter |

**Indexes:** `Article`: `{ status: 1 }`, `{ reporter: 1, updatedAt: -1 }`, `{ 'published.category': 1, lastPublishedAt: -1 }`, `{ lastPublishedAt: -1, _id: -1 }`, `{ totalViews: -1, _id: -1 }`, `{ 'published.title': 1 }`. `Comment`: `{ article: 1, createdAt: -1 }`, `{ deviceId: 1, createdAt: -1 }`. `ArticleViewStats`: unique `{ article: 1, hourStart: 1 }`. `DeviceArticleView`: unique `{ deviceId: 1, article: 1 }`.

**Fixed values:**

- Categories: `Politics`, `Economy`, `World`, `Technology`, `Science`, `Health`, `Sports`, `Culture`
- Status labels shown in the interface: `draft` → "In preparation", `pending` → "Awaiting editor approval", `published` → "Published", `returned` → "Returned for corrections"
- Interface language: English

**Shared CSS classes** (defined in `public/css/main.css`, so every page can use them before SH styles them): `btn`, `btn-primary`, `btn-danger`, `form-field`, `form-error`, `data-table`, `status-badge` with `status-draft`, `status-pending`, `status-published`, `status-returned`, `card`, `page-container`, `empty-state`, `loading`.

### Article status rules

`status` describes the working copy (`draft`), not whether the article is live. An article is live whenever `published` is not `null`.

| From | To | Who | When |
| --- | --- | --- | --- |
| (new) | `draft` | Reporter | Creating an article |
| `draft` | `pending` | Reporter who owns it | Submitting for approval |
| `pending` | `published` | Editor | Approving; `draft` is copied into `published` |
| `pending` | `returned` | Editor | Returning, with a required note in `editorNote` |
| `returned` | `pending` | Reporter who owns it | Resubmitting after corrections |
| `published` | `draft` | Reporter who owns it | First autosave of an edit to a live article |

Every other transition is rejected by `canTransition()`. While a live article is back in `draft`, `pending` or `returned`, readers keep seeing the old `published` content. Editors can edit the `draft` of a `pending` article and delete any article.

**Why `published` → `draft` is allowed.** The requirements list four transitions and forbid any other, but they also require that editing a published article sends the new version through the same approval process while readers keep seeing the old one. We read the four statuses as the state of the version being worked on: when a reporter starts editing a live article, the new version is "In preparation" again, while the approved version stays in `published`. EZ and SM must both be able to explain this in the defense.

### Session and device identity

- After login, `req.session.user` is `{ id, role, displayName }`. It lives in the server-side session store (MongoDB, collection `sessions`); the browser only holds the session cookie, named `sessionId` (`httpOnly`, `sameSite: 'lax'`, 7 days). Login gives a new session id; logout deletes the session.
- On every request of a logged-in user, `middleware/setCurrentUser.js` reloads `role` and `displayName` from the `User` collection. So a role change or a deletion made in user management applies on that user's very next request (a deleted user is logged out). `id` is the user's `_id` as a string: compare it with `article.reporter.toString()`.
- Every request has `req.deviceId`, set by `assignDeviceId` from a long-lived `httpOnly` cookie named `deviceId` (a UUID, one year). Guests never get a session.

### Functions that cross between students

They exist from phase 0 as stubs with these exact names and parameters. The owner replaces the body; callers never change.

| Function | File | Owner | Used by | Returns |
| --- | --- | --- | --- | --- |
| `requireLogin` | `middleware/requireLogin.js` | OS | All protected routes | Express middleware |
| `requireRole(role)` | `middleware/requireRole.js` | OS | Reporter and editor routes | Express middleware |
| `assignDeviceId` | `middleware/assignDeviceId.js` | OS | `app.js` (all requests) | Express middleware |
| `commentRateLimiter` | `middleware/commentRateLimiter.js` | OS | Comment `POST` route | Express middleware |
| `logger.info(message)`, `logger.error(message, error)` | `services/logger.js` | OS | Everyone | Nothing |
| `canTransition(currentStatus, nextStatus, role)` | `services/articleWorkflow.js` | EZ | Reporter and editor controllers | `true` or `false` |
| `recordView(articleId, deviceId)` | `services/viewTracker.js` | SM | Article page controller | Promise; never throws |
| `getWeather()` | `services/weatherService.js` | SH | Weather controller | Promise of a weather object |
| `apiClient.get(url)`, `.post(url, body)`, `.patch(url, body)`, `.delete(url)` | `public/js/shared/apiClient.js` | Shared | All browser JavaScript | Promise of `{ success, data, error }` |

### Responses and errors

- Every JSON response is `{ success: true, data }` or `{ success: false, error: "<message a user can read>" }`.
- Status codes: `200` OK, `201` created, `400` invalid input, `401` not logged in, `403` not allowed, `404` not found, `409` not allowed in the current status, `429` too many comments, `500` server error.
- **Feed card fields** (`GET /api/articles`): `{ id, title, summary, imageUrl, category, reporterName, publishedAt, totalViews }`, plus `hasMore` beside the list.
- **Comment element ids** on the article page: `#comments` (section), `#comment-list`, `#comment-form` (with fields `authorName` and `text`), `#comment-error`. The article id is in `data-article-id` on `#comments`.

### Routes

| Method and path | Purpose | Access | Owner |
| --- | --- | --- | --- |
| `GET /` | Feed page | Everyone | SH |
| `GET /articles/:id` | Full article page, rendered on the server; records a view | Everyone | SH |
| `GET /api/articles?search=&category=&viewed=&sort=&page=` | 20 live articles for the feed | Everyone | SH |
| `DELETE /api/articles/viewed` | Reset this device's viewed marks | Everyone | SH |
| `GET /api/weather` | Cached weather for the sidebar | Everyone | SH |
| `GET /login` | Login page | Everyone | OS |
| `POST /api/auth/login` | Log in (JSON) | Everyone | OS |
| `POST /logout` | Log out (plain HTML form, redirects to `/`) | Logged in | OS |
| `GET /api/articles/:id/comments` | List an article's comments | Everyone | OS |
| `POST /api/articles/:id/comments` | Add a comment (guests rate limited) | Everyone | OS |
| `GET /editor/comments` | Comment moderation page | Editor | OS |
| `GET /api/comments?search=&page=` | Search all comments | Editor | OS |
| `PATCH /api/comments/:id`, `DELETE /api/comments/:id` | Edit or delete a comment | Editor | OS |
| `GET /editor/users` | User management page | Editor | OS |
| `GET /api/users?search=&page=`, `POST /api/users` | Search users, create a user | Editor | OS |
| `PATCH /api/users/:id`, `DELETE /api/users/:id` | Update or delete a user (safety rules in OS's tasks) | Editor | OS |
| `GET /reporter`, `GET /reporter/articles/:id/edit` | Reporter pages | Reporter | EZ |
| `GET /api/reporter/articles`, `POST /api/reporter/articles` | List my articles, create one | Reporter | EZ |
| `PATCH /api/reporter/articles/:id/draft` | Autosave the draft | Reporter (owner) | EZ |
| `POST /api/reporter/articles/:id/submit` | Submit for approval | Reporter (owner) | EZ |
| `GET /editor`, `GET /editor/articles/:id`, `GET /editor/analytics` | Editor pages | Editor | SM |
| `GET /api/editor/articles?status=&search=&page=` | All articles, 20 per page | Editor | SM |
| `PATCH /api/editor/articles/:id/draft` | Editor edits any article (a live one with no update in progress is published at once) | Editor | SM |
| `POST /api/editor/articles/:id/approve` | Publish | Editor | SM |
| `POST /api/editor/articles/:id/return` | Return with a note | Editor | SM |
| `DELETE /api/editor/articles/:id` | Delete an article and its related data | Editor | SM |
| `GET /api/editor/articles/:id/views?from=&to=` | Hourly views plus publish times in a date range | Editor | SM |
| `DELETE /api/editor/articles/:id/views` | Reset an article's statistics | Editor | SM |

Express matches routes in order, so SH's API router must define `DELETE /articles/viewed` and OS's defines only paths with `/:id/comments`; neither defines a bare `/articles/:id` API route, so `viewed` can never be read as an id.

### Mounting, views and CRUD coverage

- **Mounting.** `app.js` mounts every page router at `/` and every API router at `/api`. Inside a router file, paths are written without the `/api` prefix, exactly as in the table above (for example SH's API router defines `GET /articles` and OS's defines `GET /articles/:id/comments`). Express matches the full path, so these never collide. A router file defines only the rows its owner owns.
- **Current user in every view.** `middleware/setCurrentUser.js` (run by `app.js` before the routers) sets `res.locals.currentUser` to `req.session.user` or `null`, so every EJS view (including SH's header) can show login state without each controller passing it.
- **One error page.** `views/public/error.ejs` (OS) renders every error, including 404, with the locals `statusCode` and `message`. Controllers render it with `res.status(404).render('public/error', { statusCode: 404, message: 'Article not found' })`. There is no separate 404 view. An unknown URL gets the same page with 404, or JSON `{ success: false, error }` if the URL starts with `/api`.
- **Weather freshness.** The server refreshes its shared copy after **5 minutes** and never serves one older than **10 minutes**; the widget asks again every **5 minutes**. So what a reader sees is never more than 15 minutes old (decided 2026-10-14; it was a 10-minute cache before).

The requirements ask for full CRUD on every model. This is where each operation lives:

| Model | Create | Read, list and search | Update | Delete |
| --- | --- | --- | --- | --- |
| `User` | Users API + user management page (OS) | Users API with `?search=` (OS) | Users API, with the safety rules (OS) | Users API, with the safety rules (OS) |
| `Article` | Reporter creates (EZ) | Feed search (SH), editor dashboard search (SM), reporter dashboard (EZ) | Autosave (EZ), editor edits and approve (SM) | Editor delete (SM) |
| `Comment` | Article page (OS) | Article comments and moderation search (OS) | Moderation page (OS) | Moderation page (OS); also removed with their article (SM) |
| `ArticleViewStats` | `recordView` upsert (SM) | Views API with `?from=&to=` range and the chart (SM) | `recordView` `$inc` (SM) | Reset statistics button (SM); also removed with their article |
| `DeviceArticleView` | `recordView` upsert (SM) | Feed viewed / not-viewed filter (SH) | `recordView` upsert refreshes it (SM) | "Reset viewed marks" button (SH); also removed with their article |

### Contracts added while building

These exist in the code on `dev` and other students build on them. They follow the same change rule as everything in "Shared contracts".

**Errors from controllers.** Throw or `next()` an error with a 4xx `statusCode`, and `errorHandler` answers with that status and message: JSON `{ success: false, error }` for `/api/...`, the error page otherwise. In Express 5 an error thrown in an `async` controller reaches `errorHandler` by itself; no `try/catch` is needed.

```js
const error = new Error('Article not found.');
error.statusCode = 404;
throw error; // or: return next(error);
```

`errorHandler` also maps: broken JSON → 400 "Invalid JSON in the request body"; body over 1 MB → 400; Mongoose `CastError` → 400; `ValidationError` → 400 with the model's own messages; duplicate key (code 11000) → 409 "This <field> already exists"; anything else → 500 with a generic message (details only in the log). A 401 for API calls comes from `requireLogin`; pages redirect to `/login` instead.

**Checking ids from the URL.** Use `isValidObjectId()` from `utils/requestValidation.js` (a string of exactly 24 hexadecimal characters) and answer 400 "Invalid … id." when it doesn't match. Errors are built with `createHttpError(status, message)` from `utils/httpErrors.js`. (Mongoose 9's own `isValidObjectId` is strict too, but older versions accepted any 12-character string, so we keep one rule of our own.)

**Login.** `POST /api/auth/login` with `{ username, password }` answers `200 { success: true, data: { redirectTo } }` (`/reporter` or `/editor`), `400` "Please enter your username and password." or `401` "Wrong username or password." (the same message for an unknown user and a wrong password). A logged-in user who opens `/login` is redirected to their area.

**Comments.**
- `GET /api/articles/:id/comments` → `{ success: true, data: { comments: [...] } }`, newest first, at most 100.
- `POST /api/articles/:id/comments` with `{ authorName, text }` → `201 { success: true, data: <comment> }`. Name 1–50 characters, text 1–1,000 (trimmed). The article must be live (`published` not null), otherwise 404. Guests: a 4th comment within 60 seconds from the same device gets 429.
- A comment sent to the browser is `{ id, authorName, text, createdAt }`. `deviceId` is never sent.
- **HTML of one comment**, the same for comments rendered on the server (SH) and comments added by `public/js/public/articleComments.js` (OS). Print name and text with `<%= %>`, never `<%-`:

```html
<li class="comment">
  <p class="comment-meta">
    <span class="comment-author">Noa</span>
    <time class="comment-date" datetime="2026-10-10T10:51:34.685Z">10 Oct 2026, 13:51</time>
  </p>
  <p class="comment-text">Great article!</p>
</li>
```

  The date text is `createdAt.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })`. With no comments, `#comment-list` holds `<li class="empty-state">No comments yet.</li>`; the script removes it when the first comment is added. Load `/js/shared/apiClient.js`, then `/js/public/articleComments.js`, at the end of the page.

**Users** (editor only).
- `GET /api/users?search=&page=` → `{ success: true, data: { users: [...], page, totalPages, totalUsers } }`, sorted by username, 20 per page.
- A user sent to the browser is `{ id, username, displayName, role, createdAt }`. `passwordHash` is never sent.
- Field rules: `username` 3–30 characters, letters, digits, `.`, `-`, `_`, stored lowercase, can't be changed after creation; `displayName` 1–50; `role` `reporter` or `editor`; password 8–200 characters, stored only as a bcrypt hash (cost 10).
- `PATCH /api/users/:id` accepts any of `{ displayName, role, password }`. `DELETE` answers `{ success: true, data: { id } }`.

**Comment moderation** (editor only).
- `GET /api/comments?search=&page=` → `{ success: true, data: { comments: [...], page, totalPages, totalComments } }`, newest first, 20 per page. `search` matches the comment text or the author name (case-insensitive, escaped).
- A comment in this list is `{ id, authorName, text, createdAt, article: { id, title } }`. `title` is the published title (or the draft's if there is none); `article` is `null` only if the article no longer exists.
- `PATCH /api/comments/:id` with `{ text }` (1–1,000 characters, trimmed; only the text can change) answers the updated comment `{ id, authorName, text, createdAt }`. `DELETE /api/comments/:id` answers `{ success: true, data: { id } }`.

**Scripts that use the database** (seed, test scripts): connect with `connectToDatabase()` and finish with `disconnectFromDatabase()` from `config/database.js`, so a planned disconnect isn't logged as "Lost connection to MongoDB".

## Folder structure

We use the classic MVC layer folders the course teaches. The browser code mirrors the views: the script of
`views/<area>/<page>.ejs` is `public/js/<area>/<page>.js`, with the areas `public`, `reporter` and `editor`.
`docs/PROJECT_GUIDE.md` in the repo explains every folder; the README maps every requirement to its files.
(Reorganised on 2026-10-14.)

```
The-Daily-Web/
├── README.md, CONVENTIONS.md     # shared
├── .env.example, .gitignore      # shared — OS
├── package.json                  # shared — OS; npm start, dev, seed, test:workflow, test:reporter, test:editor
├── server.js, app.js             # shared — OS
├── config/                       # OS — database.js, session.js
├── models/                       # User.js, Comment.js (OS); Article.js (shared); ArticleViewStats.js, DeviceArticleView.js (SM)
├── controllers/                  # one per area: feed, articlePage, weather (SH); auth, user, comment (OS);
│                                 #   reporter (EZ); editor, analytics (SM)
├── routes/
│   ├── pageRoutes/               # <area>PageRoutes.js, mounted at /
│   └── apiRoutes/                # <area>ApiRoutes.js, mounted at /api
├── middleware/                   # OS — assignDeviceId, setCurrentUser, requireLogin, requireRole,
│                                 #   commentRateLimiter, notFoundHandler, errorHandler
├── services/                     # logger (OS), viewTracker (SM), weatherService (SH),
│                                 #   articleWorkflow and draftValidation (EZ)
├── utils/                        # OS — httpErrors.js, requestValidation.js, isApiRequest.js (moved from middleware/)
├── views/
│   ├── partials/                 # SH — head, header, footer, sidebar
│   ├── public/                   # feed, article (SH); login, error (OS)
│   ├── reporter/                 # EZ — dashboard, articleEditor
│   └── editor/                   # dashboard, articleReview, analytics, partials/ (SM); users, comments (OS)
├── public/
│   ├── css/main.css              # SH — the one stylesheet
│   ├── images/                   # SH — placeholder.svg, favicon.svg
│   └── js/
│       ├── shared/apiClient.js   # shared
│       ├── public/               # feed.js, weatherWidget.js (SH); articleComments.js, login.js (OS)
│       ├── reporter/             # EZ — dashboard.js, articleEditor.js
│       └── editor/               # dashboard.js, articleReview.js, analytics.js (SM); users.js, comments.js (OS)
├── scripts/seed.js               # SM (first version), OS (full version)
├── tests/                        # testWorkflow.js, testReporterApi.js (EZ); testEditorApi.js (SM)
├── docs/PROJECT_GUIDE.md         # shared — how to navigate the code
└── logs/                         # created at runtime, not committed
```

## Code conventions

The full rules live in `CONVENTIONS.md` in the repo. Paste that file into every AI session before asking for code; it is what makes four people's AI output look like one author wrote it.

**Comments**

- Every file starts with a header comment: what the file does, who calls it, and which files it relates to
- Every function has a JSDoc comment: purpose, parameters, return value, and errors it can throw
- Comments explain *why*, not just *what*. Example: "We count views in hourly buckets, not one document per view, so thousands of readers don't create millions of documents"

**Naming**

- Functions start with a descriptive verb: `submitArticleForApproval`, not `submit`
- No abbreviations: `article`, not `art`; `request`, not `req2`
- One word per concept everywhere: always "reporter" (never "writer" or "author"), always "editor"
- Models in PascalCase (`ArticleViewStats.js`), everything else in camelCase (`feedController.js`)

**Structure**

- Short functions that do one job; no clever one-liners
- Controllers handle the request and response; business rules go in `services/`; database shape goes in `models/`
- Errors are passed with `next(error)` to `errorHandler.js`, which logs them and returns a clean message. The server never crashes on bad input
- Every permission check happens on the server, even when the button is also hidden in the browser

**Allowed packages**

`express`, `mongoose`, `ejs`, `express-session`, `connect-mongo`, `bcrypt`, `dotenv`, and Chart.js in the browser. The installed versions are Express 5, Mongoose 9, EJS 7, express-session 1, connect-mongo 6, bcrypt 6 and dotenv 18; most tutorials show older versions, so check "Technical notes" below. The lecturer approved the gray ones (`express-session`, `connect-mongo`, `bcrypt`, `dotenv`) on 2026-10-11 (OS asked; also recorded in `CONVENTIONS.md`). Adding any other package needs the whole team's agreement in the group chat. AI tools often add `helmet`, `express-rate-limit`, `winston`, `joi` or `multer`; remove them. Images are stored as URLs, so we don't need upload libraries.

**Fallbacks if the lecturer rejects a package.** None of these needs a new package: hash passwords with Node's built-in `crypto.scrypt` plus a random salt instead of `bcrypt`, and load `.env` with `node --env-file=.env server.js` (Node 20.6 or newer) instead of `dotenv`. If `express-session` or `connect-mongo` is rejected, ask the lecturer what the course used for authentication and follow that. Settle this in phase 0, before login is built.

**Technical notes (learned while building)**

- **Express 5:** a rejected promise in an `async` route handler or middleware goes to `errorHandler` by itself. `req.body` is `undefined` (not `{}`) when a request has no body, so read it as `request.body || {}`. Inside a router mounted at `/api`, `request.path` is relative to the mount point (`/users`, not `/api/users`); the full path is `request.baseUrl + request.path`. `app.listen`'s callback receives an error if the port is taken.
- **connect-mongo 6:** import it as `const { MongoStore } = require('connect-mongo')`. The form `const MongoStore = require('connect-mongo')` from older tutorials gives an object without `create`.
- **dotenv 18:** `require('dotenv').config({ quiet: true })`; without `quiet` it prints a line on every start.
- **Mongoose 9:** with `timestamps: true`, `createdAt` can't be changed through Mongoose (updates to it are silently ignored). Fields with `select: false` (like `passwordHash`) are left out of every query unless you ask with `.select('+passwordHash')`. For ids from the URL, see "Checking ids from the URL" in "Contracts added while building".
- **Never pass request values straight into a query.** Check that each value is a string first: a JSON body like `{ "username": { "$ne": "" } }` would otherwise become a MongoDB operator (a NoSQL injection). Before building a `RegExp` from search text, escape its special characters, or "a.b" matches "axb" and "(" crashes the query.
- **Text from users on the page:** `textContent` in browser scripts and `<%= %>` in EJS, never `innerHTML` or `<%-`.
- **Testing without losing your data:** `npm run seed` wipes the database in `MONGODB_URI`. For test runs, point a separate server at a test database instead, for example `MONGODB_URI=mongodb://127.0.0.1:27017/the-web-daily-test` and `PORT=3098`, and seed that one.

**Working with AI**

- Ask for one small piece at a time: one controller function, one view, one model
- Read and understand every line before opening a pull request. If you can't explain it, ask the AI to explain or simplify it
- Keep a short note of where you used AI; the course requires declaring it on the course site
- Remove any `Co-Authored-By:` line or "Generated with …" line that an AI tool adds to a commit or pull request (hard rule 14). If AI co-authors have already reached `dev` or `main`, removing them means rewriting history (see "Git workflow"); it's much easier to keep them out

## Git workflow

The lecturer checks this, so every step is part of the grade. Each of us works from our own computer and our own GitHub account.

1. **Two protected branches: `dev` and `main`.** `dev` is where all work comes together, and it is the default branch on GitHub. `main` is the stable version: it only receives `dev`, through a pull request (`gh pr create --base main --head dev --title "release: phase 1"`), at the end of each phase and before submission. The "PR" ruleset protects both by name: every change goes through a pull request with one approving review, and force-pushes and deletion are blocked. Nobody pushes to either branch directly.
2. **Each student works only in their own branches, one branch per task.** Create it from an up-to-date `dev`, name it with your initials, type and feature (`sh/feature-feed-infinite-scroll`, `ez/feature-reporter-autosave`, `os/fix-comment-rate-limit-message`), push it from your own GitHub account, and merge it into `dev` only through a pull request (`gh pr create --base dev`). Never commit to `main`, `dev` or another student's branch. When the pull request is merged, delete the branch (`gh pr merge <number> --merge --delete-branch`, or the button on GitHub) and start the next task from `dev` again. If a branch needs work that isn't merged yet, start it from that branch instead and say "Depends on #<number>" in its pull request.
3. **Commit often, with a prefix:** `feat: add cursor pagination to feed API`, `fix: block reporter from publishing via API`, `docs: add install steps to README`. Merge pull requests with a normal merge (not squash), so the small commits stay visible in the history.
4. **Start every work session by pulling `dev`** (`git checkout dev`, `git pull`, then create your new branch, or merge `dev` into the branch you're continuing). This brings in everything your teammates merged since your last session, including real versions that replace stubs, and keeps conflicts small.
5. **End every work session with a pull request.** Before you stop, push your branch and open a pull request into `dev` with what you finished, even if the feature isn't complete, as long as the app runs and nothing half-done is exposed to users. In the description write what changed, how to test it, and what is still missing. The reviewer from the rotation table reviews it within a day, and once it's merged everyone can use your work by pulling `dev`. Small, frequent pull requests are how the others stop depending on stubs, and they show steady progress in the Git history. Never leave finished work sitting unmerged on your computer.
6. **Track tasks on the GitHub Projects board.** One issue per task, assigned to its owner and linked to its pull request. This is our record of who did what for the defense.
7. **Never commit secrets.** `.env` is in `.gitignore` from the first commit; only `.env.example` with empty values goes in the repo.
8. **Commits are credited to you only through your email.** Set your Git identity as in "Setup for everyone", and keep AI co-author lines out of commits and pull requests (hard rule 14).
9. **If history is ever rewritten** (a force-push to `dev` or `main`, announced in the group chat): don't run `git pull` on your old copy, because it would merge the old history back in. Run `git fetch origin`, then `git checkout dev` and `git reset --hard origin/dev` (the same for `main`), and move any unmerged branch onto the new history with `git checkout <branch>`, `git rebase origin/dev` and `git push --force-with-lease`. A rewrite needs the ruleset paused for a moment, so only do it when no pull requests are open, and tell everyone first.
10. **At submission:** merge `dev` into `main`, set `main` back as the default branch (`gh repo edit --default-branch main`) so the lecturer sees the final version first, and make the zip from `main`.

**Review rotation.** Approve a pull request only when you can explain it to its author. Before approving, also check that it targets `dev`, that its commits have no AI co-author lines, and that the author shown on GitHub is the student's own account. Reviewers rotate between phase 1 and phase 2, so everyone reads everyone's code:

| Author | Reviewer in phases 0–1 | Reviewer in phase 2 |
| --- | --- | --- |
| OS | EZ | SH |
| SM | OS | EZ |
| SH | SM | OS |
| EZ | SH | SM |

## Defense preparation

In phase 3 we stop adding features and focus on knowing the whole system. Submission is a zip of the code in Moodle plus a link to the public repo, due by 23:59 on the day before the defense; we aim to submit earlier.

- [ ] **Walkthroughs:** each student gives a one-hour screen-shared tour of their area to the other three, following one request from the browser through route, controller, service and model
- [ ] **Mock defense:** each student is questioned on an area they did not build. Ask the AI to play the lecturer and generate hard questions about specific files
- [ ] **Design decisions:** every student can explain why we chose the draft/published split, hourly view buckets, sessions stored in MongoDB, the device cookie and the known limits of the comment limit, and the weather rules (Open-Meteo without a key; a shared copy refreshed after 5 minutes and never older than 10, plus the widget's 5-minute refresh = at most 15 minutes)
- [ ] **Security decisions already in the code** (OS walks the others through them): a new session id at login (against session fixation) and deleting the session at logout; the same message for an unknown user and a wrong password; checking that request values are strings (against NoSQL injection); escaping search text before building a regular expression; `textContent` and `<%= %>` for anything users typed (against XSS); the role reloaded from the database on every request; a taken username caught by the unique index rather than a check-then-save; `passwordHash` hidden with `select: false` and a `toJSON` transform
- [ ] **Express 5 and middleware order:** why `app.js` registers static files, then the session, the device id, `currentUser`, the routers, the 404 handler and `errorHandler` in that order, and how Express recognises an error handler (four parameters)
- [ ] **README:** install and run steps, folder structure, main features
- [ ] **Fresh install test:** before submitting, one student clones the repo on a different laptop, installs, seeds and runs it, then we upload the zip and the repo link
- [ ] **Re-seed shortly before the defense.** The view statistics cover the 30 days before the seed runs, so an old seed makes the analytics chart look empty
- [ ] EZ and SM can explain why the `published` → `draft` transition exists (see "Article status rules")
- [ ] Everyone can explain the editor's edit of any article (status never changes; a live article is published at once) and why it follows the requirements over our earlier decision

**Demo checklist** (rehearse each one live before submitting)

- [ ] Feed: infinite scroll, search, category and viewed / not-viewed filters, sort by date and popularity, all without page reload
- [ ] Article page: full content visible in "View page source"; a new comment appears instantly
- [ ] Comment limit: the fourth comment within a minute from the same device is blocked with a clear message
- [ ] Permissions: a guest can't open reporter pages; a reporter can't publish or edit someone else's article, even by calling the API directly
- [ ] Autosave: type, close the browser, reopen on another computer, and the latest text is there
- [ ] Editing a live article: readers still see the old version until the editor approves; the editor sees old and new side by side
- [ ] Analytics: the views chart shows clear markers at each update's publish time
- [ ] Server restart: stop and start the server while logged in, and keep working without logging in again
- [ ] Weather: the widget works with no key, shows "Updated 14:32", and the server calls the weather API at most once every 5 minutes (check the log)
- [ ] Seed data: 500+ articles across all statuses and categories, several reporters, an editor, comments, articles with several updates, and enough view history for the chart
- [ ] Full CRUD: the editor searches, adds, edits and deletes users and comments from their pages without reloading; deleting a reporter who has articles is refused
- [ ] Logout from the header works on every page; an unknown URL shows the error page with status 404

## Status on 2026-10-10

A snapshot so every student's AI agent knows where the team stands. Check the repo before relying on it; each student updates their own line.

| Student | Merged into `dev` | Still to do |
| --- | --- | --- |
| OS (updated 2026-10-11) | Everything in phase 0. Phase 1: login, logout, login page, `requireLogin`/`requireRole`, Comments API and `public/js/public/articleComments.js`, Users API and user management page, comment moderation (API and page). Phase 2: sessions in MongoDB, `assignDeviceId`, the real comment rate limit, the full `errorHandler` (also 400 for a broken `%` in a URL), log files, the full seed. Also: `setCurrentUser` reloads the role on every request; comments in every OS file explaining the design for the defense Nothing left in OS's task list. PR #52 (shared `table-scroll` on the editor tables, ignore stale user searches) waits for review. Done on 2026-10-11: `error.ejs` and `editor/users.ejs` on the shared partials (#49), the lecturer approved the four packages, logout checked on every page with JavaScript off |
| SM | All three models, service stubs, `apiClient.js`, `editorNav.ejs`, seed v1, `CONVENTIONS.md`, the real `recordView`, and the editor API (list with filter and search, approve, return, delete) | Editor dashboard and review pages, the editor's draft edit (`PATCH /api/editor/articles/:id/draft`), views API, analytics page and chart, statistics reset, README |
| SH | Weather service (10-minute cache) and `GET /api/weather`, `main.css` with the shared classes, partials (`head`, `header`, `footer`, `sidebar`), `feed.ejs` and `article.ejs` as static mockups | Feed API and page, `public/js/public/feed.js` (infinite scroll, search, filters, sort), the article page rendered by its controller with `recordView`, weather widget, reset viewed marks, styles for `.editor-nav` and disabled buttons, responsive polish, removing the top-level `.html` mockups |
| EZ | Nothing yet | All of EZ's tasks. **The real `canTransition` blocks the whole workflow**: until it's merged, SM's approve accepts any status. The phase 1 exit check needs the reporter area |

Phase 0's exit check ("see a list of articles in the browser") and phase 1's exit check both still wait on the feed (SH) and the reporter area (EZ).

## Status on 2026-10-14

Every task in every student's list is merged into `dev` or on the finalization branch `os/chore-final-polish` (pull request into `dev`). On that branch, every self-check passes: `npm run test:workflow` (73), `test:reporter` (158) and `test:editor` (191), plus browser checks of the feed, the article page and every editor and reporter page at desktop and phone width.

Fixed during the finalization: a repeated feed parameter (`?search=a&search=b`) answered 500; the feed loaded each card's full body; a filter change made while a feed page was loading was lost; the article body showed as one block of text; the article page showed 10 comments while the API sends 100; "Defense Question" HTML comments were visible in the page source; the weather service called a missing `logger.warn` and stayed broken after one failure; editor and reporter pages had no padding; an unknown username was answered faster than a wrong password.

What is left: the walkthroughs, the mock defense, the fresh-install test on another laptop, a re-seed shortly before the defense, merging `dev` into `main` and submitting (see "Defense preparation").

## Open questions

Decide these in the group chat; the owner then updates this plan.

1. **Site name.** The requirements call the site "The Daily Web"; this plan and the code say "The Web Daily" (and the database is `the-web-daily`). Pick one before the final styling. **Decided 2026-10-14:** "The Daily Web", as in the requirements (the requirements win). Only the visible name changed; the package and database names stay `the-web-daily`.
2. ~~**Lecturer approval** of `express-session`, `connect-mongo`, `bcrypt` and `dotenv` (OS).~~ **Decided 2026-10-11:** all four approved; no fallback needed.
3. **Weather freshness while a page stays open (SH).** The server's copy is never more than 10 minutes old, but a widget loaded once and left open for more than 15 minutes shows older data than the requirements allow. Refreshing the widget every few minutes (`setInterval` + `fetch`) would close the gap. **Decided 2026-10-11 (PR #54):** `public/js/public/feed.js` reloads the widget every 5 minutes, so what a reader sees is at most 10 + 5 = 15 minutes old. **Changed 2026-10-14:** the refresh moved to `public/js/public/weatherWidget.js` (so the article page refreshes too), and the server never serves a copy older than 10 minutes, even when the service is down.
4. **What status a live article gets when the editor edits its draft (SM).** `PATCH /api/editor/articles/:id/draft` is allowed for `pending` articles; decide and document what happens if it is used on a `published` article. **Decided by SM and EZ:** the editor may edit the draft only while the article is `pending`, and the status stays `pending`; any other status answers 409. **Changed 2026-10-14:** the requirements (p.6) say the editor can edit all articles, and the requirements win: the editor edits any article, the status never changes, and a live article with no update in progress is published at once (`editArticleDraft` in `editorController.js`).
5. **Layout changes to other students' pages.** SH converted `views/public/login.ejs` (OS) to the partials, which was welcome, but it removed the script's "why" comments and added inline `style` attributes. Agree that layout work keeps the owner's comments and puts styles in `main.css`. **Partly done 2026-10-11:** OS restored the comments (PR #30); `main.css` now has shared classes (`table-scroll`, `two-column`), which the editor pages use; the inline styles in `login.ejs` and the shared header are still there. **Done 2026-10-14:** no view has a `style` attribute or an inline script any more; everything is in `main.css` and `public/js/`.
