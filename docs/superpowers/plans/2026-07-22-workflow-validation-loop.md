# Workflow Validation Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the Skill center, local Codex multimodal path, API production path, and one authorized minimum-cost enterprise video task through repeatable automated and real-browser loops.

**Architecture:** Automated tests cover deterministic state, security, and failure modes. Host development runs Codex CLI with real image inputs. Production Docker proves CLI absence and API readiness. One paid video task is allowed only after preflight and a final parameter/cost check.

**Tech Stack:** Go tests, Node tests, Next production build, Docker Compose, Codex CLI, in-app browser automation.

---

### Task 1: Add the release acceptance matrix

**Files:**
- Create: `docs/acceptance/workflow-local-codex-skill-center.md`
- Modify: `docs/pending-test.md`
- Modify: `docs/todo.md`

- [ ] **Step 1: Define 36 numbered scenarios**

The matrix must include 8 Skill/version cases, 6 contract/evaluation cases, 5 project/global binding cases, 7 CLI/executor cases, 5 image-input cases, 4 production gates, and 1 authorized paid video case. Each row has evidence source, expected result, actual result, severity, and pass/fail/blocked status.

- [ ] **Step 2: Set the stop rule**

Stop only when at least 35/36 pass, no P0/P1 remains, all non-paid tests pass, and the one paid case either succeeds once or is blocked before submission by a documented upstream preflight condition.

- [ ] **Step 3: Commit**

```bash
git add docs/acceptance/workflow-local-codex-skill-center.md docs/pending-test.md docs/todo.md
git commit -m "docs: define local workflow acceptance matrix"
```

### Task 2: Run complete automated gates

**Files:**
- Modify only files required by failures caused by this feature.

- [ ] **Step 1: Run backend checks**

Run: `go test ./... && go vet ./...`
Expected: exit 0.

- [ ] **Step 2: Run frontend checks**

Run: `cd web && npm test && npm run typecheck && npm run build && npm run lint -- --quiet`
Expected: exit 0.

- [ ] **Step 3: Run diff and secret scans**

Run: `git diff --check && ! rg -n 'WORKFLOW_LOCAL_CODEX_ENABLED:\s*"?true|WORKFLOW_TEXT_EXECUTOR:\s*codex-cli' docker-compose.yml docker-compose.local.yml .env.example`
Expected: exit 0 and no production/default CLI enablement.

### Task 3: Validate the admin Skill lifecycle in a real browser

**Files:**
- Record evidence in: `docs/acceptance/workflow-local-codex-skill-center.md`

- [ ] **Step 1: Create an art Skill draft**

Open `/admin/workflow-skills`, clone the current art version, add a harmless visible evaluation marker to the draft instructions, and verify that direct publication is blocked before evaluation.

- [ ] **Step 2: Run dry-run and comparison**

Select the acceptance project/episode, run Codex dry-run, inspect frozen inputs and images, compare baseline/candidate, and verify the output contract and hard quality gates pass.

- [ ] **Step 3: Publish to the test project**

Bind only the acceptance project, verify the project resolution label, then start a real stage and confirm its Agent Run stores the candidate version/hash while an already-running task remains unchanged.

- [ ] **Step 4: Promote and roll back**

Promote to global, verify a non-canary project resolves the new global version, then roll back project and global bindings independently.

### Task 4: Validate real Codex multimodal workflow behavior

**Files:**
- Record evidence in: `docs/acceptance/workflow-local-codex-skill-center.md`

- [ ] **Step 1: Start host development mode**

Start Go with `APP_ENV=development WORKFLOW_TEXT_EXECUTOR=codex-cli WORKFLOW_LOCAL_CODEX_ENABLED=true WORKFLOW_CODEX_BIN=codex WORKFLOW_CODEX_WORKDIR=<repository>` and start Next.js against that API. Confirm health says `Codex CLI（本地验证）`.

- [ ] **Step 2: Validate text stage**

Run the art stage, observe queued/running/review, inspect Skill snapshot and zero application credits, approve, apply mapping, and refresh to prove recovery.

- [ ] **Step 3: Bind recognizable test images**

Use nonblank character, scene, and prop test images. Confirm ordered manifest, content fingerprints, version labels, and the absence of server paths in the UI/API.

- [ ] **Step 4: Validate image understanding**

Run storyboard generation with 1, 3, and then the selected production set up to 9 images. The output must mention at least two visible details that exist only in the images and must preserve the recorded reference order. Missing or corrupt references must block; zero references must require explicit degradation confirmation.

- [ ] **Step 5: Validate cancellation and retry**

Cancel one running CLI task and retry it with the same Skill/image snapshot. Then start a new run with the latest Skill and confirm the hash changes only for the new run.

### Task 5: Execute one authorized minimum-cost enterprise video task

**Files:**
- Record task ID, parameters, status, duration, and balance delta in: `docs/acceptance/workflow-local-codex-skill-center.md`

- [ ] **Step 1: Perform no-charge preflight**

Confirm the enterprise channel, model availability, balance, and reference readiness without creating a video task.

- [ ] **Step 2: Freeze minimum parameters**

Select exactly one confirmed package, the lowest-cost available enterprise model, lowest supported resolution, shortest supported duration, and audio off. Do not submit if the UI or upstream changes any of these values or the displayed cost is unexpectedly higher.

- [ ] **Step 3: Submit exactly once**

Approve the paid confirmation once. Record the created task ID immediately. Never click generate again for this acceptance run.

- [ ] **Step 4: Poll and archive**

Synchronize the existing task until terminal status, verify video content download/preview, history version, task metadata, and asset archive. If the upstream fails, record the same task failure and do not create a replacement paid task.

### Task 6: Prove production CLI exclusion

**Files:**
- Modify: `docs/deployment.md`
- Modify: `docs/workflow.md`
- Modify: `docs/pending-test.md`

- [ ] **Step 1: Build and start production Docker**

Run: `docker compose -f docker-compose.local.yml up -d --build`
Expected: container becomes healthy.

- [ ] **Step 2: Verify binary and configuration gates**

Run: `docker compose -f docker-compose.local.yml exec -T app sh -lc '! command -v codex && test "$WORKFLOW_TEXT_EXECUTOR" = api && test "$WORKFLOW_LOCAL_CODEX_ENABLED" = false'`
Expected: exit 0.

- [ ] **Step 3: Verify production misconfiguration fails**

Start a disposable container with `APP_ENV=production`, `WORKFLOW_TEXT_EXECUTOR=codex-cli`, and `WORKFLOW_LOCAL_CODEX_ENABLED=true`.
Expected: process exits nonzero with the safe production rejection message before HTTP starts.

- [ ] **Step 4: Repeat the unified-workbench browser matrix**

Verify project entry, six stages, Skill summaries, API Worker health, URL restore, drawers, 1920/1440/1024/768 widths, and zero browser errors. Production UI must not expose CLI switches, paths, or credentials.

- [ ] **Step 5: Close documentation and commit**

Move completed items from `docs/todo.md` to `docs/pending-test.md`, update `docs/workflow.md`, `docs/deployment.md`, and the acceptance matrix with exact evidence.

```bash
git add docs/acceptance/workflow-local-codex-skill-center.md docs/todo.md docs/pending-test.md docs/workflow.md docs/deployment.md
git commit -m "docs: record workflow executor acceptance"
```
