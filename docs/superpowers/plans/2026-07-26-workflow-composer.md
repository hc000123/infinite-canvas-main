# Workflow Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a project-scoped Workflow Center where versioned DAGs compose published Skill and Agent nodes, preview deterministic routing and cost, publish immutable versions, and execute every node through the existing Invocation or Agent Plan runtime.

**Architecture:** Add `WorkflowDefinition` / `WorkflowVersion` as the design registry and `WorkflowExecution` / `WorkflowNodeExecution` as the generic orchestration projection; do not reuse the production-video `WorkflowRun` aggregate or copy Skill/Agent content. Published versions freeze exact Agent references and fixed Skill bindings, while `tag_route` and `manual_before_run` remain declared selectors resolved from real Artifact inputs at execution preflight. Skill nodes own one Invocation and Agent nodes own one Agent Plan; the Workflow execution only stores graph coordinates and derived status.

**Tech Stack:** Go 1.25, Gin, GORM, SQLite/MySQL/PostgreSQL, existing Skill/Agent/Artifact/Invocation runtimes, Next.js 16, React, TypeScript, Ant Design, Tailwind.

---

## Scope and invariants

- `WorkflowDefinition` is stable identity; every `WorkflowVersion` is immutable after publication.
- System Workflow objects are read-only to users. Project customization always copies to a project draft.
- Node keys are unique lowercase identifiers. The graph must be acyclic and every dependency/input edge must reference an existing upstream node.
- `fixed` resolves to an exact published Skill Version at publication; changing the recommended version later cannot affect the published Workflow.
- `tag_route` persists capability, expected output, tags and candidate scope. Route preview and execution save every candidate, score and rejection reason.
- `manual_before_run` must receive an exact compatible Skill Version selection before confirmation; the server never silently chooses one.
- Agent nodes freeze an exact published Agent Version at publication and may only use Skill overrides allowed by that Agent version.
- A Workflow execution never copies Artifact payloads. Node execution rows store Invocation/Agent Plan IDs and output Artifact references only.
- Downstream nodes consume approved Artifact references. `needs_review` is not treated as approved.
- One execution confirmation covers the current revision's frozen cost/side-effect requirements; Apply remains a separate idempotent operation.
- The production video `WorkflowRun` API remains unchanged in this phase.

## File map

- Create `model/workflow_registry.go`: Workflow definition/version/execution/node-execution records and enums.
- Create `repository/workflow_registry.go`: aggregate writes, visibility-safe reads, draft CAS transitions, execution projections.
- Modify `repository/db.go`: migrate six Workflow Composer tables.
- Create `service/workflow_registry_contracts.go`: version package, graph nodes, bindings, preview and execution DTOs.
- Create `service/workflow_registry.go`: definition/version CRUD, copy, validation, publish and recommendation.
- Create `service/workflow_graph.go`: canonical normalization, DAG validation and content hashing.
- Create `service/workflow_route_preview.go`: fixed/tag/manual resolution, Artifact contract propagation, cost and confirmation summary.
- Create `service/workflow_execution.go`: preflight, confirm, continue, cancel and node status projection.
- Create `handler/workflow_registry.go` and modify `router/router.go`: authenticated Workflow Center APIs.
- Create `web/src/services/api/workflow-registry.ts`: typed HTTP client.
- Create `web/src/app/(user)/projects/[id]/workflows/`: project Workflow Center, editor, route preview and run console.
- Modify `web/src/app/(user)/projects/[id]/components/project-episode-board.tsx`: add Workflow Center entry.
- Update database/API/todo/pending-test/changelog documentation after verification.

### Task 1: Persist Workflow definitions, immutable versions and execution projections

**Files:**
- Create: `model/workflow_registry.go`
- Create: `repository/workflow_registry.go`
- Modify: `repository/db.go`
- Test: `repository/workflow_registry_test.go`

- [ ] **Step 1: Write failing repository tests**

Cover an atomic definition + draft version create, user/project visibility, draft-only compare-and-swap update, publish conflict, exact recommended version, execution idempotency and one node row per `execution + revision + nodeKey`.

```go
func TestWorkflowRegistryPersistsDraftAndProtectsPublishedVersion(t *testing.T) {
	setupRepositoryTestDB(t)
	definition := model.WorkflowDefinition{ID: "workflow-def-1", OwnerType: model.WorkflowOwnerProject, OwnerUserID: "user-1", OwnerProjectID: "project-1", Name: "短剧制作", Enabled: true}
	version := model.WorkflowVersion{ID: "workflow-version-1", WorkflowID: definition.ID, Version: "1.0.0", Status: model.WorkflowVersionDraft, PackageJSON: `{"nodes":[]}`, ContentHash: "sha256:draft"}
	if err := CreateWorkflowDefinitionAggregate(definition, version); err != nil { t.Fatal(err) }
	version.Status = model.WorkflowVersionPublished
	if err := PublishWorkflowVersion(version); err != nil { t.Fatal(err) }
	if err := SaveWorkflowDraft(version); !errors.Is(err, ErrWorkflowVersionTransitionConflict) { t.Fatalf("err=%v", err) }
}
```

- [ ] **Step 2: Verify RED**

Run: `go test ./repository -run 'TestWorkflowRegistry' -count=1`

Expected: FAIL because Workflow Composer models and repository functions do not exist.

- [ ] **Step 3: Add the exact records**

Define:

```go
type WorkflowOwnerType string
type WorkflowVersionStatus string
type WorkflowExecutionStatus string
type WorkflowNodeExecutionStatus string

type WorkflowDefinition struct { ID, Name, Summary, TagsJSON, OwnerUserID, OwnerProjectID, RecommendedVersionID, CreatedAt, UpdatedAt string; OwnerType WorkflowOwnerType; Enabled bool }
type WorkflowVersion struct { ID, WorkflowID, Version, PackageJSON, ContentHash, CreatedBy, PublishedAt, CreatedAt, UpdatedAt string; Status WorkflowVersionStatus }
type WorkflowExecution struct { ID, UserID, ProjectID, EpisodeID, WorkflowID, WorkflowVersionID, WorkflowContentHash, Status, IdempotencyKey, RequestHash, ConfirmationFingerprint, CreatedAt, UpdatedAt string; Revision int; EstimatedCredits int64 }
type WorkflowExecutionRevision struct { ID, UserID, WorkflowExecutionID, WorkflowVersionID, WorkflowContentHash, RoutePreviewJSON, InputArtifactRefsJSON, ManualSelectionsJSON, ConfirmationRequirementsJSON, ConfirmationFingerprint, CreatedAt string; Revision int; EstimatedCredits int64 }
type WorkflowNodeExecution struct { ID, UserID, WorkflowExecutionID, NodeKey, ExecutorType, InvocationID, AgentPlanID, Status, OutputArtifactRefsJSON, ErrorCode, ErrorMessage, CreatedAt, UpdatedAt string; Revision, Ordinal int }
type WorkflowExecutionConfirmation struct { ID, UserID, WorkflowExecutionID, Fingerprint, RequirementCodesJSON, ConfirmedAt string; Revision int; EstimatedCredits int64 }
```

Use explicit JSON/GORM tags following `model/agent_registry.go`; unique indexes protect owner/name, workflow/version, execution/idempotency, execution/revision and execution/revision/node key. Add all six models to `AutoMigrate`.

- [ ] **Step 4: Implement repository transitions**

Add exact definition/version CRUD and list methods matching the Agent registry conventions, plus:

```go
func CreateWorkflowExecutionAggregateIdempotently(run model.WorkflowExecution, revision model.WorkflowExecutionRevision, nodes []model.WorkflowNodeExecution) (model.WorkflowExecution, bool, error)
func AppendWorkflowExecutionRevision(run model.WorkflowExecution, revision model.WorkflowExecutionRevision, nodes []model.WorkflowNodeExecution, allowedFrom model.WorkflowExecutionStatus) error
func SaveWorkflowExecutionProjection(run model.WorkflowExecution, nodes []model.WorkflowNodeExecution) error
```

Every transition uses a transaction and a status/revision compare-and-swap; replay with the same idempotency key returns the existing execution, while a changed request hash returns a conflict.

- [ ] **Step 5: Verify GREEN and commit**

Run: `go test ./repository -run 'TestWorkflowRegistry' -count=1`

Expected: PASS.

```bash
git add model/workflow_registry.go repository/workflow_registry.go repository/workflow_registry_test.go repository/db.go
git commit -m "feat: persist composable workflow registry"
```

### Task 2: Normalize and validate the Workflow graph

**Files:**
- Create: `service/workflow_registry_contracts.go`
- Create: `service/workflow_graph.go`
- Test: `service/workflow_graph_test.go`

- [ ] **Step 1: Write failing graph tests**

Test canonical node ordering, unique node keys, cycle rejection, missing dependency rejection, duplicate input binding rejection, upstream output type agreement, executor-specific references and deterministic content hashing.

```go
func TestNormalizeWorkflowPackageRejectsCycle(t *testing.T) {
	_, err := NormalizeWorkflowPackage(WorkflowPackage{Nodes: []WorkflowNodeSpec{
		{NodeKey: "a", Name: "A", ExecutorType: "skill", DependsOn: []string{"b"}, SkillBinding: &WorkflowSkillBinding{Mode: "fixed", SkillID: "skill-a"}, OutputArtifactType: "asset_catalog"},
		{NodeKey: "b", Name: "B", ExecutorType: "skill", DependsOn: []string{"a"}, SkillBinding: &WorkflowSkillBinding{Mode: "fixed", SkillID: "skill-b"}, OutputArtifactType: "asset_brief"},
	}})
	if err == nil || !strings.Contains(err.Error(), "循环") { t.Fatalf("err=%v", err) }
}
```

- [ ] **Step 2: Verify RED**

Run: `go test ./service -run 'TestNormalizeWorkflowPackage' -count=1`

Expected: FAIL because the package contract does not exist.

- [ ] **Step 3: Define the public package**

```go
type WorkflowPackage struct { InputArtifactTypes []string `json:"inputArtifactTypes"`; Nodes []WorkflowNodeSpec `json:"nodes"`; ContentHash string `json:"contentHash"` }
type WorkflowNodeSpec struct { NodeKey, Name, ExecutorType, OutputArtifactType string; AgentRef *WorkflowAgentRef; SkillBinding *WorkflowSkillBinding; InputBindings []WorkflowNodeInputBinding; DependsOn []string; Condition *WorkflowCondition; ConfirmationPolicy WorkflowConfirmationPolicy; RetryPolicy WorkflowRetryPolicy }
type WorkflowSkillBinding struct { Mode, SkillID, SkillVersionID, SkillVersionConstraint, Capability, ExpectedOutputArtifactType string; ProjectTags, CandidateSkillIDs []string }
type WorkflowAgentRef struct { AgentID, AgentVersionID, AgentVersionConstraint string }
type WorkflowNodeInputBinding struct { BindingName, ArtifactType, Source, WorkflowInputName, FromNodeKey, FromOutputBinding string; Required bool }
type WorkflowCondition struct { Source, Key, Operator string; Value json.RawMessage }
```

Only support `equals`, `not_equals`, `contains` and `exists` conditions over invocation parameters in v1. `Source` is `workflow_input` or `node_output`; arbitrary code and model-evaluated conditions are forbidden.

- [ ] **Step 4: Implement normalization and DAG validation**

Normalize identifiers to lowercase, sort set-like fields, retain declared node order as execution ordinal, derive dependencies from both `dependsOn` and `fromNodeKey`, and run Kahn topological sorting. Reject empty graphs, more than 64 nodes, self-dependencies, cycles, unknown bindings, multiple producers for one required binding, and executor/reference mismatches. Canonicalize the package without `contentHash`, compute `sha256:...`, then return the normalized value.

- [ ] **Step 5: Verify GREEN and commit**

Run: `go test ./service -run 'TestNormalizeWorkflowPackage' -count=1`

Expected: PASS.

```bash
git add service/workflow_registry_contracts.go service/workflow_graph.go service/workflow_graph_test.go
git commit -m "feat: validate composable workflow graphs"
```

### Task 3: Add Workflow registry CRUD, project copy and immutable publication

**Files:**
- Create: `service/workflow_registry.go`
- Test: `service/workflow_registry_test.go`

- [ ] **Step 1: Write failing service tests**

Cover project ownership, system read-only behavior, copy-to-project, semantic versions, draft update, fixed Skill and Agent exact-version resolution, tag/manual declaration validation, publication hash stability and recommendation.

```go
func TestPublishWorkflowVersionFreezesFixedReferences(t *testing.T) {
	fixture := workflowRegistryFixture(t)
	detail, err := PublishWorkflowVersion(fixture.UserID, fixture.VersionID)
	if err != nil { t.Fatal(err) }
	node := detail.Package.Nodes[0]
	if node.SkillBinding.SkillVersionID != fixture.RecommendedSkillVersionID || detail.Version.Status != model.WorkflowVersionPublished { t.Fatalf("detail=%#v", detail) }
}
```

- [ ] **Step 2: Verify RED**

Run: `go test ./service -run 'Test(WorkflowRegistry|PublishWorkflowVersion)' -count=1`

Expected: FAIL because registry service functions are absent.

- [ ] **Step 3: Implement registry operations**

Add `ListVisibleWorkflows`, `GetVisibleWorkflow`, `GetVisibleWorkflowVersion`, `CreateProjectWorkflow`, `CopyWorkflowToProject`, `CreateWorkflowDraft`, `UpdateWorkflowDraft`, `ValidateWorkflowVersion`, `PublishWorkflowVersion`, and `RecommendWorkflowVersion`. Follow Agent registry visibility exactly: system is visible to all authenticated users; project requires matching user and project.

Publication resolves each fixed Skill with `ResolveInvocationSkill`, resolves Agent references to exact published versions, writes the exact IDs back into the normalized package, recomputes content hash, then transitions draft to published in one transaction. Tag/manual bindings must have capability, output type and candidate scope but intentionally keep no chosen version.

- [ ] **Step 4: Verify GREEN and commit**

Run: `go test ./service -run 'Test(WorkflowRegistry|PublishWorkflowVersion)' -count=1`

Expected: PASS.

```bash
git add service/workflow_registry.go service/workflow_registry_test.go
git commit -m "feat: publish versioned workflow definitions"
```

### Task 4: Preview routing, contracts, confirmations and cost

**Files:**
- Create: `service/workflow_route_preview.go`
- Test: `service/workflow_route_preview_test.go`

- [ ] **Step 1: Write failing preview tests**

Use real Artifact fixtures and published Skill versions to prove:

- fixed uses the frozen exact Skill version;
- tag route returns stable accepted/rejected candidates and reasons;
- manual route blocks without a selection and accepts only a compatible exact version;
- downstream contracts are validated from upstream output specs without creating Artifacts;
- Agent nodes expose their exact Agent version and resolved default Skill chain;
- total estimated credits and confirmation requirements are deterministic.

```go
func TestPreviewWorkflowRouteRequiresManualSelection(t *testing.T) {
	fixture := manualWorkflowPreviewFixture(t)
	preview, err := PreviewWorkflowVersion(fixture.UserID, fixture.VersionID, WorkflowPreviewInput{ProjectID: fixture.ProjectID, InputArtifactRefs: fixture.InputRefs})
	if err != nil { t.Fatal(err) }
	if preview.Executable || preview.Nodes[0].BlockCode != "manual_selection_required" { t.Fatalf("preview=%#v", preview) }
}
```

- [ ] **Step 2: Verify RED**

Run: `go test ./service -run 'TestPreviewWorkflowRoute' -count=1`

Expected: FAIL because preview does not exist.

- [ ] **Step 3: Implement deterministic preview**

Walk nodes in topological order. Root inputs use `ResolveArtifactRefs`. Fixed and selected manual nodes call `ResolveInvocationSkill` with the exact version; tag nodes call it with capability, expected output, tags and allowed candidates. For not-yet-produced downstream inputs, build contract-only bindings from the selected upstream output specs and run the same type/schema/cardinality checks without fabricating database Artifacts.

Return `WorkflowRoutePreview` containing node order, executor, exact Agent/Skill version when selected, full `InvocationRouteTrace`, input/output contracts, block code/message, estimated credits and confirmation codes. Cost uses the same executor policy and credit estimator as Invocation preflight; do not introduce a second price table.

- [ ] **Step 4: Verify GREEN and commit**

Run: `go test ./service -run 'TestPreviewWorkflowRoute' -count=1`

Expected: PASS.

```bash
git add service/workflow_route_preview.go service/workflow_route_preview_test.go
git commit -m "feat: preview workflow routes and contracts"
```

### Task 5: Execute Skill and Agent nodes through the shared runtime

**Files:**
- Create: `service/workflow_execution.go`
- Test: `service/workflow_execution_test.go`
- Test: `service/workflow_execution_e2e_test.go`

- [ ] **Step 1: Write failing execution tests**

Cover idempotent preflight, changed-request conflict, aggregate confirmation fingerprint, parallel ready roots, approved-only downstream unlock, Skill node Invocation ownership, Agent node Agent Plan ownership, manual selection freeze, cancel propagation, retry preserving Workflow version/hash and refresh after reload.

```go
func TestWorkflowExecutionUnlocksOnlyApprovedParents(t *testing.T) {
	fixture := workflowExecutionFixture(t)
	execution, err := PreflightWorkflowExecution(fixture.UserID, fixture.Request)
	if err != nil { t.Fatal(err) }
	execution, err = ConfirmWorkflowExecution(fixture.UserID, execution.Run.ID, WorkflowExecutionConfirmationInput{Fingerprint: execution.Run.ConfirmationFingerprint, RequirementCodes: execution.ConfirmationRequirements})
	if err != nil { t.Fatal(err) }
	if execution.Nodes[1].Status != model.WorkflowNodeExecutionBlocked { t.Fatalf("nodes=%#v", execution.Nodes) }
}
```

- [ ] **Step 2: Verify RED**

Run: `go test ./service -run 'TestWorkflowExecution' -count=1`

Expected: FAIL because generic Workflow execution is absent.

- [ ] **Step 3: Implement preflight and confirmation**

`PreflightWorkflowExecution` loads a published visible version, previews routes from real Artifact refs, freezes the preview/manual selections/input hashes, creates node projection rows, and returns blocked reasons without starting work. `ConfirmWorkflowExecution` requires the exact fingerprint and requirement set, writes one confirmation, then starts every ready root node.

Skill nodes call `PreflightInvocation` with `source=workflow`, the exact selected Skill Version, frozen inputs/parameters and `workflow-execution:<execution>:<revision>:<node>` idempotency key, then call `confirmInvocationRun`. Agent nodes call `CreateAgentPlan`, `PreflightAgentPlan` and `ConfirmAgentPlan` with the exact Agent version and permitted Skill overrides.

- [ ] **Step 4: Implement continue, review projection and cancellation**

`ContinueWorkflowExecution` refreshes every active node from Invocation/Agent Plan detail, records authoritative Artifact refs for approved/completed nodes, evaluates deterministic conditions, and starts newly ready nodes. It never approves child output automatically. `CancelWorkflowExecution` delegates to `CancelInvocation` or `CancelAgentPlan` and then marks the aggregate cancelled. A failed node makes the aggregate failed; mixed terminal/active nodes make it partial; all outputs approved/completed make it completed.

- [ ] **Step 5: Add fixed-script E2E**

Use the bus-stop screenplay root Artifact with a two-root/one-join DAG: asset extraction and classification may run in parallel; storyboard waits for approved parents; an Agent node then composes the final prompt. Assert exact frozen versions, candidate trace, Artifact lineage, cost confirmation, retry/cancel and reload-stable coordinates.

- [ ] **Step 6: Verify GREEN and commit**

Run: `go test ./service -run 'TestWorkflowExecution' -count=1`

Expected: PASS.

```bash
git add service/workflow_execution.go service/workflow_execution_test.go service/workflow_execution_e2e_test.go
git commit -m "feat: execute composable workflows"
```

### Task 6: Expose safe Workflow APIs

**Files:**
- Create: `handler/workflow_registry.go`
- Modify: `router/router.go`
- Test: `handler/workflow_registry_test.go`
- Test: `router/router_test.go`

- [ ] **Step 1: Write failing HTTP tests**

Cover list/detail/create/copy/version update/validate/preview/publish/recommend, execution preflight/confirm/continue/cancel and user isolation. Assert `{code,data,msg}`, strict body decoding, no stored JSON fields, idempotency keys or private Agent/Skill content in responses.

- [ ] **Step 2: Verify RED**

Run: `go test ./handler ./router -run 'TestWorkflowRegistry' -count=1`

Expected: FAIL on missing routes.

- [ ] **Step 3: Register the API**

Add:

```text
GET    /api/v1/workflows?projectId=
POST   /api/v1/workflows
GET    /api/v1/workflows/:id?projectId=
POST   /api/v1/workflows/:id/copy
POST   /api/v1/workflows/:id/versions
GET    /api/v1/workflow-versions/:id
PATCH  /api/v1/workflow-versions/:id
POST   /api/v1/workflow-versions/:id/validate
POST   /api/v1/workflow-versions/:id/preview
POST   /api/v1/workflow-versions/:id/publish
PUT    /api/v1/workflows/:id/recommended-version
POST   /api/v1/workflow-executions/preflight
GET    /api/v1/workflow-executions/:id
POST   /api/v1/workflow-executions/:id/confirm
POST   /api/v1/workflow-executions/:id/continue
POST   /api/v1/workflow-executions/:id/cancel
```

Handlers only decode, call service and return `OK`/`FailError`.

- [ ] **Step 4: Verify GREEN and commit**

Run: `go test ./handler ./router -run 'TestWorkflowRegistry' -count=1`

Expected: PASS.

```bash
git add handler/workflow_registry.go handler/workflow_registry_test.go router/router.go router/router_test.go
git commit -m "feat: expose workflow composer api"
```

### Task 7: Build the project Workflow Center

**Files:**
- Create: `web/src/services/api/workflow-registry.ts`
- Create: `web/src/services/api/workflow-registry.test.mts`
- Create: `web/src/app/(user)/projects/[id]/workflows/page.tsx`
- Create: `web/src/app/(user)/projects/[id]/workflows/workflow-editor-model.ts`
- Create: `web/src/app/(user)/projects/[id]/workflows/workflow-editor-model.test.mts`
- Create: `web/src/app/(user)/projects/[id]/workflows/components/workflow-registry-list.tsx`
- Create: `web/src/app/(user)/projects/[id]/workflows/components/workflow-version-editor.tsx`
- Create: `web/src/app/(user)/projects/[id]/workflows/components/workflow-route-preview.tsx`
- Create: `web/src/app/(user)/projects/[id]/workflows/components/workflow-execution-console.tsx`
- Modify: `web/src/app/(user)/projects/[id]/components/project-episode-board.tsx`

- [ ] **Step 1: Add failing API/model tests**

Assert typed contract parsing, node insertion/removal, dependency cleanup, topological grouping, fixed/tag/manual binding serialization, server issue mapping and route preview presentation.

- [ ] **Step 2: Verify RED**

Run: `cd web && node --experimental-strip-types src/services/api/workflow-registry.test.mts && node --experimental-strip-types 'src/app/(user)/projects/[id]/workflows/workflow-editor-model.test.mts'`

Expected: FAIL because files are absent.

- [ ] **Step 3: Implement the API client and pure editor model**

Use the existing `request` helper and explicit remote DTOs. Keep graph editing pure: node order, dependencies and bindings live in one `WorkflowPackage` state; do not introduce another store. Map server block/candidate codes to Chinese descriptions without hiding raw stable codes.

- [ ] **Step 4: Implement the page**

Use a three-region layout consistent with Agent Center: registry list, version/node editor, and preview/run panel. Represent the DAG as compact topological lanes with dependency chips; do not add a second canvas library. Each node editor exposes executor, Agent/Skill binding mode, inputs, output, condition and confirmation. Preview shows exact versions, candidates/rejection reasons, cost and blocking issues. Running always requires an explicit confirmation modal when requirements are non-empty.

- [ ] **Step 5: Add project navigation and verify**

Add `Workflow 中心` beside Agent Center in the project navigation. Run focused tests, `npm run typecheck`, and production build.

- [ ] **Step 6: Commit**

```bash
git add web/src/services/api/workflow-registry.ts web/src/services/api/workflow-registry.test.mts 'web/src/app/(user)/projects/[id]/workflows' 'web/src/app/(user)/projects/[id]/components/project-episode-board.tsx'
git commit -m "feat: add project workflow center"
```

### Task 8: Full verification, browser acceptance and documentation

**Files:**
- Modify: `docs/backend-database.md`
- Modify: `docs/api-response.md`
- Modify: `docs/todo.md`
- Modify: `docs/pending-test.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Run all deterministic verification**

```bash
go test ./... -count=1
cd web && npm test
cd web && npm run typecheck
cd web && npm run build
git diff --check
```

Expected: every command exits 0 and Next generates `/projects/[id]/workflows`.

- [ ] **Step 2: Perform browser acceptance**

In a fresh project, copy a system Workflow, add one fixed Skill node, one tag-routed Skill node and one manual Skill node, validate and publish. Preview with the fixed screenplay Artifact; verify candidates/reasons, choose the manual version, confirm the execution, approve the first output, continue, refresh and confirm the same Workflow/Invocation/Artifact coordinates restore. Create a deliberate cycle and an incompatible manual selection and verify both are blocked without starting a model task.

- [ ] **Step 3: Update documentation**

Document all six tables, the safe API response contracts, three routing modes and execution lineage. Move only Phase 5 from `docs/todo.md` to `docs/pending-test.md`; leave Phase 6 and final real-model effect acceptance in todo. Summarize once under `CHANGELOG.md` `Unreleased`.

- [ ] **Step 4: Commit**

```bash
git add docs/backend-database.md docs/api-response.md docs/todo.md docs/pending-test.md CHANGELOG.md
git commit -m "test: verify workflow composer runtime"
```

## Self-review

- Spec coverage: identity/versioning, project copy, fixed/tag/manual routing, graph validation, route trace, cost, contracts, publication, runtime execution, confirmation, Artifact lineage, Agent/Skill nodes, cancellation, API, UI and browser acceptance each have one owning task.
- Boundary check: the production video Workflow remains untouched; generic execution delegates to Invocation/Agent Plan and never duplicates their snapshots, gates, reviews or Artifact payloads.
- Placeholder scan: no deferred implementation markers or unspecified validation/error steps remain.
- Phase boundary: canvas chat and image-page consumers remain Phase 6, but they will call the APIs implemented here without another orchestration runtime.
- Execution choice: the user authorized autonomous execution and asked not to be prompted for routine choices, so implementation uses the current isolated worktree and `executing-plans` without subagents.
