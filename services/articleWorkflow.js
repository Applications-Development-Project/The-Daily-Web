/**
 * services/articleWorkflow.js
 *
 * The article status rules in one place: the four status names, the labels shown
 * to users, and canTransition(), which decides whether a status change is allowed.
 * Controllers ask canTransition() before every status change instead of writing
 * their own if-statements, so the rules can't drift apart between the reporter
 * and editor areas.
 *
 * PHASE 0 STUB, written by SM so everyone can import the final names from day one.
 * STATUS and STATUS_LABELS are final. canTransition() allows everything for now;
 * EZ replaces its body with the real transition table ("Article status rules" in
 * "Shared contracts"). Callers never need to change.
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
  [STATUS.PUBLISHED]: Object.freeze({
    [STATUS.DRAFT]: Object.freeze(['reporter']),
  }),
});

/**
 * Decides whether a user with the given role may move an article from one status
 * to another.
 *
 * STUB: always returns true so the skeleton works before EZ's real rules are merged.
 * Do not rely on it rejecting anything yet.
 *
 * @param {string} currentStatus - The article's status now, one of STATUS.
 * @param {string} nextStatus - The status the caller wants to move to, one of STATUS.
 * @param {string} role - The logged-in user's role from the session: 'reporter' or 'editor'.
 * @returns {boolean} true if the change is allowed, false if not.
 */
function canTransition(currentStatus, nextStatus, role) {
  return true;
}

module.exports = {
  STATUS,
  STATUS_LABELS,
  TRANSITIONS,
  canTransition,
};
