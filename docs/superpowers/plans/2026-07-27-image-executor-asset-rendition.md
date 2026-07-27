# Image Executor Asset Rendition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real `image_model` Invocation executor, persist generated images as `asset_rendition` Artifacts, aggregate parallel rendition nodes, and ship the capability in the standard production Workflow.

**Architecture:** Extend the frozen Invocation policy instead of adding a page-specific image path. The API executor dispatches by frozen executor kind, converts provider image responses into ordinary structured Invocation output, and reuses existing schema, gate, review, lineage, retry, and credit transactions. Workflow bindings gain a generic multi-source form so three independent rendition Skills can feed one downstream binding.

**Tech Stack:** Go, Gin, GORM, SQLite test database, JSON Schema, embedded Skill packages, Next.js/React/TypeScript tests.

---

## File map

- `service/skill_package.go`: allow the two executable Skill kinds supported by this phase.
- `service/invocation_resolver.go`: route `image_model` candidates only when explicitly allowed by the caller/default Runtime policy.
- `service/invocation_contracts.go`: freeze output count and image request options in the execution policy.
- `service/invocation_preflight.go`: choose image model/channel, calculate per-output cost, and freeze confirmation requirements.
- `service/invocation_runner.go`: build and verify frozen image requests without weakening text request verification.
- `service/agent_run_executor.go`: dispatch API calls by Invocation executor kind and parse image generation responses.
- `service/runtime_media.go`: validate and content-address generated image bytes under `PublicAssetDir/runtime/image`.
- `repository/invocation_credit.go`: refund only failed image output slots on partial completion.
- `service/workflow_registry_contracts.go`, `service/workflow_graph.go`, `service/workflow_execution.go`: normalize and execute multi-source Workflow bindings.
- `service/capability_skill_seed.go`, `service/capability_skill_seeds/asset-rendition-*`: publish three independent image Skills.
- `service/workflow_seed.go`: publish standard Workflow 2.1 with three rendition nodes and a merged video input.
- `service/*_test.go`: TDD coverage for every Runtime boundary.
- `docs/todo.md`, `docs/pending-test.md`, `CHANGELOG.md`: record the testable change without claiming production validation.

### Task 1: Accept and route `image_model` Skill packages

**Files:**
- Modify: `service/skill_package.go`
- Modify: `service/invocation_resolver.go`
- Test: `service/skill_package_test.go`
- Test: `service/invocation_resolver_test.go`

- [ ] **Step 1: Write failing package and resolver tests**

Add a package test which changes a valid invocable fixture to `image_model`, `estimatedCostClass: image`, and `sideEffects: [image_generation]`, then asserts `ValidateInvocableSkillPackage` succeeds. Add resolver cases asserting a published image Skill is accepted with `AllowedExecutors: []string{"image_model"}` and rejected with `unsupported_executor` when only `text_model` is allowed.

- [ ] **Step 2: Run tests and observe RED**

Run:

```bash
go test ./service -run 'TestValidateInvocableSkillPackage.*Image|TestResolveInvocationSkill.*ImageExecutor' -count=1
```

Expected: FAIL because invocable packages and the default resolver executor list only permit `text_model`.

- [ ] **Step 3: Make executor validation explicit**

Use one supported-set check in `ValidateInvocableSkillPackage`:

```go
if !map[string]bool{"text_model": true, "image_model": true}[normalized.Manifest.ExecutorKind] {
    return SkillPackage{}, safeMessageError{message: "Skill 执行器无效"}
}
```

Keep `normalizeInvocationResolutionInput` caller policy authoritative. Change only the resolver default to:

```go
allowedExecutors := input.AllowedExecutors
if len(allowedExecutors) == 0 {
    allowedExecutors = []string{"text_model", "image_model"}
}
```

- [ ] **Step 4: Run focused tests and commit**

```bash
go test ./service -run 'TestValidateInvocableSkillPackage|TestResolveInvocationSkill' -count=1
git add service/skill_package.go service/skill_package_test.go service/invocation_resolver.go service/invocation_resolver_test.go
git commit -m "feat: allow image model skills in invocation routing"
```

Expected: PASS.

### Task 2: Freeze an image execution policy

**Files:**
- Modify: `service/invocation_contracts.go`
- Modify: `service/invocation_preflight.go`
- Modify: `service/invocation_query.go`
- Test: `service/invocation_preflight_test.go`
- Test: `service/invocation_query_test.go`

- [ ] **Step 1: Write failing image preflight tests**

Seed settings with `DefaultImageModel: "image-test"`, an enabled `image` channel, and cost `3`. Seed an image Skill with output max 4. Preflight with parameters `{"n":2,"size":"1024x1024"}` and assert:

```go
policy.ExecutorKind == "image_model"
policy.Model == "image-test"
policy.OutputCount == 2
policy.Credits == 6
policy.EstimatedCredits == 6
policy.ImageRequestJSON == `{"model":"image-test","n":2,"prompt":"...","size":"1024x1024"}`
```

Also assert `api_cost`, `image_generation`, and `batch` confirmations are present, and a missing image channel produces `executor_unavailable` without selecting a text channel.

- [ ] **Step 2: Run tests and observe RED**

```bash
go test ./service -run 'TestPreflightInvocation.*Image|TestInvocationQuery.*Image' -count=1
```

Expected: FAIL because policy selection is text-only and image fields do not exist.

- [ ] **Step 3: Extend the frozen policy**

Add these fields to `InvocationExecutionPolicy` and the safe summary where appropriate:

```go
OutputCount      int    `json:"outputCount"`
ImageRequestJSON string `json:"imageRequestJson,omitempty"`
```

In `resolveInvocationExecutionPolicy`, select model and capability by executor kind:

```go
capability, modelName := "text", settings.Public.ModelChannel.DefaultTextModel
if pkg.Manifest.ExecutorKind == "image_model" {
    capability, modelName = "image", settings.Public.ModelChannel.DefaultImageModel
}
```

For image Skills, parse only `n`, `size`, `quality`, `background`, and `output_format`; clamp `n` to the selected output spec min/max; build the prompt from the frozen Skill instructions plus the single `asset_brief` payload; canonicalize the body into `ImageRequestJSON`. Set `Credits` and `EstimatedCredits` to model cost multiplied by `n`. Set `api_cost` for both model executor kinds.

- [ ] **Step 4: Make frozen-policy validation executor-aware**

Require `OutputCount >= 1` and valid canonical image JSON for `image_model`; require empty image JSON for `text_model`. Keep fallback disabled and channel/model frozen for both.

- [ ] **Step 5: Run focused tests and commit**

```bash
go test ./service -run 'TestPreflightInvocation|TestInvocationQuery' -count=1
git add service/invocation_contracts.go service/invocation_preflight.go service/invocation_query.go service/invocation_preflight_test.go service/invocation_query_test.go
git commit -m "feat: freeze image invocation execution policy"
```

Expected: PASS.

### Task 3: Execute, validate, and persist generated images

**Files:**
- Create: `service/runtime_media.go`
- Create: `service/runtime_media_test.go`
- Modify: `service/assets.go`
- Modify: `service/invocation_runner.go`
- Modify: `service/agent_run_executor.go`
- Modify: `service/invocation_completion.go`
- Modify: `repository/invocation_credit.go`
- Test: `service/agent_run_executor_test.go`
- Test: `service/invocation_completion_test.go`
- Test: `repository/invocation_test.go`

- [ ] **Step 1: Write failing media persistence tests**

Set `config.Cfg.PublicAssetDir` to `t.TempDir()`. Persist a valid PNG twice and assert both calls return the same path:

```go
wantPrefix := "/api/uploaded-assets/runtime/image/sha256-"
```

Assert empty, non-image, and oversized data are rejected and leave no file.

- [ ] **Step 2: Run the media tests and observe RED**

```bash
go test ./service -run TestPersistRuntimeImage -count=1
```

Expected: FAIL because `persistRuntimeImage` does not exist.

- [ ] **Step 3: Implement content-addressed persistence**

Implement:

```go
type RuntimeImage struct {
    MediaRef string
    MIMEType string
    Hash     string
}

func persistRuntimeImage(data []byte) (RuntimeImage, error)
```

Use `http.DetectContentType`, accept PNG/JPEG/WebP, enforce the existing image byte limit, hash bytes with SHA-256, create `PublicAssetDir/runtime/image`, and write `<sha256>.<ext>` only when absent. Return `/api/uploaded-assets/runtime/image/<sha256>.<ext>`.

- [ ] **Step 4: Write failing API image executor tests**

Use `httptest.Server` for an image channel. Cover one `b64_json` result and one remote `url` result. Build an Agent Run with a frozen `image_model` policy and assert `Call` returns:

```json
{"outputs":[{"bindingName":"asset_rendition","ordinal":0,"payload":{"assetId":"character-001","renditionId":"rendition-...","mediaType":"image","mediaRef":"/api/uploaded-assets/runtime/image/...png","generationMetadata":{"provider":"openai","model":"image-test","requestId":"request-1"}}}]}
```

Add non-image, empty response, HTTP 429, and download failure cases.

- [ ] **Step 5: Run executor tests and observe RED**

```bash
go test ./service -run 'TestAPIAgentRunExecutor.*Image' -count=1
```

Expected: FAIL because the executor always calls text chat.

- [ ] **Step 6: Add executor dispatch**

In `APIAgentRunExecutor.Call`, load the frozen Invocation policy for Invocation runs. Dispatch `text_model` to the existing chat function and `image_model` to `callImageModel`. The image call must:

```go
SelectModelChannelWithOptions(run.Model, run.ChannelID, nil, "image")
POST BuildModelChannelURL(channel, "/images/generations")
```

Decode `data[].b64_json` or `data[].url`, persist each valid image, derive `assetId` from the frozen `asset_brief`, preserve requested ordinals, and return ordinary structured JSON. Never place API keys or base64 in returned output.

Remote URL download must use a redirect-aware client, resolve every hostname, reject loopback/private/unspecified/link-local addresses, cap redirects at five, require an image response, and enforce the same byte limit as persistence. Tests may inject a downloader for an `httptest.Server`; production code must not weaken the public-network check.

- [ ] **Step 7: Freeze and verify the exact image request**

In `buildInvocationAttemptQueueWithRetry`, write `policy.ImageRequestJSON` to `AgentRun.RequestJSON` for image runs instead of building chat messages. In `validateClaimedInvocationAgentRun`, compare against the same frozen body and select channel capability `image`; retain current text verification unchanged.

- [ ] **Step 8: Make image output cardinality and partial settlement exact**

For `image_model`, compare returned coordinates with the frozen first-attempt output count or retry plan requested coordinates. Missing coordinates are failed outputs, so at least one success yields `partial` and zero successes yields `failed`. Compute the refundable amount as:

```go
unitCost := policy.Credits / policy.OutputCount
refund := unitCost * failedCurrentAttemptSlots
```

Pass the target refund amount into the existing finalization transaction. Extend `settleInvocationCreditsTx` to create an idempotent partial refund for `AgentRunStatusPartial`, while preserving full refunds for failed/cancelled attempts and zero refunds for `needs_review`. A retry reserves only its requested failed-slot cost; preserved outputs are not billed twice.

- [ ] **Step 9: Prove completion creates real Artifacts and exact credits**

Run the worker against the fake image server, then assert `finalizeInvocationAgentRun` creates Core-Schema-valid `asset_rendition`, a direct parent ref to `asset_brief`, stable output ordinal, and `needs_review` status.

Run a two-slot partial response and assert one Artifact is preserved, half the frozen credits are refunded, the retry requests only the failed ordinal, and the combined attempts charge exactly two successful slots.

- [ ] **Step 10: Run focused tests and commit**

```bash
go test ./service ./repository -run 'TestPersistRuntimeImage|TestAPIAgentRunExecutor.*Image|TestInvocationCompletion.*Image|TestInvocation.*Partial.*Credit' -count=1
git add service/runtime_media.go service/runtime_media_test.go service/assets.go service/invocation_runner.go service/agent_run_executor.go service/agent_run_executor_test.go service/invocation_completion.go service/invocation_completion_test.go repository/invocation_credit.go repository/invocation_test.go
git commit -m "feat: execute and archive image renditions"
```

Expected: PASS.

### Task 4: Aggregate one Workflow binding from multiple upstream nodes

**Files:**
- Modify: `service/workflow_registry_contracts.go`
- Modify: `service/workflow_graph.go`
- Modify: `service/workflow_execution.go`
- Test: `service/workflow_graph_test.go`
- Test: `service/workflow_execution_test.go`

- [ ] **Step 1: Write failing graph normalization tests**

Add `FromNodeKeys []string` to test data with `scene_rendition`, `character_rendition`, and `prop_rendition`. Assert normalization sorts/deduplicates keys, adds all to `DependsOn`, rejects simultaneous `FromNodeKey`, and rejects a source whose output type differs.

- [ ] **Step 2: Write failing execution aggregation test**

Create approved parent nodes with two, one, and one output refs. Assert `workflowExecutionNodeInputs` produces four refs, all renamed to `asset_rendition`, ordered first by normalized source key and then by original ordinal. Assert a missing/unapproved parent fails with `Workflow 上游 Artifact 尚未批准`.

- [ ] **Step 3: Run tests and observe RED**

```bash
go test ./service -run 'TestNormalizeWorkflow.*MultiSource|TestWorkflowExecutionNodeInputs.*MultiSource' -count=1
```

Expected: FAIL because `fromNodeKeys` is not defined.

- [ ] **Step 4: Implement generic multi-source bindings**

Extend the contract:

```go
FromNodeKeys []string `json:"fromNodeKeys,omitempty"`
```

Normalize `fromNodeKeys` with `normalizedStringSet`, require exactly one of `fromNodeKey` and `fromNodeKeys`, validate every parent type, and add every source to dependencies. Refactor execution to a helper which loops source keys and preserves upstream output order.

- [ ] **Step 5: Update skipped-dependency handling**

When deciding whether a required binding depends on a skipped node, check membership in both `FromNodeKey` and `FromNodeKeys`; do not special-case asset nodes.

- [ ] **Step 6: Run focused tests and commit**

```bash
go test ./service -run 'TestNormalizeWorkflow|TestWorkflowExecution' -count=1
git add service/workflow_registry_contracts.go service/workflow_graph.go service/workflow_execution.go service/workflow_graph_test.go service/workflow_execution_test.go
git commit -m "feat: aggregate workflow inputs from multiple nodes"
```

Expected: PASS.

### Task 5: Publish three independent rendition Skills

**Files:**
- Modify: `service/capability_skill_seed.go`
- Create: `service/capability_skill_seeds/asset-rendition-character/SKILL.md`
- Create: `service/capability_skill_seeds/asset-rendition-character/rules/domain-rules.md`
- Create: `service/capability_skill_seeds/asset-rendition-character/templates/output-template.md`
- Create: `service/capability_skill_seeds/asset-rendition-character/examples/good-output.json`
- Create equivalent four files under `asset-rendition-scene/`
- Create equivalent four files under `asset-rendition-prop/`
- Test: `service/skill_seed_test.go`

- [ ] **Step 1: Write failing seed tests**

Assert 15 system Skills exist, the three new definitions have published recommended `1.0.0` versions, matching evaluation hashes, `image_model`, `image_generation`, `estimatedCostClass: image`, one approved `asset_brief` input, and `asset_rendition` output `1..4`. Validate every embedded good output against Skill and Core schemas.

- [ ] **Step 2: Run seed tests and observe RED**

```bash
go test ./service -run 'TestSeed.*Capability|TestSeed.*Rendition' -count=1
```

Expected: FAIL because rendition packages do not exist.

- [ ] **Step 3: Generalize capability seed execution metadata**

Add `ExecutorKind`, `SideEffects`, and `EstimatedCostClass` to `capabilitySkillSeed`; default them to text values in `ensureCapabilitySkillSeed`, and set image values only on rendition seeds. Do not duplicate seed persistence logic.

- [ ] **Step 4: Add production instructions and examples**

Each `SKILL.md` must define purpose, required input, invariant constraints, negative prompt rules, output count guidance, and exact output semantics. Domain rules must differ by character/scene/prop; examples must use stable `/api/uploaded-assets/runtime/image/` references and pass both schemas.

- [ ] **Step 5: Run focused tests and commit**

```bash
go test ./service -run 'TestSeed.*Skill|TestCapabilitySkill' -count=1
git add service/capability_skill_seed.go service/capability_skill_seeds service/skill_seed_test.go
git commit -m "feat: publish asset rendition image skills"
```

Expected: PASS.

### Task 6: Upgrade the standard production Workflow

**Files:**
- Modify: `service/workflow_seed.go`
- Modify: `service/workflow_seed_test.go`
- Modify: `service/workflow_execution_e2e_test.go`

- [ ] **Step 1: Write the failing 12-node Workflow test**

Assert recommended system Workflow version `2.1.0` contains 12 nodes and the three new nodes use the exact rendition Skill IDs. Assert video has one optional `asset_rendition` binding with:

```go
FromNodeKeys: []string{"character_rendition", "prop_rendition", "scene_rendition"}
```

Assert route preview totals three image node costs and includes image confirmations.

- [ ] **Step 2: Run the seed E2E and observe RED**

```bash
go test ./service -run 'TestSystemWorkflow.*E2E|TestSeedSystemWorkflow' -count=1
```

Expected: FAIL because the current Workflow is 2.0.0 with nine nodes.

- [ ] **Step 3: Add rendition nodes and merged video input**

Insert each rendition node immediately after its matching Brief node. Each requires review and generation confirmation through its Skill contract. Make video depend on storyboard, asset catalog, and all rendition nodes. Keep delivery downstream of video.

- [ ] **Step 4: Extend the E2E executor fixture**

Return Core-Schema-valid rendition outputs for image nodes, approve each, then assert the video Invocation input refs contain all three rendition Artifact IDs and hashes and each rendition has its Brief Artifact as parent.

- [ ] **Step 5: Run focused tests and commit**

```bash
go test ./service -run 'TestSystemWorkflow|TestWorkflowExecution' -count=1
git add service/workflow_seed.go service/workflow_seed_test.go service/workflow_execution_e2e_test.go
git commit -m "feat: connect rendition skills to production workflow"
```

Expected: PASS.

### Task 7: Full verification, browser acceptance, and documentation

**Files:**
- Modify: `docs/todo.md`
- Modify: `docs/pending-test.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Run backend focused integration tests**

```bash
go test ./service ./handler ./repository -run 'Invocation|Workflow|Skill|Asset' -count=1
```

Expected: PASS.

- [ ] **Step 2: Run all required verification**

```bash
go test ./... -count=1
cd web && npm test
cd web && npm run typecheck
cd web && npm run build
git diff --check
```

Expected: all commands exit 0; the front-end suite reports no failed tests.

- [ ] **Step 3: Update testable-change documentation**

Move completed image Runtime and Workflow aggregation items from `docs/todo.md` to `docs/pending-test.md`. Add a concise `CHANGELOG.md` Unreleased summary. State that provider-level visual quality requires a configured real image channel when one is unavailable; do not describe protocol mocks as real visual validation.

- [ ] **Step 4: Run isolated browser acceptance**

Start the worktree service on an unused port. In a fresh browser profile verify Skill center lists 15 system Skills, Workflow center shows 12 nodes and the multi-source video input, a project copy succeeds, and no page crashes or infinite-polls. Capture console error count and stop the temporary service.

- [ ] **Step 5: Commit final verification docs**

```bash
git add docs/todo.md docs/pending-test.md CHANGELOG.md
git commit -m "docs: record image rendition runtime acceptance"
git status --short --branch
```

Expected: clean worktree on `codex/composable-agent-skill-runtime-phase-1`.
