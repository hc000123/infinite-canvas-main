# Workflow Skill Productionization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the six placeholder workflow Skill seeds with production multi-file Skill packages extracted from the Seedance director source, and make package files and strict contracts affect real workflow execution without changing the current workflow UI or stage machine.

**Architecture:** Store six curated packages under `service/workflow_skill_seeds/` and embed them into the Go binary. Seed them as immutable `3.0.0` database versions, compose every allowed package file into the frozen runtime prompt, validate stage output with JSON Schema before existing hard gates, and validate required inputs and image policy before creating an Agent Run.

**Tech Stack:** Go 1.25, Gin/GORM workflow services, `embed.FS`, `github.com/santhosh-tekuri/jsonschema/v5`, existing Go tests, Markdown/JSON Skill resources.

---

## File map

- Create `service/workflow_skill_package.go`: package limits and deterministic prompt composition.
- Create `service/workflow_skill_contract.go`: JSON Schema and runtime input/image validation.
- Modify `service/workflow_skill.go`: delegate normalization and instruction rendering.
- Modify `service/workflow_skill_seed.go`: embed resources, build contracts, seed `3.0.0`.
- Modify `service/video_workflow.go`: apply contracts and reduce hardcoded business prompts.
- Modify `service/workflow_skill_evaluation.go`: use production-equivalent Schema validation.
- Modify `service/workflow_skill_test.go`, `service/video_workflow_test.go`, and prompt/snapshot tests.
- Create `service/workflow_skill_seeds/{script,art,assets,storyboard,video,delivery}/...`.
- Modify `go.mod`, `go.sum`, `docs/pending-test.md`, `docs/todo.md`, and `CHANGELOG.md`.

### Task 1: Enforce safe multi-file packages and load every package file

**Files:**
- Create: `service/workflow_skill_package.go`
- Modify: `service/workflow_skill.go`
- Test: `service/workflow_skill_test.go`

- [ ] **Step 1: Write failing validation and ordering tests**

Add:

```go
func TestNormalizeWorkflowSkillPackageRejectsUnsupportedAndOversizedFiles(t *testing.T) {
    contract := validWorkflowSkillTestContract()
    cases := []map[string]string{
        {"SKILL.md": "ok", "rules.txt": "not allowed"},
        {"SKILL.md": "ok", "examples/bad.json": "{"},
        {"SKILL.md": strings.Repeat("x", workflowSkillMaxFileBytes+1)},
        {"SKILL.md": strings.Repeat("x", workflowSkillMaxPackageBytes), "rules/a.md": "x"},
    }
    for _, files := range cases {
        if _, err := NormalizeWorkflowSkillPackage(files, contract); err == nil {
            t.Fatalf("expected invalid package: %#v", files)
        }
    }
}

func TestWorkflowSkillInstructionsIncludesAllFilesInStableOrder(t *testing.T) {
    resolved := ResolvedWorkflowSkill{
        Skill: model.WorkflowSkill{Name: "分镜"},
        Version: model.WorkflowSkillVersion{Version: "3.0.0", ContentHash: "hash"},
        Package: WorkflowSkillPackage{Files: map[string]string{
            "examples/good-output.json": `{"shots":[]}`,
            "SKILL.md": "主说明",
            "templates/output-template.md": "模板",
            "rules/domain-rules.md": "规则",
        }},
    }
    instructions := workflowSkillInstructions(resolved)
    expectedOrder := []string{"SKILL.md", "rules/domain-rules.md", "templates/output-template.md", "examples/good-output.json"}
    previous := -1
    for _, name := range expectedOrder {
        index := strings.Index(instructions, name)
        if index <= previous { t.Fatalf("unstable order in %q", instructions) }
        previous = index
    }
}
```

- [ ] **Step 2: Run and verify RED**

```bash
go test ./service -run 'TestNormalizeWorkflowSkillPackageRejectsUnsupportedAndOversizedFiles|TestWorkflowSkillInstructionsIncludesAllFilesInStableOrder' -count=1
```

Expected: compilation/assertion failure because limits and multi-file rendering do not exist.

- [ ] **Step 3: Implement the package helper**

Create these exact boundaries:

```go
const (
    workflowSkillMaxFiles        = 32
    workflowSkillMaxFileBytes    = 64 << 10
    workflowSkillMaxPackageBytes = 128 << 10
)

func validateWorkflowSkillFiles(files map[string]string) (map[string]string, error)
func workflowSkillPackageInstructions(files map[string]string) string
func workflowSkillFileRank(name string) int
```

Accept only safe relative `.md` and `.json` paths. Parse JSON resources, normalize text, enforce limits after normalization, and order `SKILL.md`, `rules/`, `templates/`, `examples/`, then other files. Wrap each file in `【Skill 文件：<path>】`.

Use the helper from `NormalizeWorkflowSkillPackage`, `workflowSkillInstructions`, and `workflowSkillInstructionsFromSnapshot`.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add service/workflow_skill.go service/workflow_skill_package.go service/workflow_skill_test.go
git commit -m "feat: load complete workflow skill packages"
```

### Task 2: Enforce JSON Schema, required inputs, and image policy

**Files:**
- Create: `service/workflow_skill_contract.go`
- Modify: `service/workflow_skill.go`
- Modify: `service/video_workflow.go`
- Modify: `service/workflow_skill_evaluation.go`
- Modify: `go.mod`, `go.sum`
- Test: `service/workflow_skill_test.go`, `service/video_workflow_test.go`

- [ ] **Step 1: Write failing contract tests**

```go
func TestNormalizeWorkflowSkillPackageRejectsInvalidOutputSchema(t *testing.T) {
    contract := validWorkflowSkillTestContract()
    contract.OutputSchema = map[string]any{"type": "definitely-not-a-json-schema-type"}
    if _, err := NormalizeWorkflowSkillPackage(map[string]string{"SKILL.md": "ok"}, contract); err == nil {
        t.Fatal("expected invalid schema")
    }
}

func TestWorkflowSkillOutputSchemaAddsBlockingIssue(t *testing.T) {
    contract := validWorkflowSkillTestContract()
    contract.OutputSchema = map[string]any{
        "type": "object",
        "required": []string{"items"},
        "properties": map[string]any{"items": map[string]any{"type": "array", "minItems": 1}},
    }
    report := newWorkflowGateReport()
    appendWorkflowSkillSchemaIssues([]byte(`{"wrong":[]}`), contract, &report)
    if report.finish().Passed || report.Issues[0].Code != "output_schema" {
        t.Fatalf("report=%+v", report)
    }
}
```

Also add `TestWorkflowSkillImagePolicyBlocksBeforeAgentRun`: publish a project Skill with `ImagePolicy.Min=1`, start `shot-prompt` without a batch, assert “至少需要 1 张参考图片”, and assert no Agent Run was created.

- [ ] **Step 2: Run and verify RED**

```bash
go test ./service -run 'TestNormalizeWorkflowSkillPackageRejectsInvalidOutputSchema|TestWorkflowSkillOutputSchemaAddsBlockingIssue|TestWorkflowSkillImagePolicyBlocksBeforeAgentRun' -count=1
```

Expected: missing helper/behavior failure.

- [ ] **Step 3: Add the mature Schema dependency**

```bash
go get github.com/santhosh-tekuri/jsonschema/v5@v5.3.1
```

- [ ] **Step 4: Implement focused contract helpers**

```go
var workflowSkillRequiredInputs = map[string]bool{
    "workflow": true, "script": true, "upstreamArtifact": true,
    "shotContext": true, "referenceImages": true,
}

func validateWorkflowSkillContract(contract WorkflowSkillContract) error
func compileWorkflowSkillSchema(contract WorkflowSkillContract) (*jsonschema.Schema, error)
func appendWorkflowSkillSchemaIssues(content []byte, contract WorkflowSkillContract, report *WorkflowGateReport)
func validateWorkflowSkillRuntimeInput(userID string, detail WorkflowRunDetail, stageID string, inputArtifact model.WorkflowArtifact, input WorkflowStageStartInput, contract WorkflowSkillContract) error
```

Reject unknown inputs, invalid Schema/version/gates/targets, bad image ranges, duplicate/unknown MIME types, and inconsistent required/fallback settings. Runtime validation must inspect the real frozen media batch, workflow/stage ownership, count, and MIME before task creation.

- [ ] **Step 5: Wire production and evaluation**

Call runtime validation after Skill resolution and before `CreateUserAgentRun`. Read the contract from the frozen `SkillSnapshotJSON` when completing a run; append Schema issues before saving the hard-gate report. Apply the same candidate Schema result in `callWorkflowSkillEvaluation`.

- [ ] **Step 6: Run focused tests and verify GREEN**

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add go.mod go.sum service/workflow_skill.go service/workflow_skill_contract.go service/workflow_skill_evaluation.go service/video_workflow.go service/workflow_skill_test.go service/video_workflow_test.go
git commit -m "feat: enforce workflow skill contracts"
```

### Task 3: Seed six curated production packages

**Files:**
- Modify: `service/workflow_skill_seed.go`
- Create: four files under each of `service/workflow_skill_seeds/{script,art,assets,storyboard,video,delivery}/`
- Test: `service/workflow_skill_test.go`

- [ ] **Step 1: Add failing seed completeness tests**

```go
func TestWorkflowSkillSeedsContainProductionPackagesAndStrictSchemas(t *testing.T) {
    setupAITaskTestDB(t)
    if err := EnsureWorkflowSkillSeeds(); err != nil { t.Fatal(err) }
    for _, stageKey := range workflowSkillSeedStageKeys {
        resolved, err := ResolvePublishedWorkflowSkill(stageKey, "")
        if err != nil { t.Fatal(err) }
        if resolved.Version.Version != "3.0.0" { t.Fatalf("stage=%s version=%s", stageKey, resolved.Version.Version) }
        for _, path := range []string{"SKILL.md", "rules/domain-rules.md", "templates/output-template.md", "examples/good-output.json"} {
            if strings.TrimSpace(resolved.Package.Files[path]) == "" { t.Fatalf("stage=%s missing=%s", stageKey, path) }
        }
        required, ok := resolved.Package.Contract.OutputSchema["required"].([]any)
        if !ok || len(required) == 0 {
            t.Fatalf("stage=%s has loose schema", stageKey)
        }
    }
}
```

Add a source scan test rejecting `/goal`, `dreamina `, `Suno`, `ElevenLabs`, `MCP`, `signals.jsonl`, and executable Hook instructions from embedded production packages.

- [ ] **Step 2: Run and verify RED**

```bash
go test ./service -run 'TestWorkflowSkillSeedsContainProductionPackagesAndStrictSchemas|TestWorkflowSkillSeedsExcludeLocalCodexOperations|TestEnsureWorkflowSkillSeedsUpgradesLegacyBuiltInBinding|TestEnsureWorkflowSkillSeedsKeepsCustomGlobalBinding' -count=1
```

Expected: version/package/schema failures.

- [ ] **Step 3: Embed and load `3.0.0` resources**

```go
//go:embed workflow_skill_seeds/*
var workflowSkillSeedFS embed.FS

const workflowSkillSeedVersion = "3.0.0"

var workflowSkillSeedStageKeys = []string{
    WorkflowSkillStageScript, WorkflowSkillStageArt, WorkflowSkillStageAssets,
    WorkflowSkillStageStoryboard, WorkflowSkillStageVideo, WorkflowSkillStageDelivery,
}

func loadWorkflowSkillSeedFiles(stageKey string) (map[string]string, error)
func workflowSkillSeedContract(stageKey string) WorkflowSkillContract
```

Walk only the selected stage directory and strip its prefix.

Define strict schemas:
- `script`: non-empty `productionScript`.
- `art`: non-empty `items` with stable ID, kind enum, name, evidence, description.
- `assets`: same identity plus non-empty `imagePrompt` and `status=ready`.
- `storyboard`: non-empty shots and the current eight `shotDraft` fields, duration 4–15, continuity enum.
- `video`: `shotId/prompt/promptInputHash/referenceEvidence`, with complete evidence rows.
- `delivery`: `summary/succeeded/failed/retrySuggestions/exportManifest`.

Set zero-image policies for non-video seeds and 0–9 PNG/JPEG/WebP with text fallback for video.

- [ ] **Step 4: Write the 24 curated resource files**

Every package gets:
- `SKILL.md`: stage goal, order, output boundary, prohibited behavior.
- `rules/domain-rules.md`: extracted professional method.
- `templates/output-template.md`: exact output field semantics.
- `examples/good-output.json`: neutral original example valid against Schema.

Required content:
- `script`: preserve facts, relationships, dialogue, scene order; no invention.
- `art`: evidence-first entry criteria, stable IDs, costume parent/variant rules, no prompts.
- `assets`: same-person character four-view; one clean scene master; prop structural view; costume inheritance; no row/ID changes.
- `storyboard`: one 4–15s narrative unit, content-driven duration, one movement, physical acting, exact dialogue, current eight fields only.
- `video`: four required prompt sections, continuous time ranges, `@图N` evidence, exact hash, project continuity-reference rule.
- `delivery`: audit results/failures/retries/export only, no external generation command.

Do not copy the external “轨道拖车员” example story.

- [ ] **Step 5: Run seed tests and verify GREEN**

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add service/workflow_skill_seed.go service/workflow_skill_seeds service/workflow_skill_test.go
git commit -m "feat: add production workflow skill packages"
```

### Task 4: Make Skill packages the business-instruction source

**Files:**
- Modify: `service/video_workflow.go`
- Modify: `service/video_workflow_storyboard_prompt_test.go`
- Modify: `service/video_workflow_skill_snapshot_test.go`

- [ ] **Step 1: Write a failing final-prompt boundary test**

Build `base + workflowSkillInstructions(resolved)` and assert the final prompt contains `场景：/声音：/画面内容：/限制：/continuity_reference/不得标记为首帧`, while the base prompt does not contain `continuity_reference`.

- [ ] **Step 2: Run and verify RED**

```bash
go test ./service -run 'TestWorkflowStagePromptGetsDomainRulesFromPublishedSkill|TestWorkflowStageFreezesPublishedSkillSnapshot|TestWorkflowStageRetryKeepsOriginalSkillSnapshot' -count=1
```

- [ ] **Step 3: Reduce `workflowStagePrompts`**

Keep only role, JSON-only transport instruction, immutable script/artifact/shot inputs, and security boundaries. Remove duplicated field lists and creative methods now supplied by Skill resources. Keep all validators unchanged. Frozen retries must continue using the original request and snapshot.

- [ ] **Step 4: Run and verify GREEN**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add service/video_workflow.go service/video_workflow_storyboard_prompt_test.go service/video_workflow_skill_snapshot_test.go
git commit -m "refactor: move workflow methods into skill packages"
```

### Task 5: Focused workflow regression

**Files:**
- Modify only workflow-scope files implicated by failures.

- [ ] **Step 1: Run Skill/snapshot tests**

```bash
go test ./service -run 'WorkflowSkill|WorkflowStageFreezes|WorkflowStageRetry' -count=1
```

Expected: PASS.

- [ ] **Step 2: Run artifact/gate tests**

```bash
go test ./service -run 'Workflow|AssetExtraction|AssetImagePrompt|ShotBreakdown|ShotPrompt' -count=1
```

Expected: PASS. Correct fixtures that represent valid output; do not loosen Schema to preserve invalid fixtures.

- [ ] **Step 3: Run repository workflow tests**

```bash
go test ./repository -run 'Workflow' -count=1
```

Expected: PASS.

- [ ] **Step 4: Confirm seeds in isolated test storage**

Confirm all six global built-in bindings resolve to `3.0.0`, all packages contain four files, and custom bindings remain unchanged. Do not modify `data/infinite-canvas.db`.

- [ ] **Step 5: Run existing frontend contract tests**

```bash
cd web && node --experimental-strip-types --test \
  'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-shot-draft.test.mts' \
  'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/video-last-frame.test.mts'
```

Expected: PASS, proving the eight-field `WorkflowShotDraft` shape and tail-frame continuity behavior remain compatible.

- [ ] **Step 6: Commit focused fixes only when needed**

```bash
git add service repository
git commit -m "test: cover production workflow skill runtime"
```

### Task 6: Update acceptance documentation

**Files:**
- Modify: `docs/pending-test.md`
- Modify if a matching item exists: `docs/todo.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add pending-test coverage**

Document six visible `3.0.0` multi-file packages, runtime rules/templates/examples, strict Schema/input/image contracts, unchanged page/stage structure, and retained continuity tail-frame behavior.

- [ ] **Step 2: Reconcile todo**

Move only matching completed Skill-content/runtime-loading items. Preserve unrelated delivery/UI work. Leave the file unchanged if no matching active item exists.

- [ ] **Step 3: Add one Unreleased summary**

Summarize production Skill packages, complete runtime loading, and strict contracts without duplicating the acceptance checklist.

- [ ] **Step 4: Check and commit docs**

```bash
git diff --check -- docs/pending-test.md docs/todo.md CHANGELOG.md
git add docs/pending-test.md docs/todo.md CHANGELOG.md
git commit -m "docs: add workflow skill 3.0 acceptance"
```

### Task 7: Final verification and goal completion

**Files:**
- No planned code changes.

- [ ] **Step 1: Run final focused verification**

```bash
go test ./service ./repository -run 'Workflow|AssetExtraction|AssetImagePrompt|ShotBreakdown|ShotPrompt' -count=1
```

Expected: PASS.

- [ ] **Step 2: Check scope**

```bash
git status --short
git diff --check HEAD~4..HEAD
git log -6 --oneline
```

Expected: the pre-existing `.gitignore` modification remains unstaged and untouched; commits contain only this workflow feature and required docs/dependency changes.

- [ ] **Step 3: Audit the design acceptance criteria**

Every criterion in `docs/superpowers/specs/2026-07-24-workflow-skill-productionization-design.md` must have test evidence or be explicitly reported incomplete.

- [ ] **Step 4: Complete the goal**

Call the goal status tool only after implementation, focused verification, and documentation are complete. Report final goal token usage returned by the tool.
