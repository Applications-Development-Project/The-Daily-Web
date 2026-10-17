# Defense study: handoff for a new conversation

Written 2026-10-17. Paste the prompt at the bottom into a new Claude Code conversation (in the
The-Daily-Web folder) to continue exactly where we stopped.

---
I'm OS, preparing for the oral defense of our project The Daily Web. We're in the middle of a part-by-part study plan. Read C:\Users\orizx\Documents\Git_Repositories\Defense-study-handoff.md first and follow its rules exactly (one part per response, wait for me, no terms before they're taught). Then start Part 7: MVC in this project.
---


## 1. Who and what

- The user is **OS**, one of four students (OS, SM, SH, EZ) who built **"The Daily Web"**, a news
  site, as the final project of the course *Web Application Development* (פיתוח אפליקציות
  אינטרנטיות, 654005). Stack: Node.js, Express 5, EJS, MongoDB with Mongoose 9, vanilla browser
  JavaScript with fetch, HTML5, CSS with Flexbox; packages express-session, connect-mongo, bcrypt,
  dotenv (approved by the lecturer); Chart.js from a CDN; Open-Meteo for the weather.
- The code is finished. We are **preparing the user for the oral defense**: the lecturer may ask
  any student about any line of the whole project, operates the system, and grades the defense,
  code quality, look, UX, stability, teamwork (Git history) and the technical requirements.
- Files:
  - Repo: `C:\Users\orizx\Documents\Git_Repositories\The-Daily-Web`
  - Project requirements (Hebrew PDF): `C:\Users\orizx\Documents\Git_Repositories\דרישות פרויקט מסכם - סמסטר קיץ.pdf`
  - Course syllabus (Hebrew PDF): `C:\Users\orizx\Documents\Git_Repositories\פיתוח אפליקציות סמסטר ג 2026.docx.pdf`
  - The code guide with a defense section (demo script, likely Q&A): `docs/PROJECT_GUIDE.md` in the repo
  - Older OS notes: `C:\Users\orizx\Documents\Git_Repositories\OS-defense-notes.md` (from 2026-10-11;
    partly outdated, e.g. it still mentions `WEATHER_API_KEY`, but the weather now uses Open-Meteo with no key)
- The syllabus topics, in order: Intro to web development, HTML, Intro to CSS, Flexbox, DOM
  manipulation using JS, Node.JS, Model-View-Controller, EJS, Ajax + event loop, MongoDB, Mongoose,
  Authentication, Advanced Node.JS. There are no lecture slides on disk; if the user shares
  slides, match the lecturer's terms.

## 2. How we work (the user's rules, follow them exactly)

1. **One part per response.** Explain the part in detail, end with "questions to expect" and
   about six self-check questions, then **stop and wait** until the user says they understood
   (or answers). Never move to the next part on your own.
2. **Grade the user's answers** one by one with ✅ / ⚠️ / ❌, say what is missing, and give the
   complete model answer for anything weak. Then ask whether to continue.
3. **Never use a term before it has been taught.** If something from a later part can't be
   avoided, name it as a black box ("explained in Part X") and don't build an explanation on it.
   When the user asks about something that a later part covers, say so in one line and **don't
   answer it yet** (the user asked for this explicitly, e.g. "what is EJS?" was deferred to Part 8).
   The "questions to expect" may only use topics already covered.
4. **Plain language, concrete examples from our own code** (real file names, real lines), small
   diagrams and tables. The user is learning the concepts, not only the project.
5. **Ground every claim in the real code or the real database**: read the file before explaining
   it; check facts (counts, behaviour) instead of answering from memory.
6. Side requests (bug fixes, page tweaks): branch from `dev`, keep changes small with why-comments
   in the code, give the user short `git add / commit / push` commands (the user commits and pushes,
   no AI attribution lines), and after they push, open the PR into `dev` with `gh pr create`.

## 3. The plan and where we are

| # | Part | Syllabus topic | Status |
|---|---|---|---|
| 1 | Client, server and HTTP | Intro to web development | ✅ Done |
| 2 | HTML5 and semantic tags | HTML | ✅ Done |
| 3 | CSS, Flexbox, responsive layout | Intro to CSS, Flexbox | ✅ Done |
| 4 | DOM manipulation and events | DOM manipulation using JS | ✅ Done |
| 5 | Node.js: runtime, modules, npm, `.env` | Node.JS | ✅ Done |
| 6 | Express: routing, middleware, request and response | (Node.JS / MVC) | ✅ Done, recap of 1-6 done |
| **7** | **MVC in this project** | **Model-View-Controller** | **⬅ NEXT** |
| 8 | EJS | EJS | |
| 9 | Ajax, Promises, async/await, the event loop | Ajax, eventloop | |
| 10 | MongoDB: documents, queries, operators, indexes | MongoDB | |
| 11 | Mongoose: schemas, validation, queries | Mongoose | |
| 12 | Authentication: cookies, sessions, bcrypt, roles | Authentication | |
| 13 | Advanced Node: errors, logging, external API, caching | Advanced Node.JS | |
| 14 | The article workflow (draft / published copies, statuses, transitions) | Project core | |
| 15 | Views counting and the analytics chart | Project core | |
| 16 | Security, performance, Git and teamwork, demo day | Defense | |

**Deferred, come back to it at the right time:**
- **"What's the difference between `request.session` / `request.session.user` and `currentUser`
  (`response.locals.currentUser`, set by `middleware/setCurrentUser.js`)?"** The user asked and did
  not understand, because the explanation relied on views/templates (Part 8), controllers (Part 7)
  and sessions (Part 12). **Re-explain it right after Part 12**, briefly, using what they then know.
  The core: the session is the server's stored record of who is logged in (read by the permission
  checks); `currentUser` is the same user handed to every view through `response.locals` for display
  only (the header), because views can't read `request`; `setCurrentUser` also refreshes the role
  from the database on every request so a demotion applies at once.
- Avoid "controller", "view/template", "render", "model", "schema", "session store" as known terms
  until their parts.

## 4. What the user now knows (so you can build on it)

- **Part 1:** client/server; URL parts and where each is in the request (method+path+query in the
  request line, host/port in the Host header, protocol = how the connection was opened, fragment
  never sent); request/response anatomy; GET/POST/PATCH/DELETE and REST; status codes incl.
  401 vs 403 vs 409; HTTP is stateless, cookies (`sessionId`, `deviceId`, httpOnly, sameSite);
  JSON and the `{ success, data }` / `{ success, error }` envelope; server-rendered vs
  script-filled pages (article page for search engines, dashboard for no-reload, feed both).
- **Part 2:** HTML elements/attributes, head vs body (viewport, description), semantic tags and
  where each is used, headings, links/images (alt, lazy), forms (label for/id, name, input types,
  required/maxlength = convenience only), a form's default submit reloads the page, button
  type="submit" is the default inside a form, method="post" on login, the logout form works without
  JS, tables (thead/tbody/th scope), aria attributes, data-* attributes, scripts at the end of body.
  Also: frontend vs backend in this project (public/ and the HTML are frontend; everything Node
  runs is backend; views/*.ejs are "the bridge", details deferred to Part 8).
- **Part 3:** one stylesheet, selectors, cascade/specificity, box model and border-box, units,
  CSS variables, display values, visually-hidden vs hidden, Flexbox (container/items, axes,
  justify-content, align-items, gap, wrap, flex: 3/1, min-width: 0, margin-top: auto), the five
  real layouts, responsive (viewport, flexible pieces, one media query at max-width 768px).
- **Part 4:** the DOM, finding/reading/changing/creating elements, textContent vs innerHTML (XSS),
  events (click, submit, input, change, DOMContentLoaded), preventDefault, DOMContentLoaded,
  the comment-posting walkthrough, confirm, location, debounce, IntersectionObserver (plain words).
- **Part 5:** Node vs browser JS, running programs and npm scripts, modules (require/module.exports,
  three kinds of require, a module runs once and is shared, e.g. the weather cache), built-ins
  (crypto, fs, path, __dirname, process, fetch), package.json/lock/node_modules, the 7 packages,
  semver ^, env variables, .env/.env.example/.gitignore, dotenv first line, server.js startup.
- **Part 6:** what Express adds, request/response properties, routes and routers, mounting at `/`
  and `/api`, page routes vs API routes (who calls, what they answer, redirect vs 401 JSON, the
  `/api` prefix is how `isApiRequest` decides), middleware and next()/next(error) (Express calls the
  next function with the same objects), requireLogin, requireRole as a function that returns a
  middleware (runs once at startup; checkRole runs per request; closure), the app.js order and why,
  the error handler (four parameters, why `next` must stay), the 404 handler, Express 5 differences,
  three traced requests.

**Weak spots seen in the user's answers (reinforce them):** answer with the specific place in our
project, not only the rule; always state the consequence ("and so..."); after "the requirements say
so" add "and the reason is..."; give both halves of a comparison.

## 5. Facts established in this conversation

- **The user's local database is stale**: on 2026-10-16 it held the old first seed (50 articles,
  0 comments). They were told to run `npm run seed` (needs `SEED_DEMO_PASSWORD` in `.env`; it
  deletes everything in that database). Check whether they did before demos.
- The current seed: 6 users (`editor` = Maya Cohen, `reporter1`..`reporter5`), all with the
  password from `SEED_DEMO_PASSWORD` (hashed with bcrypt per user, never in a file; the team
  agreed on it privately, mainly so the test scripts and defense-day logins are the same everywhere);
  510 articles = 70 never published (draft 30, pending 25, returned 15) + 440 live (400 published,
  plus 40 with an update in progress); comments on each live article with a 70% random chance
  (1-6 each, every 25th gets 25) plus one XSS demo comment on the newest live article; about 226,000
  hourly view counters for the last 30 days. The requirement is 500 articles **in total** in
  various statuses and categories (page 7), not 500 live ones.
- The analytics chart: log in as `editor`, then "Impact Analytics" in the editor menu
  (`/editor/analytics`) or "See its views over time" on an article's review page. Needs internet
  (Chart.js CDN). Re-seed shortly before the defense, because the view statistics cover the 30 days
  before the seed ran.
- **PR #65** (branch `os/fix-list-indent` into `dev`): `ol, ul { padding-left: 1.5rem; }` in
  `public/css/main.css` so list numbers stay inside their card (publish history on the review page,
  the analytics page's lists); `#comment-list` and `.editor-nav-list` keep `padding-left: 0`.
  Opened 2026-10-17, waiting for review/merge.
- Small findings mentioned to the user, not acted on: `services/logger.js` `logWarning` has a real
  line break inside its template literal instead of `\n` (works the same, looks like a typo);
  7 early commits are authored "Your Name <you@example.com>" (SH's, before they set their Git
  identity), worth being able to explain because teamwork is graded from the history.
- `npm run test:workflow` passed (73 of 73) on 2026-10-15.

---

## Prompt to paste in the new conversation

> I'm OS, preparing for the oral defense of our project The Daily Web. We're in the middle of a
> part-by-part study plan. Read `C:\Users\orizx\Documents\Git_Repositories\Defense-study-handoff.md`
> first and follow its rules exactly (one part per response, wait for me, no terms before they're
> taught). Then start **Part 7: MVC in this project**.
