# Agent Registry + Runtime Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a visible Agent Center where versioned Agents compose published Skills into a confirmed sequential Temporary Plan executed through the existing Invocation/Artifact runtime.

**Architecture:** Add immutable Agent Definition/Version records and a revisioned Agent Plan aggregate. Plan preflight resolves exact Skill versions and validates symbolic step handoffs; plan execution materializes one existing Invocation at a time, pauses for review, then binds approved Artifact output into the next step. The project Agent Center becomes a registry editor plus run console and does not write the legacy fixed-kind Agent preset store.

**Tech Stack:** Go, Gin, GORM, SQLite/MySQL/Postgres, Next.js App Router, React, TypeScript, Ant Design, TanStack Query, existing Invocation API and Artifact schemas.

---

## File map

### Backend domain and persistence

- Create `model/agent_registry.go`: Agent Definition/Version enums and persistence fields.
- Create `model/agent_plan.go`: Agent Plan, Revision, Step and confirmation records.
- Modify `repository/db.go`: migrate the six new tables.
- Create `repository/agent_registry.go`: atomic create, draft update, publish, recommend and visibility queries.
- Create `repository/agent_plan.go`: idempotent aggregate creation, revision append and guarded state transitions.

### Backend services and HTTP

- Create `service/agent_registry_contracts.go`: JSON-safe policies, Skill refs and request/response DTOs.
- Create `service/agent_registry.go`: normalization, hashes, ownership, validation and publishing.
- Create `service/agent_seed.go`: idempotent system Agent seeds that reference published system Skills.
- Create `service/agent_plan_contracts.go`: plan request, step binding, preflight and confirmation DTOs.
- Create `service/agent_plan.go`: plan lifecycle and query assembly.
- Create `service/agent_plan_preflight.go`: exact Skill resolution and symbolic contract compatibility.
- Create `service/agent_plan_execution.go`: bridge from confirmed plan steps to existing Invocation lifecycle.
- Create `handler/agent_registry.go` and `handler/agent_plan.go`: HTTP-only adapters.
- Modify `router/router.go`: register authenticated `/api/v1/agents`, `/agent-versions` and `/agent-plans` routes.

### Frontend

- Create `web/src/services/api/agent-registry.ts`: registry DTO and client functions.
- Create `web/src/services/api/agent-plans.ts`: plan DTO and client functions.
- Replace `web/src/app/(user)/projects/[id]/agents/page.tsx`: new page assembly.
- Create `web/src/app/(user)/projects/[id]/agents/components/agent-registry-list.tsx`.
- Create `web/src/app/(user)/projects/[id]/agents/components/agent-version-editor.tsx`.
- Create `web/src/app/(user)/projects/[id]/agents/components/agent-run-console.tsx`.
- Create `web/src/app/(user)/projects/[id]/agents/agent-center-utils.ts` and focused `.test.mts`.

### Verification and docs

- Create repository, service and handler focused tests named below.
- Modify `docs/backend-database.md`, `docs/todo.md`, `docs/pending-test.md` and `CHANGELOG.md` after implementation is green.

## Task 1: Add Agent Registry and Plan persistence models

**Files:**
- Create: `model/agent_registry.go`
- Create: `model/agent_plan.go`
- Modify: `repository/db.go`
- Test: `repository/agent_registry_migration_test.go`

- [ ] **Step 1: Write the failing migration test**

```go
func TestAgentRegistryAndPlanTablesMigrate(t *testing.T) {
    setupRepositoryTestDB(t)
    database, _ := DB()
    tables := []string{
        "agent_definitions", "agent_versions", "agent_plans",
        "agent_plan_revisions", "agent_plan_steps", "agent_plan_confirmations",
    }
    for _, table := range tables {
        if !database.Migrator().HasTable(table) {
            t.Fatalf("missing table %s", table)
        }
    }
}
```

- [ ] **Step 2: Run the test and verify RED**

Run: `go test ./repository -run TestAgentRegistryAndPlanTablesMigrate -count=1`

Expected: FAIL with `missing table agent_definitions`.

- [ ] **Step 3: Define the registry models**

```go
type AgentOwnerType string
type AgentVersionStatus string

const (
    AgentOwnerSystem AgentOwnerType = "system"
    AgentOwnerProject AgentOwnerType = "project"
    AgentVersionDraft AgentVersionStatus = "draft"
    AgentVersionPublished AgentVersionStatus = "published"
    AgentVersionRetired AgentVersionStatus = "retired"
)

type AgentDefinition struct {
    ID string `json:"id" gorm:"primaryKey"`
    Name string `json:"name" gorm:"index;uniqueIndex:idx_agent_owner_name,priority:4"`
    Summary string `json:"summary" gorm:"type:text"`
    TagsJSON string `json:"-" gorm:"type:text"`
    OwnerType AgentOwnerType `json:"ownerType" gorm:"index;uniqueIndex:idx_agent_owner_name,priority:1"`
    OwnerUserID string `json:"ownerUserId" gorm:"index;uniqueIndex:idx_agent_owner_name,priority:2"`
    OwnerProjectID string `json:"ownerProjectId" gorm:"index;uniqueIndex:idx_agent_owner_name,priority:3"`
    Enabled bool `json:"enabled" gorm:"index"`
    RecommendedVersionID string `json:"recommendedVersionId" gorm:"index"`
    CreatedAt string `json:"createdAt"`
    UpdatedAt string `json:"updatedAt"`
}

type AgentVersion struct {
    ID string `json:"id" gorm:"primaryKey"`
    AgentID string `json:"agentId" gorm:"index;uniqueIndex:idx_agent_version,priority:1"`
    Version string `json:"version" gorm:"uniqueIndex:idx_agent_version,priority:2"`
    Status AgentVersionStatus `json:"status" gorm:"index"`
    RolePrompt string `json:"-" gorm:"type:text"`
    PlannerMode string `json:"plannerMode" gorm:"index"`
    DefaultSkillRefsJSON string `json:"-" gorm:"type:text"`
    SkillAccessPolicyJSON string `json:"-" gorm:"type:text"`
    ModelPolicyJSON string `json:"-" gorm:"type:text"`
    ToolPolicyJSON string `json:"-" gorm:"type:text"`
    ExecutionPolicyJSON string `json:"-" gorm:"type:text"`
    ContentHash string `json:"contentHash" gorm:"index"`
    CreatedBy string `json:"createdBy" gorm:"index"`
    PublishedAt string `json:"publishedAt"`
    CreatedAt string `json:"createdAt"`
    UpdatedAt string `json:"updatedAt"`
}
```

- [ ] **Step 4: Define the plan models**

```go
type AgentPlanStatus string

const (
    AgentPlanDraft AgentPlanStatus = "draft"
    AgentPlanAwaitingConfirmation AgentPlanStatus = "awaiting_confirmation"
    AgentPlanRunning AgentPlanStatus = "running"
    AgentPlanNeedsReview AgentPlanStatus = "needs_review"
    AgentPlanCompleted AgentPlanStatus = "completed"
    AgentPlanBlocked AgentPlanStatus = "blocked"
    AgentPlanFailed AgentPlanStatus = "failed"
    AgentPlanCancelled AgentPlanStatus = "cancelled"
)

type AgentPlan struct {
    ID, UserID, ProjectID, EpisodeID string
    AgentID, AgentVersionID, Goal string
    Status AgentPlanStatus `gorm:"index"`
    CurrentRevision int
    EstimatedCredits int64
    ConfirmationFingerprint string `gorm:"index"`
    IdempotencyKey string `gorm:"uniqueIndex:idx_agent_plan_idempotency,priority:2"`
    RequestHash string
    CreatedAt, UpdatedAt string
}

type AgentPlanRevision struct {
    ID, UserID, AgentPlanID string
    Revision int `gorm:"uniqueIndex:idx_agent_plan_revision,priority:2"`
    AgentVersionID, AgentContentHash string
    Goal, SourceArtifactRefsJSON, PlanSnapshotJSON string
    ConfirmationFingerprint string
    EstimatedCredits int64
    CreatedAt string
}

type AgentPlanStep struct {
    ID, UserID, AgentPlanID string
    Revision, Ordinal int
    StepKey, Label, Capability string
    SkillID, SkillVersionID, SkillVersion, SkillContentHash string
    InputBindingsJSON, ParametersJSON, ExpectedOutputType string
    InvocationID string `gorm:"index"`
    Status string `gorm:"index"`
    OutputArtifactRefsJSON, ErrorCode, ErrorMessage string
    CreatedAt, UpdatedAt string
}

type AgentPlanConfirmation struct {
    ID, UserID, AgentPlanID string
    Revision int
    Fingerprint string
    EstimatedCredits int64
    RequirementCodesJSON string
    ConfirmedAt string
}
```

Add explicit JSON and GORM tags in the implementation, including unique `(agent_plan_id, revision, ordinal)` and `(agent_plan_id, revision)` indexes.

- [ ] **Step 5: Add all six models to `AutoMigrate` and verify GREEN**

Run: `gofmt -w model/agent_registry.go model/agent_plan.go repository/agent_registry_migration_test.go repository/db.go && go test ./repository -run TestAgentRegistryAndPlanTablesMigrate -count=1`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add model/agent_registry.go model/agent_plan.go repository/db.go repository/agent_registry_migration_test.go
git commit -m "feat: add agent registry and plan models"
```

## Task 2: Implement atomic Agent Registry persistence

**Files:**
- Create: `repository/agent_registry.go`
- Test: `repository/agent_registry_test.go`

- [ ] **Step 1: Write failing visibility and immutability tests**

```go
func TestListVisibleAgentDefinitionsSeparatesProjects(t *testing.T) {
    setupRepositoryTestDB(t)
    mustCreateAgentAggregate(t, model.AgentOwnerSystem, "", "", "system")
    mustCreateAgentAggregate(t, model.AgentOwnerProject, "user-1", "project-1", "owned")
    mustCreateAgentAggregate(t, model.AgentOwnerProject, "user-2", "project-2", "hidden")
    items, err := ListVisibleAgentDefinitions("user-1", "project-1")
    if err != nil || len(items) != 2 { t.Fatalf("items=%#v err=%v", items, err) }
}

func TestPublishAgentVersionUsesCompareAndSwap(t *testing.T) {
    setupRepositoryTestDB(t)
    agent, version := mustCreateAgentAggregate(t, model.AgentOwnerProject, "user-1", "project-1", "director")
    version.Status, version.PublishedAt = model.AgentVersionPublished, "2026-07-26T00:00:00Z"
    if err := PublishAgentVersion(version); err != nil { t.Fatal(err) }
    if err := PublishAgentVersion(version); !errors.Is(err, ErrAgentVersionTransitionConflict) { t.Fatalf("err=%v agent=%s", err, agent.ID) }
}
```

- [ ] **Step 2: Run and verify RED**

Run: `go test ./repository -run 'Test(ListVisibleAgentDefinitions|PublishAgentVersion)' -count=1`

Expected: build failure because repository functions do not exist.

- [ ] **Step 3: Implement repository operations**

Implement these exact signatures:

```go
var ErrAgentVersionTransitionConflict = errors.New("Agent 版本状态已变化")

func CreateAgentAggregate(agent model.AgentDefinition, version model.AgentVersion) error
func GetAgentDefinition(id string) (model.AgentDefinition, bool, error)
func GetAgentVersion(id string) (model.AgentVersion, bool, error)
func ListAgentVersions(agentID string) ([]model.AgentVersion, error)
func ListVisibleAgentDefinitions(userID, projectID string) ([]model.AgentDefinition, error)
func SaveAgentDraft(version model.AgentVersion) error
func CreateAgentVersion(version model.AgentVersion) error
func PublishAgentVersion(version model.AgentVersion) error
func SetRecommendedAgentVersion(agentID, versionID, updatedAt string) error
```

`SaveAgentDraft` must update with `WHERE id = ? AND status = 'draft'`; published rows must return `ErrAgentVersionTransitionConflict`.

- [ ] **Step 4: Verify repository tests**

Run: `gofmt -w repository/agent_registry.go repository/agent_registry_test.go && go test ./repository -run 'Agent(Definition|Version|Registry)' -count=1`

Expected: PASS with no race or unique-index error.

- [ ] **Step 5: Commit**

```bash
git add repository/agent_registry.go repository/agent_registry_test.go
git commit -m "feat: persist versioned agents"
```

## Task 3: Add Agent Registry contracts, validation and publishing

**Files:**
- Create: `service/agent_registry_contracts.go`
- Create: `service/agent_registry.go`
- Create: `service/agent_seed.go`
- Modify: `main.go`
- Test: `service/agent_registry_test.go`
- Test: `service/agent_seed_test.go`

- [ ] **Step 1: Write failing contract and publishing tests**

```go
func TestPublishAgentRejectsSkillOutsideAccessPolicy(t *testing.T) {
    setupInvocationServiceTest(t)
    _, skillVersion := seedInvocationSkill(t, invocationSkillSeed{ID:"skill-1", VersionID:"skill-v1", Version:"1.0.0", Recommended:true})
    created, err := CreateProjectAgent("user-1", AgentCreateInput{
        ProjectID:"project-1", Name:"导演", Version:"1.0.0",
        Package: AgentPackage{PlannerMode:"configured_chain", DefaultSkillRefs:[]AgentSkillRef{{StepKey:"write", SkillVersionID:skillVersion.ID}}, SkillAccessPolicy:AgentSkillAccessPolicy{AllowedSkillIDs:[]string{"another-skill"}}},
    })
    if err != nil { t.Fatal(err) }
    if _, err := PublishAgentVersion("user-1", created.Version.ID); err == nil || !strings.Contains(err.Error(), "访问范围") { t.Fatalf("err=%v", err) }
}

func TestPublishedAgentPackageRoundTripsWithoutSkillBody(t *testing.T) {
    // Create, validate and publish a project Agent; assert decoded refs contain IDs only,
    // content hash is non-empty, and no Skill files/schema fields exist in AgentPackage.
}

func TestEnsureAgentSeedsReferencesPublishedSkills(t *testing.T) {
    setupInvocationServiceTest(t)
    if err := EnsureSkillSeeds(); err != nil { t.Fatal(err) }
    if err := EnsureAgentSeeds(); err != nil { t.Fatal(err) }
    items, err := ListVisibleAgents("user-1", "project-1")
    if err != nil || len(items) == 0 { t.Fatalf("items=%#v err=%v", items, err) }
    for _, item := range items {
        if item.Agent.OwnerType != model.AgentOwnerSystem || item.RecommendedPackage == nil { continue }
        for _, ref := range item.RecommendedPackage.DefaultSkillRefs {
            _, version, ok, err := repository.GetSkillWithVersion(ref.SkillVersionID)
            if err != nil || !ok || version.Status != model.SkillVersionPublished { t.Fatalf("ref=%#v version=%#v err=%v", ref, version, err) }
        }
    }
}
```

- [ ] **Step 2: Run and verify RED**

Run: `go test ./service -run 'Test(PublishAgent|PublishedAgentPackage)' -count=1`

Expected: build failure for missing Agent contracts.

- [ ] **Step 3: Define JSON-safe contracts**

```go
type AgentSkillRef struct {
    StepKey string `json:"stepKey"`
    Label string `json:"label"`
    Capability string `json:"capability"`
    SkillID string `json:"skillId"`
    SkillVersionID string `json:"skillVersionId"`
    SkillVersionConstraint string `json:"skillVersionConstraint"`
    Required bool `json:"required"`
    InputBindings []AgentStepInputBinding `json:"inputBindings"`
    Parameters json.RawMessage `json:"parameters"`
    ExpectedOutputType string `json:"expectedOutputType"`
}

type AgentSkillAccessPolicy struct {
    AllowedSkillIDs []string `json:"allowedSkillIds"`
    AllowedCapabilities []string `json:"allowedCapabilities"`
    AllowedOwnerTypes []model.SkillOwnerType `json:"allowedOwnerTypes"`
}

type AgentPackage struct {
    RolePrompt string `json:"rolePrompt"`
    PlannerMode string `json:"plannerMode"`
    DefaultSkillRefs []AgentSkillRef `json:"defaultSkillRefs"`
    SkillAccessPolicy AgentSkillAccessPolicy `json:"skillAccessPolicy"`
    ModelPolicy map[string]any `json:"modelPolicy"`
    ToolPolicy map[string]any `json:"toolPolicy"`
    ExecutionPolicy map[string]any `json:"executionPolicy"`
    ContentHash string `json:"contentHash"`
}
```

Also define `AgentCreateInput`, `AgentDraftInput`, `AgentRegistryItem`, `AgentVersionDetail` and `AgentValidationResult` with concrete JSON fields matching the spec.

- [ ] **Step 4: Implement normalization and service lifecycle**

Implement:

```go
func NormalizeAgentPackage(value AgentPackage) (AgentPackage, error)
func DecodeAgentPackage(version model.AgentVersion) (AgentPackage, error)
func CreateProjectAgent(userID string, input AgentCreateInput) (AgentVersionDetail, error)
func ListVisibleAgents(userID, projectID string) ([]AgentRegistryItem, error)
func GetVisibleAgent(userID, projectID, agentID string) (AgentRegistryItem, error)
func CreateAgentDraft(userID, agentID string, input AgentDraftInput) (model.AgentVersion, error)
func UpdateAgentDraft(userID, versionID string, input AgentDraftInput) (model.AgentVersion, error)
func ValidateAgentVersion(userID, versionID string) (AgentValidationResult, error)
func PublishAgentVersion(userID, versionID string) (AgentVersionDetail, error)
func RecommendAgentVersion(userID, agentID, versionID string) (AgentVersionDetail, error)
```

Normalization must trim strings, reject duplicate `stepKey`, accept only `configured_chain`, canonicalize JSON maps, and compute SHA-256 from execution fields only. Publishing resolves each ref through `ResolveExactSkillVersion` or the existing resolver, requires `published`, and enforces owner/capability/Skill allowlists.

- [ ] **Step 5: Seed initial system Agents without copying Skill bodies**

Create `EnsureAgentSeeds()` with stable IDs and one published `1.0.0` version for the existing production roles. Each default Step points to the corresponding published system Skill Version created by `EnsureSkillSeeds`; the Agent role prompt contains only planning responsibility and boundaries. `main.go` calls it immediately after `EnsureSkillSeeds()`:

```go
if err := service.EnsureSkillSeeds(); err != nil { log.Fatalf("seed skills: %v", err) }
if err := service.EnsureAgentSeeds(); err != nil { log.Fatalf("seed agents: %v", err) }
```

The seed is add-only and idempotent: it creates missing stable IDs, never overwrites a project Agent, and never mutates an existing published system version.

- [ ] **Step 6: Verify service tests**

Run: `gofmt -w service/agent_registry*.go service/agent_seed.go service/agent_seed_test.go main.go && go test ./service -run 'Agent(Registry|Version|Package|Publish|Seed)' -count=1`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add service/agent_registry_contracts.go service/agent_registry.go service/agent_registry_test.go service/agent_seed.go service/agent_seed_test.go main.go
git commit -m "feat: publish immutable agent versions"
```

## Task 4: Expose Registry HTTP APIs and shared frontend contract

**Files:**
- Create: `handler/agent_registry.go`
- Modify: `router/router.go`
- Create: `handler/agent_registry_test.go`
- Create: `web/src/services/api/agent-registry.ts`
- Test: `web/src/services/api/agent-registry.test.mts`

- [ ] **Step 1: Write failing authenticated HTTP tests**

Add a real-router test that registers two users, creates a project Agent as user one, then proves user two cannot read, update or publish it. Assert all routes use `{code,data,msg}` and published DTOs omit raw JSON persistence columns.

```go
func TestAgentRegistryHTTPIsolatesProjectOwners(t *testing.T) {
    router := setupInvocationHTTPTest(t)
    owner := registerAndLoginInvocationUser(t, router, "agent-owner")
    stranger := registerAndLoginInvocationUser(t, router, "agent-stranger")
    created := postAgentJSON(t, router, owner.Token, "/api/v1/agents", createAgentBody())
    getAgentExpectCode(t, router, stranger.Token, "/api/v1/agents/"+created.Agent.ID, http.StatusOK, 1)
}
```

- [ ] **Step 2: Run and verify RED**

Run: `go test ./handler -run TestAgentRegistryHTTP -count=1`

Expected: route returns 404 or test does not compile.

- [ ] **Step 3: Implement thin handlers and routes**

Handlers only decode input/query/path IDs, call service, and return `OK`/`FailError`. Register:

```go
v1.GET("/agents", gin.WrapF(handler.Agents))
v1.POST("/agents", gin.WrapF(handler.CreateAgent))
v1.GET("/agents/:id", wrapID(handler.AgentDetail))
v1.POST("/agents/:id/versions", wrapID(handler.CreateAgentVersion))
v1.PATCH("/agent-versions/:id", wrapID(handler.UpdateAgentVersion))
v1.POST("/agent-versions/:id/validate", wrapID(handler.ValidateAgentVersion))
v1.POST("/agent-versions/:id/publish", wrapID(handler.PublishAgentVersion))
v1.PUT("/agents/:id/recommended-version", wrapID(handler.RecommendAgentVersion))
```

Use the router's existing inline path-param wrapping style rather than introducing a new generic helper if none exists.

- [ ] **Step 4: Add TypeScript DTO and API functions**

Export concrete types and functions:

```ts
export function fetchAgents(projectId: string) { return apiGet<AgentRegistryItem[]>("/api/v1/agents", { projectId }); }
export function fetchAgent(id: string, projectId: string) { return apiGet<AgentRegistryItem>(`/api/v1/agents/${encodeURIComponent(id)}`, { projectId }); }
export function createAgent(input: AgentCreateInput) { return apiPost<AgentVersionDetail>("/api/v1/agents", input); }
export function updateAgentVersion(id: string, input: AgentDraftInput) { return apiPatch<AgentVersion>(`/api/v1/agent-versions/${encodeURIComponent(id)}`, input); }
export function validateAgentVersion(id: string) { return apiPost<AgentValidationResult>(`/api/v1/agent-versions/${encodeURIComponent(id)}/validate`, {}); }
export function publishAgentVersion(id: string) { return apiPost<AgentVersionDetail>(`/api/v1/agent-versions/${encodeURIComponent(id)}/publish`, {}); }
```

- [ ] **Step 5: Verify backend and frontend contracts**

Run: `gofmt -w handler/agent_registry*.go router/router.go && go test ./handler -run TestAgentRegistryHTTP -count=1 && cd web && node --experimental-strip-types --test src/services/api/agent-registry.test.mts`

Expected: both commands PASS.

- [ ] **Step 6: Commit**

```bash
git add handler/agent_registry.go handler/agent_registry_test.go router/router.go web/src/services/api/agent-registry.ts web/src/services/api/agent-registry.test.mts
git commit -m "feat: expose agent registry APIs"
```

## Task 5: Persist revisioned Agent Plans idempotently

**Files:**
- Create: `repository/agent_plan.go`
- Test: `repository/agent_plan_test.go`
- Create: `service/agent_plan_contracts.go`

- [ ] **Step 1: Write failing aggregate tests**

Cover: same idempotency key + same request hash returns the existing plan; different request hash conflicts; appending Revision 2 preserves Revision 1; two concurrent `continue` transitions cannot both bind a Step Invocation.

```go
func TestCreateAgentPlanAggregateIdempotently(t *testing.T) {
    setupRepositoryTestDB(t)
    plan, revision, steps := agentPlanFixture("same-key", "same-hash")
    first, created, err := CreateAgentPlanAggregateIdempotently(plan, revision, steps)
    if err != nil || !created { t.Fatalf("created=%v err=%v", created, err) }
    plan.ID, revision.ID, revision.AgentPlanID = "duplicate", "duplicate-revision", "duplicate"
    second, created, err := CreateAgentPlanAggregateIdempotently(plan, revision, steps)
    if err != nil || created || second.ID != first.ID { t.Fatalf("second=%#v created=%v err=%v", second, created, err) }
}
```

- [ ] **Step 2: Run and verify RED**

Run: `go test ./repository -run TestAgentPlan -count=1`

Expected: missing repository functions.

- [ ] **Step 3: Define plan DTOs**

Define `AgentPlanCreateInput`, `AgentPlanRevisionInput`, `AgentPlanPreflightResult`, `AgentPlanConfirmInput`, `AgentPlanDetail`, `AgentPlanStepDetail` and `AgentPlanContinueResult`. Use `ArtifactRefInput` for real source artifacts and this symbolic binding:

```go
type AgentStepInputBinding struct {
    BindingName string `json:"bindingName"`
    ArtifactID string `json:"artifactId,omitempty"`
    ContentHash string `json:"contentHash,omitempty"`
    FromStepKey string `json:"fromStepKey,omitempty"`
    FromOutputBinding string `json:"fromOutputBinding,omitempty"`
}
```

- [ ] **Step 4: Implement repository aggregate operations**

```go
var ErrAgentPlanIdempotencyConflict = errors.New("Agent Plan 幂等键冲突")
var ErrAgentPlanTransitionConflict = errors.New("Agent Plan 状态已变化")

func CreateAgentPlanAggregateIdempotently(plan model.AgentPlan, revision model.AgentPlanRevision, steps []model.AgentPlanStep) (model.AgentPlan, bool, error)
func GetUserAgentPlan(userID, id string) (model.AgentPlan, bool, error)
func GetAgentPlanRevision(planID string, revision int) (model.AgentPlanRevision, []model.AgentPlanStep, bool, error)
func AppendAgentPlanRevision(plan model.AgentPlan, revision model.AgentPlanRevision, steps []model.AgentPlanStep) error
func ConfirmAgentPlanTx(plan model.AgentPlan, confirmation model.AgentPlanConfirmation) error
func BindAgentPlanStepInvocation(planID string, revision, ordinal int, invocationID, updatedAt string) error
func UpdateAgentPlanStepResult(plan model.AgentPlan, step model.AgentPlanStep) error
```

Every mutating query includes the expected previous status, revision and empty/current Invocation ID.

- [ ] **Step 5: Verify GREEN**

Run: `gofmt -w repository/agent_plan.go repository/agent_plan_test.go service/agent_plan_contracts.go && go test ./repository -run TestAgentPlan -count=1`

Expected: PASS, including the SQLite concurrency case.

- [ ] **Step 6: Commit**

```bash
git add repository/agent_plan.go repository/agent_plan_test.go service/agent_plan_contracts.go
git commit -m "feat: persist revisioned agent plans"
```

## Task 6: Implement deterministic Plan creation and symbolic preflight

**Files:**
- Create: `service/agent_plan.go`
- Create: `service/agent_plan_preflight.go`
- Test: `service/agent_plan_preflight_test.go`

- [ ] **Step 1: Write failing end-to-end preflight tests**

Seed `source_text -> production_script` and `production_script -> content_profile` Skills, publish an Agent that references both, create a source Artifact, and assert preflight freezes both Skill versions and accepts the symbolic handoff. Add rejection cases for incompatible output type, unpublished Skill, changed source hash and access-policy violation.

```go
func TestAgentPlanPreflightFreezesSequentialSkillChain(t *testing.T) {
    fixture := seedTwoStepAgentPlan(t)
    detail, err := CreateAgentPlan("user-1", fixture.CreateInput)
    if err != nil { t.Fatal(err) }
    result, err := PreflightAgentPlan("user-1", detail.Plan.ID)
    if err != nil { t.Fatal(err) }
    if result.Plan.Status != model.AgentPlanAwaitingConfirmation || len(result.Steps) != 2 { t.Fatalf("result=%#v", result) }
    if result.Steps[1].InputBindings[0].FromStepKey != result.Steps[0].StepKey { t.Fatalf("steps=%#v", result.Steps) }
}
```

- [ ] **Step 2: Run and verify RED**

Run: `go test ./service -run TestAgentPlanPreflight -count=1`

Expected: build failure for missing Plan service.

- [ ] **Step 3: Implement plan creation**

```go
func CreateAgentPlan(userID string, input AgentPlanCreateInput) (AgentPlanDetail, error)
func CreateAgentPlanRevision(userID, planID string, input AgentPlanRevisionInput) (AgentPlanDetail, error)
func GetAgentPlanDetail(userID, planID string) (AgentPlanDetail, error)
```

Creation resolves a visible published Agent Version, uses the default chain unless overrides are supplied, validates unique ordered `stepKey`, hashes the normalized request, and stores Draft Revision 1 idempotently.

- [ ] **Step 4: Implement symbolic preflight**

```go
func PreflightAgentPlan(userID, planID string) (AgentPlanPreflightResult, error)
func resolveAgentPlanSkillRef(userID, projectID string, policy AgentSkillAccessPolicy, ref AgentSkillRef) (ResolvedSkill, error)
func validateAgentStepHandoff(previous SkillPackage, next SkillPackage, binding AgentStepInputBinding) error
func agentPlanFingerprint(revision model.AgentPlanRevision, steps []model.AgentPlanStep) string
```

Use existing semver/schema compatibility helpers. Step 1 validates real Artifact ID/hash and project ownership. Later steps match `fromStepKey/fromOutputBinding` to the upstream output contract and require that artifact type/schema satisfies the downstream input contract. Store the exact Skill version/hash, estimated credits and requirement codes, then transition the plan to `awaiting_confirmation`.

- [ ] **Step 5: Verify GREEN**

Run: `gofmt -w service/agent_plan*.go && go test ./service -run 'TestAgentPlan(Preflight|Revision|Fingerprint)' -count=1`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add service/agent_plan.go service/agent_plan_preflight.go service/agent_plan_preflight_test.go
git commit -m "feat: preflight sequential agent plans"
```

## Task 7: Execute confirmed Plan steps through Invocation Runtime

**Files:**
- Create: `service/agent_plan_execution.go`
- Test: `service/agent_plan_execution_test.go`
- Modify: `model/invocation.go`
- Modify: `service/invocation_contracts.go`
- Modify: `service/invocation_lifecycle.go`

- [ ] **Step 1: Write failing confirmation-delegation and two-step tests**

Test these invariants:

1. Wrong fingerprint or stale revision cannot confirm.
2. Plan confirmation stores the total cost ceiling and requirement codes.
3. First `continue` creates exactly one Invocation with `source=agent_plan`.
4. Repeated/concurrent `continue` returns the same Invocation ID.
5. Downstream is not created until the first Invocation is approved.
6. After approval, its output Artifact ID/hash becomes the second Invocation input.
7. Changing a recommended Skill version after confirmation does not alter either step.

```go
func TestAgentPlanExecutesTwoStepsWithArtifactHandoff(t *testing.T) {
    fixture := seedTwoStepAgentPlan(t)
    plan := mustPreflightAndConfirmAgentPlan(t, fixture)
    first, err := ContinueAgentPlan("user-1", plan.Plan.ID)
    if err != nil { t.Fatal(err) }
    completeInvocationWithApprovedArtifact(t, first.Invocation.ID)
    second, err := ContinueAgentPlan("user-1", plan.Plan.ID)
    if err != nil { t.Fatal(err) }
    detail, _ := GetInvocationDetail("user-1", second.Invocation.ID)
    if detail.InputArtifacts[0].Artifact.ParentArtifactIDs[0] == "" { t.Fatalf("detail=%#v", detail) }
}
```

- [ ] **Step 2: Run and verify RED**

Run: `go test ./service -run 'TestAgentPlan(Confirm|Execute|Continue)' -count=1`

Expected: missing execution functions.

- [ ] **Step 3: Add bounded confirmation delegation**

Add nullable Invocation fields `AgentPlanID`, `AgentPlanRevision`, `AgentPlanStepKey` and `ConfirmationSource`. Add an internal confirmation input that accepts a persisted Plan confirmation only when Agent/Skill/Artifact hashes, parameters, requirement codes and estimated cost match the frozen Step. External callers cannot set `ConfirmationSource`.

- [ ] **Step 4: Implement Plan execution functions**

```go
func ConfirmAgentPlan(userID, planID string, input AgentPlanConfirmInput) (AgentPlanDetail, error)
func ContinueAgentPlan(userID, planID string) (AgentPlanContinueResult, error)
func CancelAgentPlan(userID, planID string) (AgentPlanDetail, error)
func refreshAgentPlanStep(userID string, plan model.AgentPlan, step model.AgentPlanStep) (model.AgentPlan, model.AgentPlanStep, error)
func materializeAgentPlanStepInvocation(userID string, plan model.AgentPlan, revision model.AgentPlanRevision, step model.AgentPlanStep) (InvocationSnapshot, error)
```

`ContinueAgentPlan` queries the current Step Invocation. `queued/running` returns it, `needs_review` pauses the Plan, `approved/applied` records output refs and advances, and `failed/cancelled` propagates status without creating downstream tasks. Creation uses the existing `PrepareInvocation` and a private `ConfirmInvocationFromAgentPlan` path; no model, credit or Artifact code is duplicated.

- [ ] **Step 5: Verify service tests including idempotency**

Run: `gofmt -w model/invocation.go service/invocation_contracts.go service/invocation_lifecycle.go service/agent_plan_execution.go service/agent_plan_execution_test.go && go test ./service -run 'TestAgentPlan(Confirm|Execute|Continue|Cancel)' -count=1`

Expected: PASS with exactly two Invocation rows and no duplicate credit reservation.

- [ ] **Step 6: Commit**

```bash
git add model/invocation.go service/invocation_contracts.go service/invocation_lifecycle.go service/agent_plan_execution.go service/agent_plan_execution_test.go
git commit -m "feat: execute agent plans through invocations"
```

## Task 8: Expose Plan APIs and frontend client

**Files:**
- Create: `handler/agent_plan.go`
- Create: `handler/agent_plan_test.go`
- Modify: `router/router.go`
- Create: `web/src/services/api/agent-plans.ts`
- Test: `web/src/services/api/agent-plans.test.mts`

- [ ] **Step 1: Write failing real-router E2E**

Create source Artifact through `/api/v1/artifacts`, create/preflight/confirm a two-step Plan, call `continue`, and assert the first Invocation is owned by the authenticated user. Add stranger access, bad fingerprint, stale Revision, repeated continue and cancel cases.

- [ ] **Step 2: Run and verify RED**

Run: `go test ./handler -run TestAgentPlanHTTP -count=1`

Expected: 404 for `/api/v1/agent-plans`.

- [ ] **Step 3: Implement handlers and routes**

Register:

```go
v1.POST("/agent-plans", gin.WrapF(handler.CreateAgentPlan))
v1.GET("/agent-plans/:id", ...)
v1.POST("/agent-plans/:id/revisions", ...)
v1.POST("/agent-plans/:id/preflight", ...)
v1.POST("/agent-plans/:id/confirm", ...)
v1.POST("/agent-plans/:id/continue", ...)
v1.POST("/agent-plans/:id/cancel", ...)
```

Handlers remain transport-only and never call repository directly.

- [ ] **Step 4: Implement TypeScript Plan client**

```ts
export function createAgentPlan(input: AgentPlanCreateInput) { return apiPost<AgentPlanDetail>("/api/v1/agent-plans", input); }
export function preflightAgentPlan(id: string) { return apiPost<AgentPlanPreflightResult>(`/api/v1/agent-plans/${encodeURIComponent(id)}/preflight`, {}); }
export function confirmAgentPlan(id: string, input: AgentPlanConfirmInput) { return apiPost<AgentPlanDetail>(`/api/v1/agent-plans/${encodeURIComponent(id)}/confirm`, input); }
export function continueAgentPlan(id: string) { return apiPost<AgentPlanContinueResult>(`/api/v1/agent-plans/${encodeURIComponent(id)}/continue`, {}); }
export function cancelAgentPlan(id: string) { return apiPost<AgentPlanDetail>(`/api/v1/agent-plans/${encodeURIComponent(id)}/cancel`, {}); }
```

- [ ] **Step 5: Verify HTTP and client tests**

Run: `gofmt -w handler/agent_plan*.go router/router.go && go test ./handler -run TestAgentPlanHTTP -count=1 && cd web && node --experimental-strip-types --test src/services/api/agent-plans.test.mts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add handler/agent_plan.go handler/agent_plan_test.go router/router.go web/src/services/api/agent-plans.ts web/src/services/api/agent-plans.test.mts
git commit -m "feat: expose agent plan APIs"
```

## Task 9: Replace the project Agent Center with the visible registry/run slice

**Files:**
- Replace: `web/src/app/(user)/projects/[id]/agents/page.tsx`
- Create: `web/src/app/(user)/projects/[id]/agents/components/agent-registry-list.tsx`
- Create: `web/src/app/(user)/projects/[id]/agents/components/agent-version-editor.tsx`
- Create: `web/src/app/(user)/projects/[id]/agents/components/agent-run-console.tsx`
- Create: `web/src/app/(user)/projects/[id]/agents/agent-center-utils.ts`
- Test: `web/src/app/(user)/projects/[id]/agents/agent-center-utils.test.mts`

- [ ] **Step 1: Write failing pure UI-state tests**

```ts
test("builds a source_text artifact and ordered agent plan request", () => {
  const request = buildAgentPlanRequest({ projectId:"p1", agentVersionId:"av1", sourceArtifact:{id:"a1", contentHash:"h1"}, goal:"优化并分类", skillRefs:[first, second] });
  assert.deepEqual(request.skillOverrides.map((item) => item.stepKey), ["optimize", "classify"]);
  assert.equal(request.sourceArtifactRefs[0].bindingName, "source");
});

test("confirmation is disabled after a local plan edit", () => {
  assert.equal(canConfirmAgentPlan({preflightFingerprint:"f1", currentFingerprint:"f2", status:"awaiting_confirmation"}), false);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/projects/[id]/agents/agent-center-utils.test.mts'`

Expected: module or exported function not found.

- [ ] **Step 3: Implement pure request/status helpers**

Implement `buildSourceArtifactInput`, `buildAgentPlanRequest`, `reorderAgentSkillRefs`, `canPreflightAgentPlan`, `canConfirmAgentPlan`, `canContinueAgentPlan` and Chinese status labels. They must not import React, stores or browser globals.

- [ ] **Step 4: Implement the registry list and version editor**

The list shows system/project ownership, published/draft/recommended state and content hash. A system Agent has “复制到本项目”; it calls `createAgent` with the visible package, a project owner, and a new draft version instead of modifying the system record. The editor includes role, version, ordered Skill refs and policy. Skill refs are selected from `/api/v1/skill-options`; each option shows capability and `input → output`. Published versions are read-only. There is no `skillSummary`, Skill body, Schema or quality-gate editor.

- [ ] **Step 5: Implement the run console**

The run console provides:

1. textarea/file text import;
2. explicit `source_text` Artifact creation;
3. ordered Skill chain preview and legal overrides;
4. preflight card with frozen versions, bindings, estimated credits and confirmation codes;
5. confirm, continue, cancel and refresh actions;
6. per-step Invocation status, Artifact links and review controls through the existing Invocation client.

Use TanStack Query for server state and Ant Design `App.useApp()` for messages. Use existing studio theme variables; do not add page-private global CSS.

- [ ] **Step 6: Assemble the page without legacy preset writes**

`page.tsx` loads the project from the existing project store for context only, then renders the new registry workspace. Remove `AgentWorkspacePanel`, `AgentConfigKind`, fixed-kind parsing and `settingsOnly` from this route. Do not delete legacy components yet because old workflow pages still consume them.

- [ ] **Step 7: Verify focused frontend tests and typecheck**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/projects/[id]/agents/agent-center-utils.test.mts' src/services/api/agent-registry.test.mts src/services/api/agent-plans.test.mts && npm run typecheck`

Expected: all focused tests PASS and TypeScript exits 0.

- [ ] **Step 8: Commit**

```bash
git add 'web/src/app/(user)/projects/[id]/agents' web/src/services/api/agent-registry.ts web/src/services/api/agent-plans.ts
git commit -m "feat: add composable agent center"
```

## Task 10: Complete E2E, effect checks and documentation

**Files:**
- Create: `service/agent_plan_e2e_test.go`
- Create: `handler/agent_plan_process_smoke_test.go`
- Modify: `docs/backend-database.md`
- Modify: `docs/todo.md`
- Modify: `docs/pending-test.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add the backend evidence matrix**

The service E2E must execute two real published test Skills through the fake Invocation executor and prove:

- source Artifact remains immutable;
- exact Agent and Skill version/hash snapshots are frozen;
- first approved output is the second real input;
- both quality-gate records exist;
- total charges equal the two successful attempts exactly once;
- stale confirm, duplicate continue, cancellation, retry and recommendation switch behave as specified.

- [ ] **Step 2: Add real-process zero-cost smoke**

Start the backend with a temporary SQLite database and Worker disabled, register/login over HTTP, create source Artifact and Agent Plan, preflight it, then intentionally submit a bad confirmation fingerprint. Assert no AgentRun, no model call and no credit log is created.

- [ ] **Step 3: Update required docs**

Document the six new tables and indexes in `docs/backend-database.md`. Move “Agent Registry + Agent Runtime” from todo into `docs/pending-test.md` only when the implementation and automated tests are complete; leave Workflow Composer, canvas/image integration and final real-model effect acceptance in `docs/todo.md`. Add one version-level `Unreleased` summary to `CHANGELOG.md`.

- [ ] **Step 4: Run focused verification**

Run:

```bash
go test ./repository -run 'Agent(Registry|Plan)' -count=1
go test ./service -run 'Agent(Registry|Version|Plan)' -count=1
go test ./handler -run 'Agent(Registry|Plan)' -count=1
cd web && node --experimental-strip-types --test 'src/app/(user)/projects/[id]/agents/agent-center-utils.test.mts' src/services/api/agent-registry.test.mts src/services/api/agent-plans.test.mts
```

Expected: all commands PASS.

- [ ] **Step 5: Run the full requested acceptance suite once**

Run:

```bash
go test ./... -count=1
cd web && npm test
cd web && npm run typecheck
cd web && npm run build
```

Expected: all Go packages PASS; frontend test count has zero failures; typecheck exits 0; Next production build completes all routes.

- [ ] **Step 6: Run browser E2E on the visible slice**

Using the local app and a clean test user/project:

1. create a project Agent draft;
2. choose two published Skills;
3. validate, publish and select the Agent Version;
4. paste source text and create the Artifact;
5. preflight and inspect frozen versions/cost/confirmation;
6. confirm and run Step 1;
7. approve its Artifact and continue;
8. approve Step 2 and verify Plan completed;
9. refresh the page and verify the same Plan/Artifact trace reloads.

Capture browser console errors and fail the acceptance if any application error occurs.

- [ ] **Step 7: Review actual diff and commit**

Run: `git diff --check && git status --short && git diff --stat`

Then:

```bash
git add service/agent_plan_e2e_test.go handler/agent_plan_process_smoke_test.go docs/backend-database.md docs/todo.md docs/pending-test.md CHANGELOG.md
git commit -m "test: validate composable agent runtime"
```

## Completion boundary

Completing this plan proves only the approved Agent Registry + Runtime vertical slice. The thread goal remains active until the formal production workflow, Workflow Composer, canvas, image page and API consumers all use the same runtime and the fixed screenplay completes the final effect acceptance matrix.
