# Composable Runtime Mixed Executors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the unified Invocation / Workflow Runtime to execute text Skills with the explicitly enabled local Codex CLI while image Skills in the same run continue to use the configured image API, then complete a real content and visual quality evaluation.

**Architecture:** Freeze one executor per Invocation from the Skill executor kind: local Codex CLI for `text_model` only when the development gate is enabled, and API for `image_model` in all modes. The embedded worker owns an executor registry and dispatches each claimed immutable Agent Run to its frozen executor. Production keeps API-only configuration and continues rejecting Codex CLI.

**Tech Stack:** Go, GORM, SQLite, Codex CLI, OpenAI-compatible image API, existing Artifact / Invocation / Workflow Runtime.

---

### Task 1: Freeze the Correct Executor per Invocation

**Files:**
- Modify: `service/agent_run.go`
- Modify: `service/invocation_preflight.go`
- Modify: `service/invocation_runner.go`
- Test: `service/agent_run_codex_executor_test.go`
- Test: `service/invocation_preflight_test.go`

- [ ] **Step 1: Write failing executor-selection tests**

Add tests that enable `WORKFLOW_TEXT_EXECUTOR=codex-cli` in `config.Cfg`, then assert:

```go
textRun.Executor == AgentRunExecutorCodexCLI
imageRun.Executor == AgentRunExecutorAPI
textPreflight.ExecutionPolicy.ChannelID == ""
imagePreflight.ExecutionPolicy.ChannelID == "image-channel"
```

Also assert that a Codex executor cannot be frozen for `image_model`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
go test ./service -run 'Test.*(Codex.*Image|Invocation.*Codex)' -count=1
```

Expected: FAIL because `BuildUserAgentRun` currently requires every run to match the global text executor and Invocation preflight always freezes API.

- [ ] **Step 3: Implement capability-aware executor selection**

Add one helper that returns API for `image_model` and the configured text executor for `text_model`. Reorder `BuildUserAgentRun` normalization so execution kind is known before selecting the executor.

In Invocation preflight:

- freeze Codex CLI text policies without requiring a model channel;
- freeze the configured Codex model name and zero application credits;
- keep all image policies on the configured API image channel;
- reject incompatible caller overrides instead of silently changing the frozen target.

Update immutable policy validation and claimed-run validation so an empty channel is valid only for Codex CLI text runs; API and every image run still require an exact enabled channel.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the same command from Step 2 and expect all selected tests to pass.

- [ ] **Step 5: Commit**

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

- [ ] **Step 1: Write failing worker-registry tests**

Create two small recording executors with kinds `api` and `codex-cli`. Assert that one worker configured with both resolves each frozen kind exactly, rejects an unknown kind, and that configuration in local Codex mode returns both executors while API mode returns only API.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
go test ./service -run 'Test.*(Worker.*Executor|ExecutorsFromConfig)' -count=1
```

Expected: FAIL because `AgentRunWorker` owns only one executor.

- [ ] **Step 3: Implement the executor registry**

Add `Executors []AgentRunExecutor` to worker options while retaining the existing single `Executor` field for focused tests. Build an internal map keyed by `Kind()`, select the frozen executor after claiming a run, and use that same executor for availability, reserve, call, refund, cancellation, and failure handling.

Add `NewAgentRunExecutorsFromConfig()`:

- API mode: `[api]`
- explicitly enabled local Codex mode: `[codex-cli, api]`

Update `main.go` to pass the registry. Keep `NewAgentRunExecutorFromConfig()` as the text-executor compatibility helper used by existing health and legacy paths.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the same command from Step 2 and expect all selected tests to pass.

- [ ] **Step 5: Commit**

```bash
git add main.go service/agent_run_executor.go service/agent_run_worker.go service/agent_run_worker_test.go service/agent_run_codex_executor_test.go
git commit -m "feat: dispatch mixed agent run executors"
```

### Task 3: Add an Opt-in Real Runtime Evaluation

**Files:**
- Create: `service/composable_runtime_real_eval_test.go`
- Modify: `docs/pending-test.md`

- [ ] **Step 1: Write the gated real evaluation**

Add `TestComposableRuntimeRealCodexImageQuality`, skipped unless `COMPOSABLE_RUNTIME_REAL_EVAL=1`. It must:

1. load an isolated database copy containing configured model channels;
2. seed the current system Skills, Agents, Artifact schemas, and 12-node production Workflow;
3. create a dedicated evaluation user and fixed screenplay source Artifact;
4. preflight and confirm the standard Workflow;
5. execute text nodes with Codex CLI and image nodes with the API executor;
6. approve only Artifact sets whose schema and business gates passed;
7. reach a completed `delivery_report`;
8. collect character, scene, and prop image files plus exact Invocation / Artifact / Skill coordinates;
9. run one Codex CLI multimodal grader over all three images;
10. require each asset score and the overall score to be at least 80/100, with no identity, composition, legibility, or invented-text hard failure.

- [ ] **Step 2: Verify the evaluation fails before mixed routing**

Run against an isolated copy:

```bash
COMPOSABLE_RUNTIME_REAL_EVAL=1 \
WORKFLOW_TEXT_EXECUTOR=codex-cli \
WORKFLOW_LOCAL_CODEX_ENABLED=true \
go test ./service -run TestComposableRuntimeRealCodexImageQuality -count=1 -v
```

Expected before Tasks 1–2: FAIL during preflight or worker execution because a single worker cannot service both frozen executor kinds.

- [ ] **Step 3: Run the real evaluation after mixed routing**

Run the same command and expect:

- Workflow status `completed`;
- 12 nodes completed with exact frozen coordinates;
- three non-placeholder image Artifacts archived by content hash;
- Codex multimodal quality report passes the 80/100 threshold.

- [ ] **Step 4: Record the evidence**

Update `docs/pending-test.md` with the actual model names, invocation count, image count, quality scores, hard-failure count, and the boundary that Codex CLI remains development-only.

- [ ] **Step 5: Commit**

```bash
git add service/composable_runtime_real_eval_test.go docs/pending-test.md
git commit -m "test: evaluate mixed runtime with real models"
```

### Task 4: Regression and Completion Audit

**Files:**
- Modify: `CHANGELOG.md`
- Review: `docs/todo.md`

- [ ] **Step 1: Run deterministic regression gates**

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

- [ ] **Step 2: Audit objective coverage**

Verify from current database records and generated files:

- independent Skill publication and execution;
- independent Agent publication and execution;
- free Workflow composition and mixed Skill / Agent DAG execution;
- the same Invocation / Artifact coordinates consumed by API, Workflow, image workbench, and canvas;
- real Codex text output, real image output, content-hash archive, review, Apply, and visual grading.

- [ ] **Step 3: Update release-level documentation**

Add a concise `CHANGELOG.md` Unreleased entry for mixed executor routing and real model evaluation. Keep future deferred routing and additional rendition versions in `docs/todo.md`; do not claim Codex CLI is a production fallback.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md docs/todo.md docs/pending-test.md
git commit -m "docs: record composable runtime quality evidence"
```
