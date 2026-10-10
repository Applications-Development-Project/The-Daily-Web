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
 * How it works, in short:
 * - It lists the 5 allowed changes again by hand (see allowedChanges below).
 * - It checks that those 5 pass and that every other combination fails
 *   (4 x 4 x 2 = 32 combinations of from-status, to-status and role: 5 allowed,
 *   27 forbidden).
 * - It checks a few named rules, bad input, and that every status has a label.
 * Together that is 73 checks. If you change the rules on purpose, change
 * allowedChanges too; the test is meant to fail until both agree.
 * console.assert does not stop the script, so one run reports ALL failures, not
 * only the first one. At the end the script sets the exit code to 1 if any check
 * failed, so a terminal or a CI tool can tell "passed" from "failed".
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
 * so the summary at the end can report it. We count ourselves because console.assert
 * only prints; it neither throws nor remembers how many checks failed.
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
// Why not import TRANSITIONS? Then the test would compare the table with itself:
// a typo in the table (for example letting 'reporter' publish) would also be in the
// test's expected values, and the test would still pass. Writing the rules twice
// means a mistake has to be made twice, in the same way, to go unnoticed.
// The last entry (published -> draft) is the one that is not in the list of four
// transitions in the requirements; see "Article status rules" in the work plan.
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
 * This is how we test the requirement "any other transition is not allowed":
 * instead of guessing which forbidden cases to try, we try every case that is not
 * in allowedChanges. That includes staying in the same status (draft -> draft)
 * and going backwards (for example pending -> draft). 32 combinations minus the
 * 5 allowed ones leaves 27 checks.
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
 * Checks that bad input returns false and never throws. If canTransition threw,
 * the exception would stop this script (and, in the real app, would have to be
 * caught in every controller), so a missing "return false" would show up here.
 * Each bad value is tried in all three positions (10 values x 3 = 30 checks), plus
 * a call with no arguments at all (1 check).
 * The strings 'constructor', '__proto__' and 'toString' are names every JavaScript
 * object inherits. They test that canTransition uses Object.hasOwn and not a plain
 * TRANSITIONS[name] lookup, which would wrongly find them. The values 42, {} and []
 * are not strings, so they test the typeof checks.
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
 * Checks every status has a label for the interface. STATUS_LABELS is used by the
 * dashboards (reporter and editor), so a status without a label would show
 * "undefined" to the user. It also protects the contract other students rely on:
 * adding a status to STATUS without a label fails here.
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

// Number of checks, in the order the tests above run: 5 + 27 + 6 + 31 + 4 = 73.
console.log(`${checkCount - failedCount} of ${checkCount} checks passed.`);
if (failedCount > 0) {
  console.log(`${failedCount} FAILED.`);
  // Exit code 1 means "failed" to the shell. We set process.exitCode instead of
  // calling process.exit(1) so Node can finish printing the output above first.
  process.exitCode = 1;
}
