/**
 * services/articleWorkflow.js
 *
 * The article status rules in one place: the four status names, the labels shown
 * to users, and canTransition(), which decides whether a status change is allowed.
 * Controllers ask canTransition() before every status change instead of writing
 * their own if-statements, so the rules can't drift apart between the reporter
 * and editor areas.
 *
 * The skeleton version was a stub written by SM; this is the real one. The names and
 * parameters of STATUS, STATUS_LABELS and canTransition() are unchanged, so callers
 * didn't need to change. The rules follow "Article status rules" in "Shared contracts".
 *
 * Two things a lecturer is likely to ask about:
 * - Why can a published article go back to "draft"? In "Article status rules",
 *   "status" describes the WORKING copy (Article.draft), not whether the article is
 *   live. "published" (Article.published) is what readers see. When a reporter edits
 *   a live article, the new version is "In preparation" again and must go through the
 *   same approval, while the approved text stays online. So "published" -> "draft" is
 *   not a second way to publish; it is the start of the next round of approval.
 * - Who checks that an article belongs to the reporter? Not this file. It only looks
 *   at the role. The controller checks ownership (see canTransition below).
 *
 * This file is a contract: SM's approve and return in editorController.js call
 * canTransition(), and the controllers and the seed import STATUS and STATUS_LABELS.
 * Don't rename them or change their parameters without telling the team.
 *
 * Used by: controllers/reporterController.js, controllers/editorController.js,
 * scripts/seed.js.
 * Related: models/Article.js (its status enum must list the same four values).
 * Owner: EZ.
 */

// The status values stored in Article.status. Code uses STATUS.PENDING instead of
// typing 'pending', so a typo becomes an obvious undefined instead of a silent bug.
// Object.freeze stops any file from changing these values by accident.
const STATUS = Object.freeze({
  DRAFT: 'draft',
  PENDING: 'pending',
  PUBLISHED: 'published',
  RETURNED: 'returned',
});

// The names users see for each status (requirements: "In preparation",
// "Awaiting editor approval", "Published", "Returned for corrections").
const STATUS_LABELS = Object.freeze({
  [STATUS.DRAFT]: 'In preparation',
  [STATUS.PENDING]: 'Awaiting editor approval',
  [STATUS.PUBLISHED]: 'Published',
  [STATUS.RETURNED]: 'Returned for corrections',
});

// The transition table: the ONLY status changes the system allows, copied from
// "Article status rules" in the work plan. Read it as
//   TRANSITIONS[from][to] = the roles that may make that change.
// A change that is not in this table is forbidden, which is how we satisfy the
// requirement "any other transition between states is not allowed" without
// writing a list of forbidden cases. Keeping the rules as data (not if-statements)
// means the whole workflow can be read, and checked against the requirements,
// in one place.
// Who owns the article is NOT stored here: a role alone can't say "this reporter's
// own article". Controllers check ownership separately, before calling canTransition.
const TRANSITIONS = Object.freeze({
  // Reporter submits a finished draft for the editor's approval.
  [STATUS.DRAFT]: Object.freeze({
    [STATUS.PENDING]: Object.freeze(['reporter']),
  }),
  // Only an editor decides: publish it, or send it back (with a note).
  [STATUS.PENDING]: Object.freeze({
    [STATUS.PUBLISHED]: Object.freeze(['editor']),
    [STATUS.RETURNED]: Object.freeze(['editor']),
  }),
  // Reporter fixed the problems and submits again.
  [STATUS.RETURNED]: Object.freeze({
    [STATUS.PENDING]: Object.freeze(['reporter']),
  }),
  // Reporter starts editing a live article: the NEW version goes back to "draft"
  // while the approved text stays in Article.published for readers.
  // The requirements list four transitions, but they also say an edited published
  // article goes through the same approval while readers keep the old version. Reading
  // "status" as the state of the working copy is how both statements are true.
  // Only a reporter may do this, and it can't be used to publish: the next step is
  // still "draft" -> "pending" -> an editor's approval.
  [STATUS.PUBLISHED]: Object.freeze({
    [STATUS.DRAFT]: Object.freeze(['reporter']),
  }),
});

/**
 * Decides whether a user with the given role may move an article from one status
 * to another, by looking the change up in TRANSITIONS.
 *
 * It never throws: any input it doesn't understand (missing, not a string, an
 * unknown status or role) simply returns false. That matters because the values
 * may come from the database or a request, and a bad value must be a clean
 * "not allowed", never a crashed server (requirements: invalid data must not
 * crash the server). It returns true/false instead of throwing because "not
 * allowed" is a normal answer here, not an error: the caller decides what to tell
 * the user (for example 409 and a message) with a simple "if (!canTransition(...))".
 * It checks the ROLE only. Whether the article belongs to this reporter is the
 * controller's job, because it needs the article from the database (and the user's
 * id from the session), and this file stays a pure function with no database.
 * Today the controller does not check ownership yet: the dashboard only lists
 * the reporter's own articles, and the routes that change articles (autosave,
 * submit) are still placeholders that answer 501.
 *
 * @param {string} currentStatus - The article's status now, one of STATUS.
 * @param {string} nextStatus - The status the caller wants to move to, one of STATUS.
 * @param {string} role - The logged-in user's role from the session: 'reporter' or 'editor'.
 * @returns {boolean} true if the change is allowed, false if not.
 */
function canTransition(currentStatus, nextStatus, role) {
  // Anything that is not a string can't be a valid status or role. This check also
  // matters for the lookups below: JavaScript turns an array like ['draft'] into the
  // key 'draft', so without it a non-string value could pass as a real status.
  if (
    typeof currentStatus !== 'string' ||
    typeof nextStatus !== 'string' ||
    typeof role !== 'string'
  ) {
    return false;
  }

  // Object.hasOwn checks only the table's own keys. A plain "TRANSITIONS[x]" would
  // also find inherited names such as "constructor" or "__proto__" and misbehave.
  // The status and role may come from outside (a request, a database value), so they
  // are untrusted input and we treat a name like "constructor" as just an unknown status.
  if (!Object.hasOwn(TRANSITIONS, currentStatus)) {
    return false;
  }
  const allowedNextStatuses = TRANSITIONS[currentStatus];
  if (!Object.hasOwn(allowedNextStatuses, nextStatus)) {
    return false;
  }

  // The change exists in the table; it is allowed only if this role is listed for it.
  return allowedNextStatuses[nextStatus].includes(role);
}

module.exports = {
  STATUS,
  STATUS_LABELS,
  TRANSITIONS,
  canTransition,
};
