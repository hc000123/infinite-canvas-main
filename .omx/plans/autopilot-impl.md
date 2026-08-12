# Implementation plan

1. Inventory all design/plan files, modified code, and focused tests corresponding to the browser comments.
2. Build a requirement-to-test matrix and identify gaps or contradictory implementations.
3. Run the focused frontend test set; fix failures with minimal changes.
4. Run TypeScript and focused Go packages; fix integration failures while preserving unrelated work.
5. Inspect and correct visible labels, routes, navigation context, and workflow state transitions against the specification.
6. Update todo, pending-test, database docs, and changelog only where current behavior changed.
7. Run full verification: focused tests, TypeScript, Go package suite, production build, `git diff --check`.
8. Rebuild/restart Docker without deleting mounted data, then browser-smoke the primary paths and console.
9. Perform a final requirements review and clean autopilot state.
