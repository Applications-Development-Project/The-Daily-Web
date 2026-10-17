I'm one of four students on "The Web Daily" team (OS, SM, SH, EZ). I'll tell you my initials; if I haven't, ask before doing anything. The team work plan and the official requirements document (Hebrew) are attached. Follow the plan's "Instructions for AI coding agents", including all hard rules.

Goal: in the oral defense the lecturer may ask any of us about any line of the code. Document ALL the code I already wrote, not only new code: every file I own that already exists in the repo, from the earliest phase 0 work to my latest merged pull request. When you're done, every file I own should explain itself, so I can answer by reading the code. Then give me a short list of the questions I'm most likely to be asked, with answers.

Before you start
1. Pull the latest dev (git checkout dev, git pull) and create a branch named <my initials>/docs-defense-comments.
2. Check my Git identity: git config user.name and git config user.email. The email must be one on my GitHub account (GitHub → Settings → Emails, or my GitHub noreply address). If it's "you@example.com" or not on my account, help me fix it before the first commit. Commits under that email don't count as mine.
3. List every file I own that already exists in the repo, from the ownership table in the plan, including stubs, views, browser scripts, route files and scripts. Show me the list before you start. Work only on those files. For a shared file or another student's file, write me a short message to send to its owner instead of editing it.

What to do in each of my files
- Start with the code that already exists, oldest first, and go through each file completely. Older code is usually the least documented: phase 0 stubs, early routes and views, and code written before CONVENTIONS.md existed.
- Comment-only changes. Don't change behavior, names, routes or response shapes. If you find a real bug or a gap against the requirements, stop and tell me; don't fix it silently.
- Follow CONVENTIONS.md and the style already in the repo:
  - A header comment: what the file does, who calls it, related files, owner.
  - JSDoc on every function: purpose, parameters, return value, errors it throws.
  - Comments that explain WHY, not just what.
  Good examples to copy: middleware/commentRateLimiter.js, config/session.js, controllers/userController.js, services/viewTracker.js.
- Some explanations may already be there. Check each one, and add or improve only where the reason is missing, unclear or out of date (for example a comment that still says "stub" or "TEMP" about code that is now real). Plain English, short sentences.
- For every non-obvious choice, the comment should answer the question the lecturer would ask. Look especially for:
  - Why this design and not the simpler alternative, and which requirement it serves (quote the requirement in your own words).
  - Security: where permissions are checked on the server; why values from the request are type-checked; why ids, the reporter or the device come from the URL or session and never from the body; how user text is kept from running as HTML (textContent in the browser, <%= %> in EJS, never innerHTML or <%-); regex escaping in searches.
  - Validation in two places: the browser check is only for a quick answer, and the server check is the real one.
  - Performance with thousands of articles or readers: which index a query uses, paging, .lean() and .select(), caching, and why a counter or cache instead of storing every event.
  - Edge cases: bad ids, missing data, empty results, a failed external service. What the user sees in each case.
  - Known limits and trade-offs we accepted, and what a stricter version would need.
  - Express 5 and library behavior we rely on: an async error goes to errorHandler without try/catch; req.body is undefined when there's no body; inside a router, request.path is relative to the mount point.
  - Contracts other students depend on: the exact names, response shapes and element ids from "Shared contracts" and "Contracts added while building", and who uses them.

Topics the plan expects each of us to explain (check that the existing code explains the ones in my area)
- SM:
  - Hourly view buckets: one counter document per article per hour, not one document per view; why $inc with upsert is atomic and never loses simultaneous views.
  - totalViews kept on the article, for the popularity sort.
  - recordView never throwing, so the article page never breaks.
  - Approve copying draft into published; publishHistory and the chart markers.
  - The return note being required; deleting an article together with its comments and statistics.
  - The Chart.js linear x-axis, and the custom afterDraw plugin for the publish markers.
  - Date-range limits; the editor seeing old and new side by side.
- SH:
  - The article page rendered on the server, so the full text is in the page source for search engines.
  - The feed: only live articles; regex escaping; the _id tie-breaker so pages never repeat or skip; 20 per page with hasMore.
  - IntersectionObserver for infinite scroll; never two requests at once; the 300 ms search delay.
  - The viewed / not-viewed filter through DeviceArticleView.
  - The weather cache: 10 minutes, inside the required 15; one shared fetch while a request is in flight; returning the last good result when the API fails; why thousands of readers still cause at most one external call per 10 minutes.
  - Responsive Flexbox layout and semantic HTML5.
  - The comment markup contract with OS.
- EZ:
  - The transition table in canTransition; why every other transition is refused; why published → draft is allowed (see "Article status rules" in the plan).
  - The reporter taken from the session, never the request body.
  - Ownership checks (403) and status checks (409).
  - The draft/published split, so readers keep seeing the approved version while a reporter edits.
  - Autosave 2 seconds after the last change; retrying on failure; fetch with keepalive when the page closes; the server as the source of truth, so a reload or another computer shows the latest text.
  - scripts/testWorkflow.js and what it proves.

How to work
- One small commit per file or small group of files, prefixed "docs:", for example "docs: explain the hourly view buckets in viewTracker". Show me each change before committing.
- Commit messages and the pull request must NOT contain "Co-Authored-By:" lines or "Generated with ..." lines. Remove them if your tool adds them by default: GitHub would list the AI as a contributor to our repo.
- After the edits, run npm run dev and open the pages I own, to confirm nothing broke.
- Push the branch and open a pull request into dev (gh pr create --base dev). Write the description: which files were documented, plus any bugs or requirement gaps you found but didn't fix.

At the end, give me
1. A list of all my files, each with one line on what it does, marking which ones you documented.
2. My 10–15 most likely defense questions, each with a short answer and the file and function where the answer lives.
3. Anything in my area that doesn't fully meet the requirements document yet.

From now on
For any new code we write together later, put these explanations into the code in the same step as the code itself, not afterwards.
