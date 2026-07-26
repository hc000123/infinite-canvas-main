# Production Workflow Invocation Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the production video Workflow execute every generated stage through the shared Invocation / Artifact Runtime while preserving the current Workflow HTTP and workbench experience.

**Architecture:** `WorkflowRun` and `WorkflowStageRun` remain the orchestration and UI projection aggregate, but each executable stage owns one `InvocationID`; `InvocationRun`, `InvocationAttempt`, immutable `Artifact`, gates, reviews, and Apply attempts are the only execution truth. Workflow detail converts the authoritative Invocation Artifact-set into the existing response shape without persisting a second content copy, while lifecycle endpoints delegate to Invocation transitions and then refresh the stage projection.

**Tech Stack:** Go 1.25, Gin, GORM, SQLite/MySQL/PostgreSQL, existing AgentRun Worker, immutable Artifact Registry, Invocation Runtime, Next.js 16, React, TypeScript, Ant Design.

---

## Scope and invariants

- No executable Workflow stage calls `CreateUserAgentRun`; it preflights and confirms an Invocation with `source=workflow`.
- `WorkflowStageRun.InvocationID` is required for executable attempts. `AgentRunID` remains a response projection for the current console and is derived from the authoritative Invocation attempt.
- `WorkflowArtifact` and `WorkflowQualityGateResult` remain response DTO shapes only. New Workflow runs do not persist rows in the legacy artifact/gate tables.
- `OutputArtifactID` identifies a stable Workflow Artifact-set projection, not an arbitrary first output. Its content hash is the Invocation Artifact-set hash.
- Workflow review, retry, cancel, and Apply delegate to Invocation lifecycle functions. A server adapter records the bounded local-write receipt atomically and idempotently.
- Script confirmation creates a root `source_text` Artifact. Script adaptation remains visible as approved and projects the confirmed text; executable downstream stages consume only standard Artifact references.
- The workbench's current five stages remain available. Asset Brief multi-output is projected as one legacy `items` document by joining each Brief to the approved Asset Catalog; no standard Artifact is mutated or copied into another database row.
- The existing hard Workflow quality rules are registered as Invocation business validators for their corresponding core Artifact types, so migration cannot weaken quality.
- HTTP request and response paths stay stable. New `invocationId` and `artifactSetHash` fields are additive.
- The previous-shot tail frame remains an ordinary `continuity_reference`; no migration code or prompt may mark it as a first frame.

## File map

- Modify `model/workflow_run.go`: link stage projections to Invocation and mark legacy artifact/gate structs as response projections.
- Modify `repository/db.go`: stop migrating legacy Workflow artifact/gate tables for fresh databases.
- Modify `repository/workflow_run.go`: persist stage transitions keyed by Invocation and remove new artifact/gate write paths.
- Create `service/workflow_invocation_projection.go`: map Invocation state, attempts, Artifact-sets, reviews, applies, and gates into Workflow response DTOs.
- Create `service/workflow_invocation_projection_test.go`: cover single and multi-output projection, stable IDs, user isolation, and no legacy rows.
- Modify `service/video_workflow.go`: create root source Artifact, preflight/confirm stages, and build detail from Invocation projections.
- Modify `service/video_workflow_operations.go`: delegate cancel and retry to Invocation.
- Modify `service/invocation_gate_registry.go`: execute the production Workflow hard gates for relevant standard Artifact payloads.
- Modify `service/invocation_apply.go`: register `workflow_local_receipt` adapter.
- Add `model.WorkflowLocalApplyReceipt` and migrate it in `repository/db.go`.
- Modify `service/video_workflow_contracts.go`: add Invocation linkage and Artifact-set projection metadata without removing current fields.
- Modify Workflow service tests and add `service/video_workflow_invocation_e2e_test.go`.
- Modify `web/src/services/api/workflow-runs-contract.ts` and focused contract tests for additive fields.
- Modify Workflow workbench helpers only where standard asset IDs / Brief projections require it.
- Update `docs/backend-database.md`, `docs/api-response.md`, `docs/todo.md`, `docs/pending-test.md`, and `CHANGELOG.md`.

### Task 1: Freeze the stage-to-Invocation contract

**Files:**
- Modify: `model/workflow_run.go`
- Modify: `repository/db.go`
- Modify: `repository/workflow_run.go`
- Test: `repository/workflow_run_test.go`

- [ ] **Step 1: Write the failing repository tests**

Add tests that create two attempts for one stage and assert the latest row stores `InvocationID`, that `GetWorkflowStageRunByInvocationID` is user-safe through the owning stage, and that a fresh migrated database does not require writes to `workflow_artifacts` or `workflow_quality_gate_results`.

```go
func TestWorkflowStageRunPersistsInvocationLink(t *testing.T) {
	setupRepositoryTestDB(t)
	stage := model.WorkflowStageRun{ID: "stage-1", UserID: "user-1", WorkflowRunID: "workflow-1", StageID: "asset-extraction", Attempt: 1, InvocationID: "invocation-1", Status: model.WorkflowStageRunStatusQueued}
	if err := CreateWorkflowStageWithEvent(stage, model.WorkflowEvent{UserID: stage.UserID, WorkflowRunID: stage.WorkflowRunID, StageRunID: stage.ID, Type: "stage.queued"}); err != nil { t.Fatal(err) }
	stored, ok, err := GetWorkflowStageRunByInvocationID(stage.InvocationID)
	if err != nil || !ok || stored.ID != stage.ID { t.Fatalf("stored=%#v ok=%v err=%v", stored, ok, err) }
}
```

- [ ] **Step 2: Run the test and verify RED**

Run: `go test ./repository -run 'TestWorkflowStageRunPersistsInvocationLink' -count=1`

Expected: FAIL because `WorkflowStageRun.InvocationID` and `GetWorkflowStageRunByInvocationID` do not exist.

- [ ] **Step 3: Add the exact stage link**

Add to `WorkflowStageRun`:

```go
InvocationID string `json:"invocationId" gorm:"size:128;index"`
```

Keep `AgentRunID`, `InputArtifactID`, and `OutputArtifactID` for the existing response shape, but document them as derived projection fields for Invocation-backed stages. Add:

```go
func GetWorkflowStageRunByInvocationID(invocationID string) (model.WorkflowStageRun, bool, error)
```

It trims the ID, returns not found for an empty value, and queries exactly one row. Remove `WorkflowArtifact` and `WorkflowQualityGateResult` from `AutoMigrate`; do not drop user tables or add migration fallback because the product is not released.

- [ ] **Step 4: Run repository tests**

Run: `go test ./repository -run 'TestWorkflow' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add model/workflow_run.go repository/db.go repository/workflow_run.go repository/workflow_run_test.go
git commit -m "refactor: link workflow stages to invocations"
```

### Task 2: Preserve production hard gates inside Invocation

**Files:**
- Modify: `service/invocation_gate_registry.go`
- Modify: `service/invocation_gate_registry_test.go`
- Modify: `service/invocation_completion_test.go`

- [ ] **Step 1: Write failing validator tests**

Cover stable asset IDs, exact source evidence, duplicate IDs, character variant parent identity, storyboard duration `4..15`, dialogue budget, continuous time prompts, exact input Artifact refs, and the continuity-reference rule.

```go
func TestInvocationAssetCatalogValidatorRejectsDuplicateStableIDs(t *testing.T) {
	validator, err := invocationBusinessValidatorFor("asset_catalog")
	if err != nil { t.Fatal(err) }
	payload := map[string]any{"items": []any{
		map[string]any{"assetId": "character-001", "kind": "character", "name": "林秋", "sourceEvidence": []any{"林秋站在站牌下。"}, "coreFacts": []any{"主要角色"}},
		map[string]any{"assetId": "character-001", "kind": "character", "name": "另一个人", "sourceEvidence": []any{"另一个人走来。"}, "coreFacts": []any{"路人"}},
	}}
	if err := validator.Check(payload); err == nil { t.Fatal("expected duplicate asset id rejection") }
}
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `go test ./service -run 'TestInvocation(AssetCatalog|Storyboard|VideoPrompt).*Validator' -count=1`

Expected: FAIL because current validators only check that top-level fields exist.

- [ ] **Step 3: Register strict core validators**

Replace the shallow checks for `asset_catalog`, `storyboard_package`, and `video_prompt_package` with focused functions:

```go
func validateInvocationAssetCatalog(payload map[string]any) error
func validateInvocationStoryboardPackage(payload map[string]any) error
func validateInvocationVideoPromptPackage(payload map[string]any) error
```

Return a joined error containing every blocking issue. Use the existing Workflow gate helpers where their contracts match; translate standard `assetId/sourceEvidence/coreFacts` into the checks instead of converting payload formats. `video_prompt_package` must reject a prompt that lacks the four production sections or continuous time spans, reject `@图0`, reject unknown input refs, and reject metadata that classifies `continuity_reference` as a first frame.

- [ ] **Step 4: Prove completion persists failed gates and no Artifact**

Run: `go test ./service -run 'TestInvocation(AssetCatalog|Storyboard|VideoPrompt|Completion)' -count=1`

Expected: PASS; invalid output leaves the Invocation failed with `business_gate`, while valid output enters `needs_review`.

- [ ] **Step 5: Commit**

```bash
git add service/invocation_gate_registry.go service/invocation_gate_registry_test.go service/invocation_completion_test.go
git commit -m "feat: enforce production gates in invocation runtime"
```

### Task 3: Project authoritative Invocation state into Workflow detail

**Files:**
- Create: `service/workflow_invocation_projection.go`
- Create: `service/workflow_invocation_projection_test.go`
- Modify: `service/video_workflow_contracts.go`
- Modify: `service/video_workflow.go`

- [ ] **Step 1: Write failing single/multi-output projection tests**

The tests must assert:

- a single `asset_catalog` Artifact projects to one Workflow artifact with the Invocation Artifact-set hash;
- three `asset_brief` Artifacts project to one stable `items` document joined to the input catalog;
- stage status, current `AgentRunID`, error, credits, review, and Apply receipt match the latest Invocation attempt;
- another user cannot load any projected content;
- no row is written to legacy artifact/gate tables.

```go
func TestProjectWorkflowInvocationAggregatesAssetBriefSet(t *testing.T) {
	fixture := completedWorkflowInvocationFixture(t, "asset-image-prompt", []string{
		`{"assetId":"character-001","brief":"角色四视图","format":"character-four-view"}`,
		`{"assetId":"scene-001","brief":"场景母版","format":"scene-master"}`,
	})
	projection, err := projectWorkflowInvocation(fixture.UserID, fixture.Stage)
	if err != nil { t.Fatal(err) }
	if projection.Stage.OutputArtifactID == "" || len(projection.Artifacts) != 1 { t.Fatalf("projection=%#v", projection) }
	var payload struct { Items []map[string]any `json:"items"` }
	if json.Unmarshal([]byte(projection.Artifacts[0].ContentJSON), &payload) != nil || len(payload.Items) != 2 { t.Fatalf("artifact=%s", projection.Artifacts[0].ContentJSON) }
}
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `go test ./service -run 'TestProjectWorkflowInvocation' -count=1`

Expected: FAIL because the projection service does not exist.

- [ ] **Step 3: Implement the projection boundary**

Define:

```go
type workflowInvocationProjection struct {
	Stage     model.WorkflowStageRun
	Artifacts []model.WorkflowArtifact
	Gates     []model.WorkflowQualityGateResult
	AgentRuns []model.AgentRun
}

func projectWorkflowInvocation(userID string, stage model.WorkflowStageRun) (workflowInvocationProjection, error)
func workflowArtifactSetID(invocationID string, attempt int) string
func workflowArtifactSetContent(stageID string, detail InvocationDetail) (json.RawMessage, error)
```

Use `GetInvocationDetail`, select only `AuthoritativeArtifactRefs`, and compute the response artifact ID deterministically from Invocation ID and attempt. `ContentHash` equals `detail.ArtifactSetHash`. For `asset_brief`, join output `assetId` values to the input `asset_catalog` payload and emit current workbench keys (`logicalAssetId`, `kind`, `name`, `scriptEvidence`, `description`, `imagePrompt`, `status`) solely in memory. For other stages, use the standard payload directly; never insert it into `workflow_artifacts`.

Map Invocation status exactly: planned/preflight/awaiting_confirmation to ready, queued/running/cancel_requested/needs_review/approved/rejected/applied/failed/cancelled to their same Workflow states, and partial/blocked to failed with the aggregate error summary.

- [ ] **Step 4: Make `GetWorkflowRunDetail` compose projections**

Load stored stages, project each non-empty `InvocationID`, replace the response copy of that stage, and append projected artifacts, gates, and AgentRuns. Root script stages project from their standard root Artifact. Keep response ordering deterministic by the five stage IDs, output ordinal, and gate execution ordinal.

- [ ] **Step 5: Run tests and commit**

Run: `go test ./service -run 'Test(ProjectWorkflowInvocation|GetWorkflowRunDetail)' -count=1`

Expected: PASS.

```bash
git add service/workflow_invocation_projection.go service/workflow_invocation_projection_test.go service/video_workflow_contracts.go service/video_workflow.go
git commit -m "feat: project invocation state into workflow detail"
```

### Task 4: Start Workflow stages through preflight and confirmation

**Files:**
- Modify: `service/video_workflow.go`
- Modify: `service/video_workflow_test.go`
- Create: `service/video_workflow_invocation_test.go`

- [ ] **Step 1: Write failing start tests**

Tests must prove confirmed scripts create a `source_text` root Artifact, start uses the recommended `3.1.0` Skill unless an exact published version is selected, frozen inputs point to approved standard Artifacts, cost confirmation is recorded, and idempotent replay returns the same stage/Invocation.

```go
func TestStartWorkflowStageCreatesAndConfirmsInvocation(t *testing.T) {
	detail := ensureVideoWorkflowTestRun(t)
	stage, err := StartWorkflowStage("user-1", detail.Run.ID, WorkflowStageAssetExtraction, "workflow-start-1")
	if err != nil { t.Fatal(err) }
	if stage.InvocationID == "" || stage.AgentRunID == "" || stage.Status != model.WorkflowStageRunStatusQueued { t.Fatalf("stage=%#v", stage) }
	run, ok, err := repository.GetUserInvocation("user-1", stage.InvocationID)
	if err != nil || !ok || run.Source != "workflow" || run.LatestAttempt != 1 { t.Fatalf("run=%#v ok=%v err=%v", run, ok, err) }
}
```

- [ ] **Step 2: Run tests and verify RED**

Run: `go test ./service -run 'TestStartWorkflowStageCreatesAndConfirmsInvocation' -count=1`

Expected: FAIL because start still creates an AgentRun directly.

- [ ] **Step 3: Create the root source Artifact**

In `EnsureWorkflowRun`, call an internal trusted-root helper using:

```go
CreateArtifactInput{
	ArtifactType: "source_text", SchemaVersion: "1.0.0",
	ProjectID: run.ProjectID, EpisodeID: run.EpisodeID,
	Payload: json.RawMessage(`{"text":` + strconv.Quote(input.ScriptSnapshot) + `}`),
}
```

Persist only its ID in the script stage. The script stage remains approved because the user already confirmed the text; it is not a generated output pretending to be reviewed.

- [ ] **Step 4: Replace direct AgentRun creation**

Build stage-specific standard input refs:

```go
func workflowInvocationInputs(detail WorkflowRunDetail, stageID string, context *WorkflowShotPromptContext) ([]ArtifactRefInput, json.RawMessage, error)
```

Bindings are `source_text` for script, `production_script` for asset extraction, `asset_catalog` for Brief generation, `production_script` plus `asset_catalog` for storyboard, and `storyboard_package` plus `asset_catalog` plus optional `asset_rendition` for video prompts. The current confirmed root script can feed asset extraction only through the script Skill when script adaptation is executed; when the UI intentionally treats confirmation as final production text, create a trusted `production_script` root beside `source_text` and store that standard ID on the approved script stage.

Call:

```go
snapshot, err := PreflightInvocation(userID, InvocationRequest{
	Source: "workflow", ProjectID: detail.Run.ProjectID, EpisodeID: detail.Run.EpisodeID,
	SkillVersionID: input.SkillVersionID, Capability: workflowStageSkillCapability(stageID),
	InputArtifactRefs: refs, Parameters: parameters, IdempotencyKey: input.IdempotencyKey,
})
response, err := confirmInvocationRun(userID, snapshot.Run, InvocationConfirmation{RequirementCodes: snapshot.ConfirmationRequirements})
```

Reject blocked preflight with its safe reason. Save a new stage row with `InvocationID`, latest attempt, queued state, estimated credits, primary input ID, and projected AgentRun ID. Never call `CreateUserAgentRun` from Workflow.

- [ ] **Step 5: Run start and workflow tests**

Run: `go test ./service -run 'Test(StartWorkflowStage|Workflow.*Invocation|EnsureWorkflowRun)' -count=1`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add service/video_workflow.go service/video_workflow_test.go service/video_workflow_invocation_test.go
git commit -m "feat: execute workflow stages through invocations"
```

### Task 5: Delegate lifecycle and Apply to Invocation

**Files:**
- Modify: `model/invocation.go`
- Modify: `repository/db.go`
- Modify: `service/invocation_apply.go`
- Modify: `service/invocation_apply_test.go`
- Modify: `service/video_workflow.go`
- Modify: `service/video_workflow_operations.go`
- Modify: `service/video_workflow_test.go`

- [ ] **Step 1: Write failing lifecycle delegation tests**

Assert cancel changes both Invocation and projected Workflow state; retry appends an Invocation attempt without changing the frozen revision; review compares the Artifact-set hash; Apply writes exactly one receipt on same-key replay and rejects a changed request.

- [ ] **Step 2: Run tests and verify RED**

Run: `go test ./service -run 'TestWorkflowInvocation(Cancel|Retry|Review|Apply)' -count=1`

Expected: FAIL because lifecycle endpoints still operate on AgentRun and Workflow content hashes.

- [ ] **Step 3: Add the transaction-safe receipt adapter**

Define `WorkflowLocalApplyReceipt` with `ID`, `UserID`, `InvocationID`, `ApplyAttemptID`, `WorkflowRunID`, `StageRunID`, `Target`, `TargetIDsJSON`, `AppliedCount`, `SkippedCount`, `Version`, `ErrorsJSON`, `MetadataJSON`, and `CreatedAt`. Register:

```go
var invocationApplyAdapters = map[string]InvocationApplyAdapter{
	"test_sink": invocationTestSinkAdapter{},
	"workflow_local_receipt": workflowLocalReceiptAdapter{},
}
```

The adapter decodes a bounded receipt from `TargetID`, verifies stage ownership and `InvocationID`, and writes one row inside `ApplyInvocationTx`. Target IDs and metadata are data only; they never choose another adapter or server table.

- [ ] **Step 4: Delegate Workflow lifecycle methods**

`ReviewWorkflowStage` loads the projection and calls `ReviewInvocation` with current attempt and Artifact-set hash. `CancelWorkflowStage` calls `CancelInvocation`. `RetryWorkflowStage` calls `RetryInvocation` and creates the next Workflow stage projection row linked to the same Invocation. `ApplyWorkflowStage` calls `ApplyInvocation` with target `workflow_local_receipt`, then returns the projected applied stage. Preserve current safe Chinese error messages at the Workflow boundary.

- [ ] **Step 5: Run tests and commit**

Run: `go test ./service -run 'Test(WorkflowInvocation|ApplyInvocation)' -count=1`

Expected: PASS.

```bash
git add model/invocation.go repository/db.go service/invocation_apply.go service/invocation_apply_test.go service/video_workflow.go service/video_workflow_operations.go service/video_workflow_test.go
git commit -m "feat: delegate workflow lifecycle to invocation runtime"
```

### Task 6: Keep the Workflow HTTP and workbench contract stable

**Files:**
- Modify: `web/src/services/api/workflow-runs-contract.ts`
- Modify: `web/src/services/api/workflow-runs-contract.test.mts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-artifact-mapping.ts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-artifact-mapping.test.mts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-run-console.tsx`

- [ ] **Step 1: Add failing additive-contract tests**

Assert `RemoteWorkflowStageRun` exposes `invocationId`, the artifact projection exposes `artifactSetHash` and `artifactIds`, and mapping accepts the standard `assetId/sourceEvidence/coreFacts` shape plus projected Brief fields without losing IDs.

- [ ] **Step 2: Run and verify RED**

Run: `node --experimental-strip-types web/src/services/api/workflow-runs-contract.test.mts && node --experimental-strip-types 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-artifact-mapping.test.mts'`

Expected: FAIL on missing fields/standard asset mappings.

- [ ] **Step 3: Add the fields and mapping**

Add `invocationId: string` to stages and these fields to projected artifacts:

```ts
artifactSetHash: string;
artifactIds: string[];
```

Keep all current fields. Update `parseAssetItems` so `assetId` maps to `logicalAssetId`, `sourceEvidence.join("\n")` maps to `scriptEvidence`, `coreFacts.join("；")` maps to `description`, and projected `brief` maps to `imagePrompt`. Show both the Workflow stage ID and Invocation ID in the console.

- [ ] **Step 4: Run focused frontend tests**

Run the two direct Node commands above.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/services/api/workflow-runs-contract.ts web/src/services/api/workflow-runs-contract.test.mts 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-artifact-mapping.ts' 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-artifact-mapping.test.mts' 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-run-console.tsx'
git commit -m "feat: expose workflow invocation projections"
```

### Task 7: End-to-end migration verification and documentation

**Files:**
- Create: `service/video_workflow_invocation_e2e_test.go`
- Modify: `handler/workflow_test.go`
- Modify: `docs/backend-database.md`
- Modify: `docs/api-response.md`
- Modify: `docs/todo.md`
- Modify: `docs/pending-test.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add the complete deterministic E2E test**

Use the fixed bus-stop script. Execute asset extraction, approve it, verify the approved Artifact becomes the exact parent of Brief and storyboard Invocations, execute Brief and storyboard, approve/apply, cancel/retry one stage, and assert every stage has an Invocation, standard Artifact lineage, gates, review, and idempotent Apply receipt. Query the legacy tables and assert zero content rows for the new run.

- [ ] **Step 2: Run focused E2E and verify GREEN**

Run: `go test ./service ./handler -run 'TestProductionWorkflowInvocationE2E|TestWorkflow.*Smoke' -count=1`

Expected: PASS.

- [ ] **Step 3: Run the complete repository verification**

Run:

```bash
go test ./... -count=1
cd web && npm test
cd web && npm run typecheck
cd web && npm run build
git diff --check
```

Expected: every command exits 0; Next produces the current route set without TypeScript errors.

- [ ] **Step 4: Perform browser acceptance**

Start an isolated mock model, Go service, and Next service on unused ports. In a fresh in-app browser tab, import the fixed script, run asset extraction and storyboard through the production Workflow page, inspect/approve/apply outputs, refresh the page, and verify the same Invocation-backed stage and artifacts restore. Exercise insufficient credits and invalid output; both must fail visibly without creating an approved Artifact. Finalize all browser tabs opened by the test.

- [ ] **Step 5: Update documentation**

Document `workflow_stage_runs.invocation_id`, `workflow_local_apply_receipts`, removal of new writes to legacy Workflow artifact/gate tables, additive response fields, and the tested user-visible changes. Move the Phase 3 item from `docs/todo.md` to `docs/pending-test.md`; summarize it once under `CHANGELOG.md` `Unreleased`.

- [ ] **Step 6: Commit**

```bash
git add service/video_workflow_invocation_e2e_test.go handler/workflow_test.go docs/backend-database.md docs/api-response.md docs/todo.md docs/pending-test.md CHANGELOG.md
git commit -m "test: verify production workflow invocation migration"
```

## Self-review

- Spec coverage: start, exact Skill freeze, input lineage, state projection, multi-output Artifact-set, hard gates, review, cancel, retry, Apply, stable HTTP/TypeScript contract, user isolation, E2E, browser acceptance, and documentation each have an owning task.
- Placeholder scan: the plan contains no unresolved marker, deferred implementation marker, or unspecified error-handling step.
- Type consistency: `WorkflowStageRun.InvocationID`, `workflowInvocationProjection`, `workflowArtifactSetID`, `workflowArtifactSetContent`, `workflowInvocationInputs`, and `WorkflowLocalApplyReceipt` retain the same names and meanings across tasks.
- Execution choice: the user authorized autonomous execution and prohibited further routine questions, so this plan uses Inline Execution with `executing-plans`; no subagents are used.
