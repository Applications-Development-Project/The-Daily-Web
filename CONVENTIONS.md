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

## Structure

- Short functions that do one job; no clever one-liners.
- Controllers handle the request and response; business rules go in `services/`; database shape goes in `models/`.
- Errors are passed with `next(error)` to `middleware/errorHandler.js`, which logs them and returns a clean message.
  The server never crashes on bad input.
- Every permission check happens on the server, even when the button is also hidden in the browser.
- Use the shared names instead of retyping values: `STATUS` and `STATUS_LABELS` from `services/articleWorkflow.js`,
  `Article.CATEGORIES` from `models/Article.js`.
- Every JSON response is `{ success: true, data }` or `{ success: false, error: "<message a user can read>" }`.
  Browser scripts call the API through `public/js/shared/apiClient.js`.
- Insert text that came from users with `textContent`, never `innerHTML`.

## Allowed packages

`express`, `mongoose`, `ejs`, `express-session`, `connect-mongo`, `bcrypt`, `dotenv`, and Chart.js in the browser.

Adding any other package needs the whole team's agreement in the group chat. AI tools often add `helmet`,
`express-rate-limit`, `winston`, `joi` or `multer`; remove them. Images are stored as URLs, so we don't need
upload libraries. No React, Vue, Angular, jQuery, Bootstrap, Tailwind, TypeScript or bundlers.

**Lecturer approval of `express-session`, `connect-mongo`, `bcrypt` and `dotenv`:** *pending. OS fills this in
with the lecturer's answer.*

**Fallbacks if the lecturer rejects a package.** None of these needs a new package:

- `bcrypt`: hash passwords with Node's built-in `crypto.scrypt` plus a random salt.
- `dotenv`: load `.env` with `node --env-file=.env server.js` (Node 20.6 or newer).
- `express-session` or `connect-mongo`: ask the lecturer what the course used for authentication and follow that.

## Git

- Two long-lived branches: `dev` is where all work comes together (and is the default branch); `main` is the
  stable version and only receives `dev`, through a pull request, at the end of a phase and before submission.
  The submission zip and repo link come from `main`.
- Never commit to `main`, `dev` or another student's branch. One branch per task, created from an up-to-date `dev`
  (`git checkout dev`, `git pull`, `git checkout -b <branch>`), named `<initials>/<type>-<feature>`, for example
  `sm/feature-editor-dashboard`, `os/fix-comment-rate-limit-message`. Every pull request targets `dev`.
- Small commits: one change, usually one to three files, and the app still runs after each one.
- Commit messages start with a prefix: `feat:` (new feature), `fix:` (bug fix), `docs:` (documentation),
  `chore:` (setup, stubs, configuration). For example `feat: add cursor pagination to feed API`.
- Never commit `.env`, passwords, API keys or tokens.
- Before opening a pull request, merge `dev` into your branch and check the app still runs.

## Working with AI

- Ask for one small piece at a time: one controller function, one view, one model.
- Read and understand every line before opening a pull request. If you can't explain it, ask the AI to explain or
  simplify it.
- Keep a short note of where you used AI; the course requires declaring it on the course site.
