/**
 * scripts/testWorkflow.js
 *
 * A small self-check for services/articleWorkflow.js. Run it with:
 *   node scripts/testWorkflow.js
 * It needs no database and no test library (the work plan allows only plain
 * console.assert). It prints one line per failed check and a summary, and exits
 * with a non-zero code if anything failed, so it is easy to see in a terminal.
 *
 * Why it exists: canTransition() decides who may publish, so a wrong rule would
 * break the permission requirements. This script checks the rules against the
 * requirements without starting the server.
 *
 * Used by: run by hand (EZ's acceptance check "node scripts/testWorkflow.js passes").
 * Related: services/articleWorkflow.js.
 * Owner: EZ.
 */

const { STATUS, STATUS_LABELS, canTransition } = require('../services/articleWorkflow');

let checkCount = 0;
let failedCount = 0;

/**
 * Records one check. A failing check prints through console.assert and is counted
 * so the summary at the end can report it.
 *
 * @param {boolean} condition - true if the behaviour is correct.
 * @param {string} description - What was checked, shown when it fails.
 * @returns {void}
 */
function check(condition, description) {
  checkCount += 1;
  if (!condition) {
    failedCount += 1;
  }
  console.assert(condition, `FAILED: ${description}`);
}

// The ONLY allowed changes, written out by hand from the requirements (not read
// from TRANSITIONS), so the test is an independent second opinion on the table.
const allowedChanges = [
  { from: STATUS.DRAFT, to: STATUS.PENDING, role: 'reporter' },
  { from: STATUS.PENDING, to: STATUS.PUBLISHED, role: 'editor' },
  { from: STATUS.PENDING, to: STATUS.RETURNED, role: 'editor' },
  { from: STATUS.RETURNED, to: STATUS.PENDING, role: 'reporter' },
  { from: STATUS.PUBLISHED, to: STATUS.DRAFT, role: 'reporter' },
];

/**
 * Checks every allowed change is accepted.
 *
 * @returns {void}
 */
function testAllowedChangesPass() {
  for (const change of allowedChanges) {
    check(
      canTransition(change.from, change.to, change.role) === true,
      `${change.role} should be allowed ${change.from} -> ${change.to}`
    );
  }
}

/**
 * Checks every other combination of status, status and role is rejected. Going
 * through ALL combinations (4 x 4 x 2 = 32) means no forbidden change can hide.
 *
 * @returns {void}
 */
function testEveryOtherChangeFails() {
  const statuses = Object.values(STATUS);
  const roles = ['reporter', 'editor'];
  for (const from of statuses) {
    for (const to of statuses) {
      for (const role of roles) {
        const isAllowed = allowedChanges.some(
          (change) => change.from === from && change.to === to && change.role === role
        );
        if (!isAllowed) {
          check(
            canTransition(from, to, role) === false,
            `${role} must NOT be allowed ${from} -> ${to}`
          );
        }
      }
    }
  }
}

/**
 * Checks the specific rules the lecturer is most likely to try.
 *
 * @returns {void}
 */
function testKeyRequirements() {
  // "A reporter cannot publish an article by themselves."
  check(!canTransition(STATUS.DRAFT, STATUS.PUBLISHED, 'reporter'), 'reporter publishes a draft');
  check(!canTransition(STATUS.PENDING, STATUS.PUBLISHED, 'reporter'), 'reporter publishes a pending article');
  // Only a reporter submits; an editor does not.
  check(!canTransition(STATUS.DRAFT, STATUS.PENDING, 'editor'), 'editor submits a draft');
  // The editor cannot skip the approval step.
  check(!canTransition(STATUS.DRAFT, STATUS.PUBLISHED, 'editor'), 'editor publishes a draft directly');
  // A returned article must be resubmitted, not published directly.
  check(!canTransition(STATUS.RETURNED, STATUS.PUBLISHED, 'editor'), 'editor publishes a returned article');
  // Staying in the same status is not a transition.
  check(!canTransition(STATUS.DRAFT, STATUS.DRAFT, 'reporter'), 'draft -> draft');
}

/**
 * Checks that bad input returns false and never throws.
 *
 * @returns {void}
 */
function testInvalidInputIsRejected() {
  const badValues = [undefined, null, '', 'nonsense', 42, {}, [], 'constructor', '__proto__', 'toString'];
  for (const badValue of badValues) {
    check(canTransition(badValue, STATUS.PENDING, 'reporter') === false, `bad current status: ${String(badValue)}`);
    check(canTransition(STATUS.DRAFT, badValue, 'reporter') === false, `bad next status: ${String(badValue)}`);
    check(canTransition(STATUS.DRAFT, STATUS.PENDING, badValue) === false, `bad role: ${String(badValue)}`);
  }
  check(canTransition() === false, 'no arguments at all');
}

/**
 * Checks every status has a label for the interface.
 *
 * @returns {void}
 */
function testEveryStatusHasALabel() {
  for (const status of Object.values(STATUS)) {
    check(typeof STATUS_LABELS[status] === 'string' && STATUS_LABELS[status].length > 0, `label for ${status}`);
  }
}

testAllowedChangesPass();
testEveryOtherChangeFails();
testKeyRequirements();
testInvalidInputIsRejected();
testEveryStatusHasALabel();

console.log(`${checkCount - failedCount} of ${checkCount} checks passed.`);
if (failedCount > 0) {
  console.log(`${failedCount} FAILED.`);
  process.exitCode = 1;
}
