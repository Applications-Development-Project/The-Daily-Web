# Defense notes (OS)

Everything to know before the defense of The Web Daily, in one place: what to do on the day,
what the demo data contains, and the answers to the questions the lecturer is likely to ask
about OS's code. Last updated 2026-10-11.

The same reasoning is also written as comments in the code itself, so for any file you can
open it and read the "why" next to the line.

---

## 1. Before the defense: checklist

### The day before (submission closes at 23:59 the day before the defense)

- [ ] `main` has the final version: merge `dev` into `main` with a pull request, then set `main`
      back as the default branch (`gh repo edit --default-branch main`).
- [ ] Make the zip from `main` and upload it to Moodle with the public repo link.
- [ ] **Fresh install test** on a different laptop: clone, `npm install`, copy `.env.example`
      to `.env` and fill it, `npm run seed`, `npm start`, open `http://localhost:3000`.
- [ ] Search the repo and every commit for the demo password: it must be nowhere
      (it lives only in each person's `.env`). `.env` has never been committed: it was in
      `.gitignore` from the very first commit.

### Shortly before the defense (the same day)

- [ ] **Re-seed: `npm run seed`.** The view statistics are counted back 30 days from the
      moment the seed runs, and the publish dates are relative to that moment too. An old
      seed makes the Impact Analytics chart look empty or cut off.
      The seed takes about 6 seconds.
- [ ] Re-seeding clears the `sessions` collection, so everyone is logged out. That's
      intended: the old sessions point to user ids that no longer exist. Log in again after it.
- [ ] MongoDB is running (`mongosh` connects, or the server logs "Connected to MongoDB").
- [ ] `.env` has: `MONGODB_URI`, `SESSION_SECRET`, `WEATHER_API_KEY` (without it the widget
      shows "Weather unavailable"), `WEATHER_CITY`, `SEED_DEMO_PASSWORD` (the seed refuses
      to run without it).
- [ ] Optional: delete the local `logs/` folder so the log files show only the demo.
      It is recreated when the server starts. It is in `.gitignore`.
- [ ] The demo images come from picsum.photos, so they need internet.

---

## 2. The demo data (what `npm run seed` creates)

| What | Amount |
| --- | --- |
| Users | 1 editor (`editor`, Maya Cohen) and 5 reporters (`reporter1` ... `reporter5`) |
| Password | the value of `SEED_DEMO_PASSWORD` in `.env` (never printed, never in the repo) |
| Articles | **510**: 440 live (readers can see them) and 70 never published |
| Live, by status of the working copy | 400 `published`, plus updates in progress: 15 `draft`, 15 `pending`, 10 `returned` |
| Never published | 30 `draft`, 25 `pending`, 15 `returned` |
| Categories | 55 live articles in each of the 8 categories |
| Articles updated after publishing | 110 live articles approved 2, 3 or 4 times (`publishHistory`) |
| Titles | all 440 live titles are different ("Haifa: City council approves ...") |
| Per reporter | 102 articles each |
| Comments | about 1,300-1,450 on about 70% of live articles; the rest have none |
| View statistics | about 226,000 hourly counters (about 968,000 views) for the last 30 days |

Things in the data that are useful in the demo:

- **XSS demo comment:** by `<b>Test reader</b>` with the text
  `<script>alert("hacked")</script> If you can read this tag, the page is safe.`, on the
  newest live article. In comment moderation, search `<script>` to find it. It shows as
  plain text and nothing runs.
- **Articles with no comments** show "No comments yet."
- **Articles with 4 publishes** show four markers on the analytics chart, each with a clear
  jump in views after it (for example 139 views in the 12 hours before an update and 419
  in the 12 hours after).
- **Live articles with a pending update** let you show that readers keep seeing the old
  version while the editor sees old and new side by side.
- `editor`, `reporter1` and `reporter2` must keep these usernames: EZ's test script
  (`scripts/testReporterApi.js`) logs in with them.

---

## 3. Design decisions to be able to explain

### Seed (`scripts/seed.js`)

- **Why the titles get a place in front ("Haifa: ...").** There are only 56 sample stories.
  510 articles would repeat each headline about 9 times, and a search would show 9 identical
  results. 10 places x 56 stories = 560 different titles. The first round keeps the
  original headlines.
- **Publish dates.** An article published once can be from any moment in the last 60 days
  (up to an hour ago), so sorting by date looks realistic. An article with updates is first
  published 17-27 days ago, so all its publishes (at most 3 x 4 days later) fall inside the
  chart's 30-day window. 27, not 30, leaves a margin: the chart counts its 30 days back
  from when it is opened, which can be a day or two after the seed ran. No date is in the
  future.
- **Comments** are dated between the article's first publish and now: a comment can only
  be posted on a live article.
- **Why each seeded comment has its own random device id.** A real guest's id comes from
  their own browser cookie. If all seeded comments shared one id, that id would look like a
  single device that posted 1,300 times.
- **The view statistics model** (per article, per hour): an everyday level of 1-5 views an
  hour (every 10th article 5 times more), fewer views at night (23:00-7:00 Israel time),
  plus a jump after each publish that halves every 12 hours (an update's jump is smaller
  than the first publish's, but clear), and +-30% random noise. Hours with 0 views get no
  document, exactly like real visits: `recordView` only creates a counter when a view happens.
- **`totalViews` = the sum of the article's counters,** so "sort by popularity" in the feed
  agrees with the chart.
- **The seed imports `getHourStart` from SM's `services/viewTracker.js`** instead of having its
  own copy, so seeded counters and counters from real visits round hours the same way (UTC)
  and add up in the same documents. The 30 days are SM's `DEFAULT_RANGE_DAYS`.
- **Why 226,000 documents and not one per view:** that is SM's hourly-counter design. One
  document per view would be about a million documents for the same data, and the chart
  would have to read all of them.
- **Why batches of 10,000** (`insertMany` per batch): few trips to the database, and no single
  request to MongoDB gets too big. The script never holds all the counters in memory at once.
  All 440 `totalViews` updates go in one `bulkWrite`.
- **`DeviceArticleView` is not seeded:** it records which real browser saw which article, and
  we can't know real browsers' device ids in advance.
- **The seed checks `SEED_DEMO_PASSWORD` before touching the database,** so a missing setting
  never leaves the database half cleared.
- **Each user is hashed separately:** a different random salt for each, so equal passwords
  still give different hashes.
- **`process.exitCode = 1` instead of `process.exit()`,** so the `finally` step still runs and
  closes the database connection (`disconnectFromDatabase`, which doesn't log a false
  "Lost connection").
- **It clears with `deleteMany`, not by dropping collections,** because dropping would also
  delete the indexes, including the unique ones.

### Comment moderation (`controllers/commentController.js`, `public/js/commentModeration.js`)

- **Why `findById` + `save()` and not `findByIdAndUpdate`:**
  `findByIdAndUpdate` skips the model's validators unless you pass `runValidators: true`;
  `save()` always runs them. Loading the comment first gives a clean 404 when it doesn't
  exist. Only the field we assign changes, so extra fields in the body (`authorName`,
  `deviceId`) are ignored. The cost is two database calls instead of one.
- **Why delete loads the comment first** (instead of one `findByIdAndDelete`): edit and delete
  share `findCommentById`, so they give the same 400/404 answers, and the article id is still
  available for the log line.
- **Why a RegExp search and not a MongoDB text index:** a text index matches whole words only,
  so "edit" would not find "edited", and the editor expects "contains", like the users search.
  The cost: a "contains" search can't use an index and reads every comment. Fine for
  thousands of comments; a much bigger site would use a text index.
- **Search text is escaped** before it goes into a RegExp (`escapeRegExp`), so `a.b` doesn't
  match `axb` and `(((` doesn't crash the query.
- **Why `?search[$ne]=x` can't inject a MongoDB operator:** Express 5's default query parser
  doesn't turn `[...]` into objects, and `readSearchText` refuses anything that isn't a string.
- **Why `_id` in the sort:** comments created in the same millisecond would otherwise come
  back in an undefined order, and paging could repeat or skip one.
- **`skip()` paging:** page 3 skips the first 40. MongoDB still walks past the skipped ones,
  but with 20 per page an editor never goes deep enough for that to matter.
- **`populate()`** brings in the article titles in one extra query for the whole page, not one
  per comment.
- **`select()` and `lean()`:** `select` loads only the fields we use (so `deviceId` never leaves
  the database); `lean` returns plain objects, which is faster because we only read them.
- **Only the text can be edited,** on the server and on the page: the author's name, the
  article and the date stay, so the comment still shows who wrote it and where.
- **Why the page frame is empty and the script builds the rows:** the moderation page is behind
  a login, so search engines never see it (unlike the article page, which must have its full
  text in the HTML). The script builds every page of comments the same way, the first one included.
- **Why the requests are numbered (`latestRequestNumber`, in `commentModeration.js` and, since
  2026-10-11, `userManagement.js` too):** searches are sent while the editor
  types, and answers don't always come back in order. Without it, a slow answer for "no" could
  arrive after the answer for "noa" and replace it. An answer is shown only if no newer request
  started since. Disabling the search box instead would stop the editor from typing.
- **Debouncing:** every key cancels the previous key's timer and starts a new one, so the
  search runs only after 300 ms without a key. Typing "a.b" sends one request, not three.
- **Why the list is reloaded after a delete** (instead of just removing the row): removing the
  row would leave 19 comments on the page and a wrong total. Reloading moves the next comment up
  and keeps the count and paging right. If the page became empty, it steps back one page.
- **The confirm box shows the start of the comment,** so the editor sees which one they clicked.
- **Save sends nothing if the text didn't change;** after saving, the row shows the server's
  version of the text (trimmed, exactly as saved).
- **`aria-live="polite"` and `role="alert"`:** screen readers announce "Loading...", "No comments"
  and errors when they change, without the editor moving there.
- **The table sits in a `table-scroll` box** (SH's shared class in `main.css`), so on a phone the
  table scrolls sideways inside it instead of the whole page. The same class is used on every
  table on the site (the requirements ask for a layout that works on computer, tablet and phone).
- **XSS:** everything readers typed goes in with `textContent` or `.value`, never `innerHTML`.
  Tested: a comment `<img src=x onerror="...">` by `<b>Bold</b>` stayed text and nothing ran.
- **The moderation API answer:** `{ comments, page, totalPages, totalComments }`, each comment
  `{ id, authorName, text, createdAt, article: { id, title } }`. The title is the published
  one, or the draft's if there is no published version; `article` is null only if the article
  is gone (normally impossible: deleting an article deletes its comments).

### Logging (`services/logger.js`)

- **Where lines go:** the console (as before); `logs/app.log` gets every line, INFO and ERROR,
  in order (the whole story in one file); `logs/error.log` gets only errors, each with its
  stack trace (failures are easy to find).
- **Why `app.log` uses one write stream and not `fs.appendFile`:** each `appendFile` call
  opens, writes and closes the file on its own, so two quick calls can finish in either order
  and lines could swap. A stream writes them in exactly the order given, and opens the file
  once. (Tested: 2,000 lines written as fast as possible stayed in order.) This differs from
  the plan's wording ("using fs.appendFile").
- **Why `error.log` uses `appendFileSync`:** the line is on the disk before the function
  returns. Errors are rare, so the wait costs nothing, and an error logged right before
  `process.exit(1)` (for example "Server not started: could not connect to MongoDB") is never
  lost. (Tested: with MongoDB unreachable, exit code 1 and the error is in `error.log`.)
- **"Why one file asynchronous and the other synchronous?"** Normal events are frequent and
  must never slow a request. Errors are rare and the most important to keep.
- **Logging can never crash the server:** the stream has an `'error'` listener (without one,
  Node stops the whole process on a write error), and `appendFileSync` is in `try/catch`.
  Tested with both files read-only: the program printed "Could not write to ..." and went on.
- **The folder** is created with `mkdirSync(..., { recursive: true })` once at startup (no error
  if it exists), from `__dirname`, so it doesn't depend on where the server was started.
- **What is logged:** server start; database connected and connection lost; login success,
  login failure and logout; users created, updated or deleted; new, edited and deleted
  comments; the comment limit being reached; articles submitted, approved, returned or deleted
  (EZ's and SM's controllers); every 4xx as one line; every 500 with its full stack trace.
- **Why `logInfo`/`logError` are exported as `info`/`error`:** verb-first names inside the file,
  the contract's names outside, and `logError`'s parameter can be called `error` without hiding
  a function called `error`.

### Errors (`middleware/errorHandler.js`)

- **Broken `%` in a URL** (for example `/articles/%E0%A4%A`): Express 5's router can't decode the
  parameter, stops before any controller runs, and passes on a `URIError` with `status = 400`.
  The handler used to read only `statusCode` (our team's property), so it became a 500. Now it
  reads `error.statusCode || error.status`, and the router's `URIError` gets the readable
  message "The address contains invalid characters." (instead of "Failed to decode param ...").
  A `URIError` without `status` 400 (a bug in our own code) still counts as a 500 and is logged
  with its stack trace. Found by EZ's test script.
- **4xx vs 5xx:** a 4xx is the user's mistake, so its message is safe to show and one log line
  is enough. A 500 never shows the real message (it can reveal file paths and internals); the
  details go only to the log, with the stack trace.
- **Express knows it is an error handler** because the function has four parameters.

### Users (`controllers/userController.js`, `public/js/userManagement.js`)

- **Why `findById` + `save()` in `updateUser`:** the safety rules need the user's current role
  before deciding; `save()` always runs the validators; only the fields we assign are written.
- **Why a display-name change never touches the password hash:** `findById` doesn't load
  `passwordHash` (`select: false`), and Mongoose saves only the fields that changed.
- **Why the safety rules answer 409 and not 403:** the editor IS allowed to manage users (403
  would mean they aren't). The request is refused only because of the current state of the data
  (their own account, the last editor, a reporter who still has articles). 409 = "not allowed in
  the current state".
- **Why PATCH sends only the changed fields:** PATCH means "change these parts" (PUT would replace
  the whole user). Sending an unchanged role would run the role rules for nothing, and an empty
  password box means "keep the old password".
- **The greyed-out Delete button on your own row is only a convenience;** the server refuses it
  anyway (409), because anyone can call the API without the page.
- **`autocomplete="new-password"`** stops the browser from filling in the editor's own password.
- **A taken username isn't checked first:** the unique index refuses it (error 11000 -> 409).
  Check-then-save could let two simultaneous requests both pass; the index can't be fooled.

### Login and sessions (`controllers/authController.js`, `config/session.js`)

- **Why logout is a POST:** GET requests should only read. With a GET `/logout`, any other site
  could log our users out with a plain link (a browser sends our `sameSite: 'lax'` cookie when
  someone clicks a link to us). A POST started by another site is sent without that cookie, so
  it arrives as a guest's request and `requireLogin` turns it away.
- **The server decides the redirect** (`/reporter` or `/editor`) from the role in the database;
  the login page only follows it.
- **Usernames in log lines go through `JSON.stringify`,** so a line break typed into a username
  can't fake an extra log line ("log injection"). The password is never logged.
- **The cookie is signed with `SESSION_SECRET`:** change one character and the signature no
  longer matches, so the request is treated as a guest's.
- **The session store reuses Mongoose's connection** (one pool for the whole app). It waits for
  Mongoose's `connected` event, because `app.js` is loaded before `server.js` connects;
  `asPromise()` resolves immediately with no client if `connect()` hasn't been called yet.
  An earlier version used it and only worked by luck of timing.

### Other OS code

- **`models/Comment.js`:** HTML is stored exactly as typed and made safe when shown. Escaping at
  display time always works; removing "dangerous" HTML when saving is easy to get wrong and would
  change honest text like "a < b". `deviceId` never comes from the request body: otherwise a
  guest could send a new made-up id with each comment and the limit would never apply.
- **`models/User.js`:** `unique: true` is not a validator; it makes MongoDB build a unique index,
  so the database itself refuses duplicates. bcrypt's random salt means equal passwords give
  different hashes.
- **`middleware/requireRole.js`:** a closure. `requireRole('editor')` runs once when the route file
  loads and returns `checkRole`, which runs on every request and still "remembers" the role.
- **`middleware/isApiRequest.js`:** uses `request.baseUrl + request.path`, because inside a router
  mounted at `/api`, `request.path` is relative. A first version used `request.path` alone, and
  testing every route as a guest showed `/api` calls got a redirect instead of 401 JSON.
- **`middleware/assignDeviceId.js`:** the session identifies a logged-in USER (only after login);
  the device id identifies a BROWSER, guests included. Two cookies for two jobs.
- **`middleware/commentRateLimiter.js`:** 429 is the HTTP status made for "too many requests".
  The count relies on `createdAt`, which a guest can't fake: Mongoose sets it when the comment is
  saved, and `addComment` copies only the name and text from the body. (Careful: Mongoose DOES
  accept a `createdAt` given when a document is first created; the seed relies on that. What
  protects the limit is that the controller never copies a date from the request.)
- **`public/js/articleComments.js`:** a concrete stored-XSS example: with `innerHTML`, a comment
  `<img src=x onerror="...">` would run its code in the browser of every reader who opens the
  article. `encodeURIComponent` on the article id; `apiClient` never throws (a network failure
  also comes back as `success: false`), so the button is always enabled again.
- **`views/public/login.ejs`:** `method="post"` matters even though the script sends the form: if
  the script fails to load, a GET would put the password in the address bar and history.
- **`.gitignore`:** `node_modules/` can be rebuilt from `package-lock.json`, and `bcrypt` is built
  per operating system; `logs/` is runtime output.
- **`server.js`:** exit code 1 tells whatever started the process that startup failed.
  `app.js` builds the app and `server.js` runs it, so a script can load the app without a port.
- **`app.js` middleware order:** body parsers, static files (before the session, so a stylesheet
  never costs a MongoDB lookup), session, device id, `currentUser` (needs the session; refreshes
  the role before any permission check), routers, 404 handler, `errorHandler` last.

---

## 4. Known limits (say them before the lecturer finds them)

- **Comment limit, not atomic:** counting and then saving are two steps, so two comments sent at
  exactly the same moment could both pass. A strict version needs one atomic operation per device.
- **Comment limit, cookies:** clearing cookies gives a new device id. The IP address instead would
  block a whole school or office that shares one IP.
- **Login timing:** a login with an unknown username answers a little faster (no bcrypt
  comparison), so in theory timing could reveal which usernames exist. The fix: compare against
  a dummy hash when the user isn't found.
- **"Contains" searches** (users, comments) can't use an index and read every document. Fine at
  our size; a big site would use a text index.
- **`skip()` paging** gets slower on very deep pages; editors never go that deep.
- **`setCurrentUser`** logs the display name without `JSON.stringify` (low risk: only editors set
  display names).

---

## 5. Cross-cutting topics (any student can be asked)

- **Express 5 vs 4:** rejected promises in async handlers go to the error handler by themselves
  (no try/catch); `req.body` is `undefined` without a body; `request.path` inside a router is
  relative; `app.listen`'s callback receives errors (port taken); the router marks a bad
  `%`-encoding with `error.status = 400`.
- **REST:** URLs name resources (`/api/users/:id`, `/api/articles/:id/comments`), the method names
  the action (GET reads, POST creates, PATCH changes part, DELETE removes). Every response is
  `{ success: true, data }` or `{ success: false, error }`. Codes: 200, 201 created, 400 invalid
  input, 401 not logged in, 403 not allowed, 404 not found, 409 not allowed in the current state,
  429 too many comments, 500 server error.
- **MVC:** routes say who may call what, controllers handle request and response, models hold the
  data's shape and rules, views show it, business rules live in `services/`.
- **Validation in two places:** in the browser for a quick message, on the server as the real
  check, because anyone can call the API directly (curl, Postman).
- **Security summary:** bcrypt hashes; sessions on the server with a signed `httpOnly` cookie; a
  new session id at login (session fixation) and the session deleted at logout; the role reloaded
  from the database on every request; every permission checked on the server; type checks against
  NoSQL injection; escaped search text; `textContent` and `<%= %>` against XSS; no internal details
  in 500s; secrets only in `.env`.
- **Performance with thousands of articles:** indexes on everything we filter and sort by
  (including the rate-limit count); 20 per page; `.lean()` and `.select()`; `Promise.all` for
  parallel queries; no sessions for guests; hourly view counters instead of one document per view.
- **How we tested:** Node scripts against a separate test database
  (`mongodb://127.0.0.1:27017/the-web-daily-test`, `PORT=3098`) so the real data isn't wiped; the
  real `server.js`, including real restarts; a headless Chrome driven by a script for the pages
  (typing, clicking, confirm boxes, checking nothing reloads); EZ's `testReporterApi.js` (155
  checks) and `testWorkflow.js` (73 checks).
- **Git process:** one branch per task (`os/...`) from `dev`; small commits with prefixes
  (`feat:`, `fix:`, `docs:`); pull requests into `dev`, reviewed by the rotation; `main` only
  receives `dev`; both protected by a ruleset; no AI co-author lines in commits or PRs; AI use
  declared on the course site.

---

## 6. Still open before the defense (as of 2026-10-11)

- **OS:** nothing left in the task list; PR #52 (shared `table-scroll` on the editor tables,
  ignore stale user searches) waits for review. Done on 2026-10-11: full seed; `error.ejs` and
  `editor/users.ejs` on the shared partials (#49); the lecturer approved `express-session`,
  `connect-mongo`, `bcrypt` and `dotenv` (#51); logout from the header checked on all 10 pages
  with JavaScript turned off (each goes to `/` as a guest, and the old cookie then gets 401);
  the plan updated with the moderation contract, the logger wording and the ticked tasks.
- **If the lecturer asks about the packages:** all four were approved by the lecturer before we
  relied on them for the final version. `express-session` keeps the login between requests,
  `connect-mongo` stores the sessions in MongoDB (so a restart doesn't log anyone out), `bcrypt`
  hashes the passwords, `dotenv` loads `.env`.
- **Team rule worth keeping:** run `npm run dev` before approving a pull request. On 2026-10-11,
  PR #43 was merged with `controllers/feedController.js` cut off in the middle (a syntax error),
  so the app didn't start at all on `dev`, and two more PRs were merged on top before anyone noticed.
- **SH:** the cut-off `controllers/feedController.js` was fixed in PR #47 (`dev` starts again).
  Earlier list (some of it may be fixed by PRs #43 and #47; re-check):
  the article page answers 500 for every article; the feed
  API returns only ids and doesn't escape its search (`?search=(` gives 500); both filter on
  `status: 'published'` instead of `published: { $ne: null }`; comments are looked up by the wrong
  field; `recordView` is not called (so real visits are not counted); `feed.js` uses `innerHTML`
  and links to `/article/`; reset viewed marks is still 501; `console.error` instead of
  `logger.error` in the weather service and article page; responsive and accessibility polish;
  shared CSS classes; removing the top-level `.html` mockups.
- **SM:** the editor's draft edit (`PATCH /api/editor/articles/:id/draft`, 501); the Impact
  Analytics page and chart (501, waiting on how Chart.js is loaded); the README (required for
  submission, doesn't exist yet).
- **EZ:** change her three `checkKnownIssue` calls to `checkStatus` now that the URL fix is merged;
  the "live article stays visible while being edited" check waits on SH's article page.
- **Demo checklist items that depend on the above:** the XSS demo comment on the article page and
  "View page source shows the full article" need SH's article page; the analytics chart needs
  SM's page; logout from the header on every page needs every page to use the header.
