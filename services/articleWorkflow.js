/**
 * services/articleWorkflow.js
 *
 * The article status rules in one place: the four status names, their labels, and
 * canTransition(), which every controller asks before changing a status.
 *
 * "status" describes the working copy (Article.draft), not whether the article is live
 * (Article.published). That is why published -> draft exists: a reporter's edit of a live
 * article starts the next round of approval while readers keep the approved text.
 *
 * Used by: controllers/reporterController.js, controllers/editorController.js, scripts/seed.js.
 * Owner: EZ.
 */

// Code writes STATUS.PENDING, not 'pending', so a typo is an obvious undefined.
const STATUS = Object.freeze({
  DRAFT: 'draft',
  PENDING: 'pending',
  PUBLISHED: 'published',
  RETURNED: 'returned',
});

const STATUS_LABELS = Object.freeze({
  [STATUS.DRAFT]: 'In preparation',
  [STATUS.PENDING]: 'Awaiting editor approval',
  [STATUS.PUBLISHED]: 'Published',
  [STATUS.RETURNED]: 'Returned for corrections',
});

// The ONLY allowed changes: TRANSITIONS[from][to] = the roles that may make them.
// Anything not in the table is forbidden ("any other transition is not allowed").
// Ownership is not here: the controllers check it before calling canTransition.
const TRANSITIONS = Object.freeze({
  [STATUS.DRAFT]: Object.freeze({
    [STATUS.PENDING]: Object.freeze(['reporter']),
  }),
  [STATUS.PENDING]: Object.freeze({
    [STATUS.PUBLISHED]: Object.freeze(['editor']),
    [STATUS.RETURNED]: Object.freeze(['editor']),
  }),
  [STATUS.RETURNED]: Object.freeze({
    [STATUS.PENDING]: Object.freeze(['reporter']),
  }),
  // A reporter starts editing a live article; the next step is still pending -> approval.
  [STATUS.PUBLISHED]: Object.freeze({
    [STATUS.DRAFT]: Object.freeze(['reporter']),
  }),
});

/**
 * Says whether a user with this role may move an article from one status to another.
 * It never throws: anything it doesn't understand is simply "not allowed" (false), and
 * the caller decides what to answer (usually 409). It checks the role only.
 *
 * @param {string} currentStatus - The article's status now, one of STATUS.
 * @param {string} nextStatus - The status to move to, one of STATUS.
 * @param {string} role - The user's role from the session: 'reporter' or 'editor'.
 * @returns {boolean} true if the change is allowed.
 */
function canTransition(currentStatus, nextStatus, role) {
  // Not a string can't be a status or role (an array ['draft'] would act as the key 'draft').
  if (
    typeof currentStatus !== 'string' ||
    typeof nextStatus !== 'string' ||
    typeof role !== 'string'
  ) {
    return false;
  }

  // Object.hasOwn ignores inherited names like "constructor" or "__proto__".
  if (!Object.hasOwn(TRANSITIONS, currentStatus)) {
    return false;
  }
  const allowedNextStatuses = TRANSITIONS[currentStatus];
  if (!Object.hasOwn(allowedNextStatuses, nextStatus)) {
    return false;
  }

  return allowedNextStatuses[nextStatus].includes(role);
}

module.exports = {
  STATUS,
  STATUS_LABELS,
  TRANSITIONS,
  canTransition,
};
