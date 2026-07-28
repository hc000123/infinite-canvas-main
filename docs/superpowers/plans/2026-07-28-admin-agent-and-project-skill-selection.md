# Admin Agent and Project Skill Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let administrators version and recommend system Agents, while project makers keep the system script Agent fixed and select an authorized published script Skill version per episode.

**Architecture:** Add admin-only wrappers around the existing immutable Agent Registry lifecycle instead of weakening project ownership checks. Reuse the existing Agent editor in an explicit admin mode, and isolate project Skill compatibility, local persistence, and `skillOverrides` construction in small tested modules before wiring them into the project page.

**Tech Stack:** Go, Gin, GORM, Next.js App Router, React, TypeScript, Ant Design, TanStack Query, localforage, Node test runner.

---

## File map

- Create `service/admin_agent.go`: admin-only system Agent list/version lifecycle.
- Create `service/admin_agent_test.go`: system ownership, immutable version lifecycle, and seed recommendation regression tests.
- Create `handler/admin_agent.go`: HTTP adapters for admin Agent endpoints.
- Create `handler/admin_agent_test.go`: authenticated admin route lifecycle and ordinary-user rejection.
- Modify `router/router.go`: register `/api/v1/admin/agents` routes under `middleware.AdminAuth`.
- Create `web/src/services/api/admin-agents.ts`: typed admin Agent requests.
- Modify `web/src/services/api/admin-skills.ts`: expose `executorKind` and `requiredTools` in `SkillManifest`.
- Create `web/src/app/(admin)/admin/agents/page.tsx`: system Agent list and version editor.
- Modify `web/src/app/(admin)/admin/layout.tsx`: add the Agent center navigation item and active title.
- Modify `web/src/app/(user)/projects/[id]/agents/components/agent-version-editor.tsx`: support explicit system-admin lifecycle calls without changing project mode.
- Create `web/src/app/(admin)/admin/agents/admin-agent-view.test.mts`: admin navigation/page/editor wiring coverage.
- Create `web/src/app/(user)/projects/script-skill-selection.ts`: compatibility filtering, fallback, and override construction.
- Create `web/src/app/(user)/projects/script-skill-selection.test.mts`: selection rules and exact override tests.
- Create `web/src/app/(user)/projects/[id]/script-skill-selection-session.ts`: per-episode persistence helpers.
- Create `web/src/app/(user)/projects/[id]/script-skill-selection-session-storage.ts`: user-scoped localforage instance.
- Create `web/src/app/(user)/projects/[id]/script-skill-selection-session.test.mts`: project/episode key isolation.
- Create `web/src/app/(user)/projects/[id]/use-script-skill-selection.ts`: Registry queries and local selection state.
- Modify `web/src/app/(user)/projects/script-agent-runtime.ts`: submit optional exact Skill overrides.
- Modify `web/src/app/(user)/projects/script-agent-runtime.test.mts`: prove override freezing in the Agent Plan request.
- Modify `web/src/app/(user)/projects/[id]/components/project-episode-board.tsx`: render the compact Skill version selector.
- Modify `web/src/app/(user)/projects/[id]/page.tsx`: load selection state and pass the exact override into script runs.
- Modify `web/src/app/(user)/projects/[id]/agents/page.tsx`: add the explicit return button.
- Modify `web/src/app/(user)/projects/project-detail-navigation.test.mts`: cover the fixed Agent plus selectable Skill UI and return navigation.
- Modify `docs/backend-database.md`, `docs/todo.md`, and `docs/pending-test.md`: describe behavior without changing the schema.

### Task 1: Admin-only system Agent lifecycle

**Files:**
- Create: `service/admin_agent.go`
- Create: `service/admin_agent_test.go`
- Modify: `service/agent_registry.go`
- Modify: `service/agent_seed_test.go`

- [ ] **Step 1: Write failing service tests**

Add tests that create the seed Agents, fetch only system-owned definitions, create a `1.0.1` draft for `agent-system-script`, update and validate it, publish it, recommend it, and confirm the recommended ID survives a second `EnsureAgentSeeds()` call. The central assertions are:

```go
items, err := ListSystemAgentAdminItems()
if err != nil || len(items) != 7 { t.Fatalf("items=%d err=%v", len(items), err) }

draft, err := CreateSystemAgentDraft("admin-1", "agent-system-script", AgentDraftInput{
    Version: "1.0.1",
    Package: *scriptItem.RecommendedPackage,
})
if err != nil || draft.Status != model.AgentVersionDraft { t.Fatalf("draft=%#v err=%v", draft, err) }

published, err := PublishSystemAgentVersion("admin-1", draft.ID)
if err != nil || published.Version.Status != model.AgentVersionPublished { t.Fatalf("published=%#v err=%v", published, err) }

recommended, err := RecommendSystemAgentVersion("admin-1", "agent-system-script", draft.ID)
if err != nil { t.Fatal(err) }
if err := EnsureAgentSeeds(); err != nil { t.Fatal(err) }
agent, _, _ := repository.GetAgentDefinition("agent-system-script")
if agent.RecommendedVersionID != recommended.Version.ID { t.Fatalf("recommended=%q", agent.RecommendedVersionID) }
```

Also assert the existing `CreateAgentDraft("user-1", "agent-system-script", ...)` path still returns “不可编辑”.

- [ ] **Step 2: Run the service tests and verify RED**

```bash
go test ./service -run 'Test(SystemAgentAdminLifecycle|EnsureAgentSeedsPreservesAdminRecommendation)' -count=1
```

Expected: FAIL because the system-admin lifecycle functions do not exist.

- [ ] **Step 3: Implement the minimal service boundary**

Add `editableSystemAgent` and `editableSystemAgentVersion` helpers that require `OwnerType == model.AgentOwnerSystem`. Refactor the existing create/update/validate/publish/recommend bodies into owner-resolved internal helpers so project and admin entry points share normalization and immutability rules:

```go
func ListSystemAgentAdminItems() ([]AgentRegistryItem, error)
func GetSystemAgentVersion(versionID string) (AgentVersionDetail, error)
func CreateSystemAgentDraft(adminID, agentID string, input AgentDraftInput) (model.AgentVersion, error)
func UpdateSystemAgentDraft(adminID, versionID string, input AgentDraftInput) (model.AgentVersion, error)
func ValidateSystemAgentVersion(adminID, versionID string) (AgentValidationResult, error)
func PublishSystemAgentVersion(adminID, versionID string) (AgentVersionDetail, error)
func RecommendSystemAgentVersion(adminID, agentID, versionID string) (AgentVersionDetail, error)
```

Keep `editableAgent` unchanged for project callers. Admin-created versions use `newID("agentversion")`, so the existing seed condition does not replace an administrator-selected recommendation.

- [ ] **Step 4: Run the service tests and verify GREEN**

Run the Step 2 command again. Expected: PASS.

- [ ] **Step 5: Commit the service lifecycle**

```bash
git add service/admin_agent.go service/admin_agent_test.go service/agent_registry.go service/agent_seed_test.go
git commit -m "feat: manage system agent versions as admin"
```

### Task 2: Admin Agent HTTP API

**Files:**
- Create: `handler/admin_agent.go`
- Create: `handler/admin_agent_test.go`
- Modify: `router/router.go`

- [ ] **Step 1: Write a failing admin HTTP lifecycle test**

Register these expected routes under the existing `/api/v1/admin` group:

```text
GET   /agents
POST  /agents/:id/versions
GET   /agent-versions/:id
PATCH /agent-versions/:id
POST  /agent-versions/:id/validate
POST  /agent-versions/:id/publish
PUT   /agents/:id/recommended-version
```

The test logs in an admin, creates a draft from the current system package, publishes and recommends it, then verifies an ordinary user receives an authorization failure for the same endpoint.

- [ ] **Step 2: Run the handler test and verify RED**

```bash
go test ./handler -run TestAdminSystemAgentHTTPLifecycle -count=1
```

Expected: FAIL with a missing route or 404 response.

- [ ] **Step 3: Implement handlers and routes**

Use the project response envelope and body limits already used by `handler/admin_skill.go`. Mutation handlers read `admin.ID` from the authenticated context and call only the system-admin service functions. Register all endpoints on the existing `skillAdmin := api.Group("/v1/admin", middleware.AdminAuth)` group; rename the local variable to `registryAdmin` because it now serves both registries.

- [ ] **Step 4: Run handler and router tests**

```bash
go test ./handler ./router -run 'Test(AdminSystemAgentHTTPLifecycle|Router)' -count=1
```

Expected: PASS.

- [ ] **Step 5: Commit the admin API**

```bash
git add handler/admin_agent.go handler/admin_agent_test.go router/router.go
git commit -m "feat: expose admin system agent registry api"
```

### Task 3: Admin Agent center UI

**Files:**
- Create: `web/src/services/api/admin-agents.ts`
- Modify: `web/src/services/api/admin-skills.ts`
- Create: `web/src/app/(admin)/admin/agents/page.tsx`
- Create: `web/src/app/(admin)/admin/agents/admin-agent-view.test.mts`
- Modify: `web/src/app/(admin)/admin/layout.tsx`
- Modify: `web/src/app/(user)/projects/[id]/agents/components/agent-version-editor.tsx`

- [ ] **Step 1: Write failing frontend wiring tests**

Test that the admin layout contains `/admin/agents` and “Agent 中心”; the page calls `fetchAdminAgents`; and the editor receives `mode="system-admin"`. Add a pure assertion that system admin mode enables creating a draft and recommending a published system version while project mode does not:

```ts
assert.equal(canManageAgentVersion({ mode: "system-admin", ownerType: "system" }), true);
assert.equal(canManageAgentVersion({ mode: "project", ownerType: "system" }), false);
```

- [ ] **Step 2: Run the frontend tests and verify RED**

```bash
cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/agents/admin-agent-view.test.mts'
```

Expected: FAIL because the admin Agent page and helper do not exist.

- [ ] **Step 3: Add typed admin Agent requests**

Create request functions parallel to `admin-skills.ts`:

```ts
export function fetchAdminAgents(token: string)
export function fetchAdminAgentVersion(token: string, id: string)
export function createAdminAgentVersion(token: string, agentId: string, input: AgentDraftInput)
export function updateAdminAgentVersion(token: string, id: string, input: AgentDraftInput)
export function validateAdminAgentVersion(token: string, id: string)
export function publishAdminAgentVersion(token: string, id: string)
export function recommendAdminAgentVersion(token: string, agentId: string, agentVersionId: string)
```

Extend `SkillManifest` with optional `executorKind?: string` and `requiredTools?: string[]` so client-side access checks match the server contract.

- [ ] **Step 4: Implement the admin page and explicit editor mode**

Add `mode?: "project" | "system-admin"` and `adminToken?: string` to `AgentVersionEditor`. Select the admin request functions only in admin mode. Replace the current `!isSystem` UI guards with `canManageAgentVersion({ mode, ownerType })`; published versions stay read-only in both modes.

The admin page lists only returned system Agents, loads `fetchSkillOptions(token, {})`, and renders the existing editor in admin mode. Keep the layout restrained and consistent with the existing Skill center; do not add a run console in the admin area.

- [ ] **Step 5: Add admin navigation**

Insert `{ key: "/admin/agents", icon: <DeploymentUnitOutlined />, label: "Agent 中心" }` beside the Skill center and update `activeKey` and `pageTitle` resolution.

- [ ] **Step 6: Run the focused frontend tests**

```bash
cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/agents/admin-agent-view.test.mts' 'src/app/(user)/projects/[id]/agents/agent-center-utils.test.mts'
```

Expected: PASS.

- [ ] **Step 7: Commit the admin UI**

```bash
git add web/src/services/api/admin-agents.ts web/src/services/api/admin-skills.ts web/src/app/'(admin)'/admin/agents web/src/app/'(admin)'/admin/layout.tsx web/src/app/'(user)'/projects/'[id]'/agents/components/agent-version-editor.tsx
git commit -m "feat: add admin system agent center"
```

### Task 4: Script Skill compatibility and per-episode persistence

**Files:**
- Create: `web/src/app/(user)/projects/script-skill-selection.ts`
- Create: `web/src/app/(user)/projects/script-skill-selection.test.mts`
- Create: `web/src/app/(user)/projects/[id]/script-skill-selection-session.ts`
- Create: `web/src/app/(user)/projects/[id]/script-skill-selection-session-storage.ts`
- Create: `web/src/app/(user)/projects/[id]/script-skill-selection-session.test.mts`

- [ ] **Step 1: Write failing compatibility tests**

Build an Agent package with one `source_text → production_script` default ref and candidate Skill versions. Assert candidates are rejected when their Skill ID, owner type, capability, required tools, input type, or output type violate the Agent package. Assert an unavailable stored version falls back to the Agent default.

The public helpers are:

```ts
export function compatibleScriptSkillOptions(pkg: AgentPackage, options: SkillOption[]): SkillOption[]
export function resolveScriptSkillVersionId(pkg: AgentPackage, options: SkillOption[], storedVersionId?: string): string
export function buildScriptSkillOverride(pkg: AgentPackage, options: SkillOption[], versionId: string): AgentSkillRef[]
```

`buildScriptSkillOverride` preserves `stepKey`, `required`, parameters, and bindings from the Agent step while replacing the exact Skill ID/version, capability, and expected output type from the selected option.

- [ ] **Step 2: Run selection tests and verify RED**

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/projects/script-skill-selection.test.mts' 'src/app/(user)/projects/[id]/script-skill-selection-session.test.mts'
```

Expected: FAIL because both modules are missing.

- [ ] **Step 3: Implement compatibility and fallback**

Use exact set membership and contract matching; do not infer compatibility from display names. Treat an empty Agent allow-list as unrestricted for that policy dimension, matching server validation semantics.

- [ ] **Step 4: Implement user-scoped persistence**

Use `createUserScopedLocalForage("script_skill_selections")` and keys shaped as:

```ts
export function scriptSkillSelectionKey(projectId: string, episodeId: string) {
    return `project:${projectId}:episode:${episodeId}:script-skill`;
}
```

Expose `loadScriptSkillSelection` and `saveScriptSkillSelection`. Store only the exact `skillVersionId`, not the package.

- [ ] **Step 5: Run the selection tests and verify GREEN**

Run the Step 2 command again. Expected: PASS.

- [ ] **Step 6: Commit the selection model**

```bash
git add web/src/app/'(user)'/projects/script-skill-selection.ts web/src/app/'(user)'/projects/script-skill-selection.test.mts web/src/app/'(user)'/projects/'[id]'/script-skill-selection-session*
git commit -m "feat: model per-episode script skill selection"
```

### Task 5: Freeze the selected Skill in script Agent Plans

**Files:**
- Modify: `web/src/app/(user)/projects/script-agent-runtime.ts`
- Modify: `web/src/app/(user)/projects/script-agent-runtime.test.mts`

- [ ] **Step 1: Add a failing exact-override test**

Extend the existing preflight test input with:

```ts
skillOverrides: [{
    stepKey: "script",
    label: "短剧剧本优化",
    capability: "workflow.stage.script",
    skillId: "skill-system-workflow-script",
    skillVersionId: "skill-version-system-workflow-script-3.2.0",
    skillVersionConstraint: "",
    required: true,
    inputBindings: [],
    parameters: {},
    expectedOutputType: "production_script",
}],
```

Assert the same full array appears in the `createAgentPlan` call.

- [ ] **Step 2: Run the runtime test and verify RED**

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/projects/script-agent-runtime.test.mts'
```

Expected: FAIL because `preflightScriptAgent` drops the override.

- [ ] **Step 3: Add the minimal runtime input and request field**

Extend `preflightScriptAgent` input with `skillOverrides?: AgentSkillRef[]` and conditionally add `skillOverrides` to `createAgentPlan`. Do not alter confirmation, execution, or review behavior.

- [ ] **Step 4: Run the runtime test and verify GREEN**

Run the Step 2 command again. Expected: PASS.

- [ ] **Step 5: Commit runtime freezing**

```bash
git add web/src/app/'(user)'/projects/script-agent-runtime.ts web/src/app/'(user)'/projects/script-agent-runtime.test.mts
git commit -m "feat: freeze selected script skill in agent plan"
```

### Task 6: Project UI selection and Agent center return action

**Files:**
- Create: `web/src/app/(user)/projects/[id]/use-script-skill-selection.ts`
- Modify: `web/src/app/(user)/projects/[id]/components/project-episode-board.tsx`
- Modify: `web/src/app/(user)/projects/[id]/page.tsx`
- Modify: `web/src/app/(user)/projects/[id]/agents/page.tsx`
- Modify: `web/src/app/(user)/projects/project-detail-navigation.test.mts`

- [ ] **Step 1: Write failing page wiring assertions**

Assert the Agent center page contains a link to `/projects/${project.id}` with “返回项目”. Assert the episode board exposes an accessible `剧本优化 Skill` Select beside the fixed “系统剧本制作 Agent” tag. Assert the project page calls `buildScriptSkillOverride` and passes `skillOverrides` into `preflightScriptAgent`.

- [ ] **Step 2: Run the page wiring test and verify RED**

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/projects/project-detail-navigation.test.mts'
```

Expected: FAIL because the selector and explicit return action are absent.

- [ ] **Step 3: Implement the project selection hook**

The page-local hook loads the system script Agent and compatible Skill options with TanStack Query, restores each episode selection through the persistence module, and returns:

```ts
{
    agent: ScriptAgentRef | undefined,
    agentPackage: AgentPackage | undefined,
    options: SkillOption[],
    importVersionId: string,
    setImportVersionId(versionId: string): void,
    episodeVersionIds: Record<string, string>,
    setEpisodeVersionId(episodeId: string, versionId: string): void,
    buildOverrides(versionId: string): AgentSkillRef[],
    error?: Error,
}
```

Reset only invalid selections, and surface Registry errors rather than silently falling back when no compatible Skill exists.

- [ ] **Step 4: Render compact selectors**

Add the selector beside the fixed Agent tag for the selected existing episode, with labels `Skill 名称 · v版本`. Add the same selector to the import modal header. Disable “剧本优化” when the registry is loading or no compatible Skill exists. Preserve current canvas theme tokens and compact header layout.

- [ ] **Step 5: Wire exact overrides into both run paths**

Change `runScriptAgentToReview` to accept `skillVersionId`, use the hook’s fixed Agent reference, build the full override, and pass it to `preflightScriptAgent`. Existing episode runs use their persisted selection; import runs use the modal’s temporary selection.

- [ ] **Step 6: Add the explicit Agent center return button**

Add a flat Ant Design button with `ArrowLeft` before the Agent center title and link directly to `/projects/${project.id}`. Keep the existing project-name breadcrumb.

- [ ] **Step 7: Run focused frontend tests and typecheck**

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/projects/project-detail-navigation.test.mts' 'src/app/(user)/projects/script-skill-selection.test.mts' 'src/app/(user)/projects/script-agent-runtime.test.mts' 'src/app/(user)/projects/[id]/script-skill-selection-session.test.mts'
npm run typecheck
```

Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 8: Commit project UI wiring**

```bash
git add web/src/app/'(user)'/projects/'[id]' web/src/app/'(user)'/projects/project-detail-navigation.test.mts
git commit -m "feat: select script skill per episode"
```

### Task 7: Documentation and final verification

**Files:**
- Modify: `docs/backend-database.md`
- Modify: `docs/todo.md`
- Modify: `docs/pending-test.md`

- [ ] **Step 1: Update documentation**

Document that no database table changed: existing `agent_definitions` and immutable `agent_versions` now support an admin lifecycle. Move the completed items from `docs/todo.md` to `docs/pending-test.md`, covering admin publication, project Skill selection, per-episode persistence, and the return button.

- [ ] **Step 2: Run backend regression tests**

```bash
go test ./service ./handler ./router -count=1
```

Expected: PASS.

- [ ] **Step 3: Run frontend regression tests**

```bash
cd web && npm test
```

Expected: PASS with zero failed tests.

- [ ] **Step 4: Run final static verification**

```bash
cd web && npm run typecheck
git diff --check
git status --short
```

Expected: TypeScript and diff checks exit 0; status lists only the intended documentation changes before the final commit.

- [ ] **Step 5: Commit documentation**

```bash
git add docs/backend-database.md docs/todo.md docs/pending-test.md
git commit -m "docs: add system agent and script skill testing"
```

