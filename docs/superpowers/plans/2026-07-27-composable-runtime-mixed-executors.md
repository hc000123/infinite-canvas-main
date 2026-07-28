# Composable Runtime Mixed Executors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the unified Invocation / Workflow Runtime to execute text Skills with the explicitly enabled local Codex CLI while image Skills in the same run continue to use the configured image API, then complete a deterministic simulated end-to-end evaluation and leave visual quality for manual acceptance.

**Architecture:** Freeze one executor per Invocation from the Skill executor kind: local Codex CLI for `text_model` only when the development gate is enabled, and API for `image_model` in all modes. The embedded worker owns an executor registry and dispatches each claimed immutable Agent Run to its frozen executor. Production keeps API-only configuration and continues rejecting Codex CLI.

**Tech Stack:** Go, GORM, SQLite, simulated Codex and image API executors, existing Artifact / Invocation / Workflow Runtime.

---

### Task 1: Freeze the Correct Executor per Invocation

**Files:**
- Modify: `service/agent_run.go`
- Modify: `service/invocation_preflight.go`
- Modify: `service/invocation_runner.go`
- Test: `service/agent_run_codex_executor_test.go`
- Test: `service/invocation_preflight_test.go`

- [x] **Step 1: Write failing executor-selection tests**

Add tests that enable `WORKFLOW_TEXT_EXECUTOR=codex-cli` in `config.Cfg`, then assert:

```go
textRun.Executor == AgentRunExecutorCodexCLI
imageRun.Executor == AgentRunExecutorAPI
textPreflight.ExecutionPolicy.ChannelID == ""
imagePreflight.ExecutionPolicy.ChannelID == "image-channel"
```

Also assert that a Codex executor cannot be frozen for `image_model`.

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```bash
go test ./service -run 'Test.*(Codex.*Image|Invocation.*Codex)' -count=1
```

Expected: FAIL because `BuildUserAgentRun` currently requires every run to match the global text executor and Invocation preflight always freezes API.

- [x] **Step 3: Implement capability-aware executor selection**

Add one helper that returns API for `image_model` and the configured text executor for `text_model`. Reorder `BuildUserAgentRun` normalization so execution kind is known before selecting the executor.

In Invocation preflight:

- freeze Codex CLI text policies without requiring a model channel;
- freeze the configured Codex model name and zero application credits;
- keep all image policies on the configured API image channel;
- reject incompatible caller overrides instead of silently changing the frozen target.

Update immutable policy validation and claimed-run validation so an empty channel is valid only for Codex CLI text runs; API and every image run still require an exact enabled channel.

- [x] **Step 4: Run the focused tests and verify GREEN**

Run the same command from Step 2 and expect all selected tests to pass.

- [x] **Step 5: Commit**

```bash
git add service/agent_run.go service/invocation_preflight.go service/invocation_runner.go service/agent_run_codex_executor_test.go service/invocation_preflight_test.go
git commit -m "feat: route invocation executors by capability"
```

### Task 2: Dispatch Mixed Executors from One Worker

**Files:**
- Modify: `service/agent_run_executor.go`
- Modify: `service/agent_run_worker.go`
- Modify: `main.go`
- Test: `service/agent_run_worker_test.go`
- Test: `service/agent_run_codex_executor_test.go`

- [x] **Step 1: Write failing worker-registry tests**

Create two small recording executors with kinds `api` and `codex-cli`. Assert that one worker configured with both resolves each frozen kind exactly, rejects an unknown kind, and that configuration in local Codex mode returns both executors while API mode returns only API.

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```bash
go test ./service -run 'Test.*(Worker.*Executor|ExecutorsFromConfig)' -count=1
```

Expected: FAIL because `AgentRunWorker` owns only one executor.

- [x] **Step 3: Implement the executor registry**

Add `Executors []AgentRunExecutor` to worker options while retaining the existing single `Executor` field for focused tests. Build an internal map keyed by `Kind()`, select the frozen executor after claiming a run, and use that same executor for availability, reserve, call, refund, cancellation, and failure handling.

Add `NewAgentRunExecutorsFromConfig()`:

- API mode: `[api]`
- explicitly enabled local Codex mode: `[codex-cli, api]`

Update `main.go` to pass the registry. Keep `NewAgentRunExecutorFromConfig()` as the text-executor compatibility helper used by existing health and legacy paths.

- [x] **Step 4: Run the focused tests and verify GREEN**

Run the same command from Step 2 and expect all selected tests to pass.

- [x] **Step 5: Commit**

```bash
git add main.go service/agent_run_executor.go service/agent_run_worker.go service/agent_run_worker_test.go service/agent_run_codex_executor_test.go
git commit -m "feat: dispatch mixed agent run executors"
```

### Task 3: Add a Deterministic Mixed Runtime Evaluation

**Files:**
- Modify: `service/workflow_execution_e2e_test.go`
- Modify: `service/workflow_seed_test.go`
- Modify: `docs/pending-test.md`

- [x] **Step 1: Extend the 12-node production E2E**

Extend the fixed bus-stop screenplay test so it runs the published 12-node production Workflow twice:

1. API-only baseline: all 12 nodes use the simulated API executor, estimated cost is 18 credits, and the final balance is 82;
2. mixed mode: nine text nodes use a simulated Codex executor, three image nodes use a simulated image API executor, estimated cost is 9 credits, and the final balance is 91.

Both paths must freeze exact Skill / Agent versions, carry authoritative parent Artifact IDs and hashes, pass all Schema and business gates, require review, reach a completed `delivery_report`, and preserve coordinates after reload.

- [x] **Step 2: Run the focused mixed evaluation**

```bash
go test ./service -run 'TestSystemProductionWorkflowExecutes(RoutedTwelveNodeProductionChain|MixedCodexTextAndAPIImageChain)$' -count=1
```

Expected: both 12-node executions pass, with API / Codex call counts of `12 / 0` and `3 / 9` respectively.

- [x] **Step 3: Record the verification boundary**

Update `docs/pending-test.md` to state that this proves routing, contracts, lineage, review, accounting, and completion without calling real external models. Character, scene, and prop visual quality remains a manual acceptance item and must not be reported as automatically passed.

- [x] **Step 4: Commit**

```bash
git add service/workflow_execution_e2e_test.go service/workflow_seed_test.go docs/pending-test.md
git commit -m "test: cover mixed runtime production chain"
```

### Task 4: Regression and Completion Audit

**Files:**
- Modify: `CHANGELOG.md`
- Review: `docs/todo.md`

- [x] **Step 1: Run deterministic regression gates**

```bash
go test ./... -count=1
cd web && npm test
cd web && npm run typecheck
cd web && npm run lint
cd web && npm run build
cd web && bun audit
git diff --check
```

Expected: all commands exit 0; ESLint may retain the documented repository warnings but must have zero errors; dependency audit must report no vulnerabilities.

- [x] **Step 2: Audit objective coverage**

Verify from current database records and generated files:

- independent Skill publication and execution;
- independent Agent publication and execution;
- free Workflow composition and mixed Skill / Agent DAG execution;
- the same Invocation / Artifact coordinates consumed by API, Workflow, image workbench, and canvas;
- simulated Codex text routing, simulated image API routing, content-hash coordinates, review, Apply, accounting, and reload recovery;
- manual visual acceptance remains open and is not replaced by deterministic protocol tests.

- [x] **Step 3: Update release-level documentation**

Add a concise `CHANGELOG.md` Unreleased entry for mixed executor routing and the deterministic 12-node evaluation. Keep future deferred routing, additional rendition versions, and real visual acceptance in `docs/todo.md`; do not claim Codex CLI is a production fallback.

- [x] **Step 4: Commit**

```bash
git add CHANGELOG.md docs/todo.md docs/pending-test.md
git commit -m "docs: record composable runtime quality evidence"
```
