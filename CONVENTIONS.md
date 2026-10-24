# Code conventions

These rules make the code of four people (and their AI tools) read like one author wrote it,
and make every line something we can explain in the defense.
**Paste this file into every AI session before asking for code.**

The work plan is the source for these rules. If the two disagree, the plan wins; fix this file in a small pull request.

## Comments

- Every file starts with a header comment: what the file does, who calls it, and which files it relates to.
- Every function has a JSDoc comment: purpose, parameters, return value, and errors it can throw.
- Comments explain *why*, not just *what*. Example: "We count views in hourly buckets, not one document per view,
  so thousands of readers don't create millions of documents."
- In EJS views, write notes as EJS comments (`<%# ... %>`), never HTML comments (`<!-- -->`). An HTML comment is
  sent to every reader and shown by "View page source"; an EJS comment is removed on the server. Never write the
  closing `%>` inside an EJS comment.
- Write the explanation in the same step as the code, not afterwards: the lecturer may ask about any line.

Example, in the style the repo already uses (see `services/logger.js`, `models/Article.js`):

```js
/**
 * services/viewTracker.js
 *
 * Records that an article was viewed, for the Impact Analytics chart and the feed's
 * "viewed / not viewed" filter. The article page calls recordView() on every visit.
 *
 * Used by: controllers/articlePageController.js (SH).
 * Related: models/ArticleViewStats.js, models/DeviceArticleView.js.
 * Owner: SM.
 */

/**
 * Records one view of an article by one device.
 *
 * @param {string} articleId - The article that was opened.
 * @param {string} deviceId - The visitor's device id (req.deviceId).
 * @returns {Promise<void>} Resolves when the view has been handled. Never rejects.
 */
async function recordView(articleId, deviceId) { ... }
```

## Naming

- Functions start with a descriptive verb: `submitArticleForApproval`, not `submit`.
- No abbreviations: `article`, not `art`; `request`, not `req2`.
- One word per concept everywhere: always "reporter" (never "writer" or "author"), always "editor".
- Models in PascalCase (`ArticleViewStats.js`), everything else in camelCase (`feedController.js`).
- Interface language: English.

## Where files go

The folders follow MVC, and the browser code mirrors the views, so every feature is easy to find
(docs/PROJECT_GUIDE.md has a table of "where each requirement lives").

| What | Where |
|---|---|
| A URL and who may use it | `routes/pageRoutes/<area>PageRoutes.js` (pages, mounted at `/`) or `routes/apiRoutes/<area>ApiRoutes.js` (JSON, mounted at `/api`) |
| Handling a request | `controllers/<area>Controller.js` |
| A business rule shared by controllers | `services/` |
| A small request helper (id check, regex escaping, paging, errors) | `utils/` |
| Something that runs before controllers on many routes | `middleware/` |
| A database collection, its rules and indexes | `models/<Name>.js` |
| A page | `views/<area>/<page>.ejs`, with `<area>` one of `public`, `reporter`, `editor` |
| A page's browser script | `public/js/<area>/<page>.js` (a script for one part of a page is named after that part, like `articleComments.js`) |
| Styles | `public/css/main.css` only: no `style=""` attributes and no `<style>` blocks in views |
| Demo data and one-off scripts | `scripts/` |
| Self-check scripts | `tests/` (`npm run test:workflow`, `test:reporter`, `test:editor`) |
| Documentation for the team | `docs/` (`docs/PROJECT_GUIDE.md` explains the structure) |

No inline `<script>` blocks in views: every script is a file in `public/js/`, loaded after `/js/shared/apiClient.js`.

## Structure

- Short functions that do one job; no clever one-liners.
- Controllers handle the request and response; business rules go in `services/`; database shape goes in `models/`.
- Errors: `throw createHttpError(404, 'Article not found.')` (`utils/httpErrors.js`) or `next(error)`.
  `middleware/errorHandler.js` logs it and answers with a clean message (JSON for `/api`, the error page otherwise).
  With Express 5 an error thrown in an async controller reaches it without try/catch. The server never crashes on bad input.
- Check every value from the request before it reaches a query: ids with `isValidObjectId`, search text with
  `readSearchText` and `escapeRegExp`, page numbers with `readPageNumber` (`utils/requestValidation.js`), and
  every body field with `typeof value === 'string'`. Never trust `req.body` to exist (Express 5 leaves it undefined
  when there is no body): read it as `request.body || {}`.
- Every permission check happens on the server, even when the button is also hidden in the browser.
- Use the shared names instead of retyping values: `STATUS` and `STATUS_LABELS` from `services/articleWorkflow.js`,
  `Article.CATEGORIES` from `models/Article.js`.
- Every JSON response is `{ success: true, data }` or `{ success: false, error: "<message a user can read>" }`.
  Browser scripts call the API through `public/js/shared/apiClient.js`.
- Insert text that came from users with `textContent`, never `innerHTML`; in EJS print it with `<%= %>`, never `<%-`.
- Ids, the reporter, the editor and the device always come from the URL, the session or the cookie, never from the body.

## Allowed packages

`express`, `mongoose`, `ejs`, `express-session`, `connect-mongo`, `bcrypt`, `dotenv`, and Chart.js in the browser.

Adding any other package needs the whole team's agreement in the group chat. AI tools often add `helmet`,
`express-rate-limit`, `winston`, `joi` or `multer`; remove them. Images are stored as URLs, so we don't need
upload libraries. No React, Vue, Angular, jQuery, Bootstrap, Tailwind, TypeScript or bundlers.

**Lecturer approval of `express-session`, `connect-mongo`, `bcrypt` and `dotenv`:** approved (OS asked the
lecturer; answer received on 2026-10-11). We keep using all four, so the fallbacks the plan listed in case one was
rejected (`crypto.scrypt` instead of `bcrypt`, `node --env-file=.env` instead of `dotenv`) are not needed.

## Git

- Two long-lived branches: `dev` is where all work comes together (and is the default branch); `main` is the
  stable version and only receives `dev`, through a pull request, at the end of a phase and before submission.
  The submission zip and repo link come from `main`.
- Never commit to `main`, `dev` or another student's branch. One branch per task, created from an up-to-date `dev`
  (`git checkout dev`, `git pull`, `git checkout -b <branch>`), named `<initials>/<type>-<feature>`, for example
  `sm/feature-editor-dashboard`, `os/fix-comment-rate-limit-message`. Every pull request targets `dev`.
- Small commits: one change, usually one to three files, and the app still runs after each one.
- Commit messages start with a prefix: `feat:` (new feature), `fix:` (bug fix), `docs:` (documentation),
  `refactor:` (moving or reorganising code without changing what it does), `chore:` (setup, stubs, configuration).
  For example `feat: add cursor pagination to feed API`.
- No AI attribution in Git: no `Co-Authored-By:` lines for an AI tool and no "Generated with ..." lines in commits or
  pull requests. Commit with an email that is on your own GitHub account, so the commits count as yours.
- Never commit `.env`, passwords, API keys or tokens.
- Before opening a pull request, merge `dev` into your branch and check the app still runs.

## Working with AI

- Ask for one small piece at a time: one controller function, one view, one model.
- Read and understand every line before opening a pull request. If you can't explain it, ask the AI to explain or
  simplify it.
- Keep a short note of where you used AI; the course requires declaring it on the course site.
