# External Skill Folder Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a folder-first Skill lifecycle where admins import a complete external Skill folder, choose one production stage, run it without a Workflow Run ID, and publish the exact frozen version for Workflow, canvas, image, and API consumers.

**Architecture:** Add a server-owned stage template registry that generates the existing `SkillPackage` contract from a selected stage. Persist a canonical ZIP snapshot and file index on each imported `SkillVersion`, extend the current evaluation record into a standalone trial, and reuse versioned deterministic Workflow Adapters as locked conversion steps after content Skills. Replace the admin Skill center's default low-level editor flow with import, trial, publish, recommend, and archive actions; keep low-level details read-only under technical details.

**Tech Stack:** Go 1.25, Gin, GORM, `archive/zip`, `gopkg.in/yaml.v3`, Next.js App Router, React 19, TypeScript, Ant Design, TanStack Query.

---

## File map

- `service/skill_stage_template.go`: one registry for user-selectable stages and generated Skill packages.
- `service/skill_folder_import.go`: untrusted folder parsing, canonical ZIP creation, hashes, frontmatter, and import orchestration.
- `service/skill_trial.go`: standalone input resolution, content execution, fixed conversion, readable gates, and evaluation persistence.
- `service/workflow_adapter.go`: registered deterministic stage converters shared by trial and Workflow.
- `model/skill.go`, `repository/skill.go`, `repository/db.go`: imported source fields and persistence.
- `handler/admin_skill.go`, `router/router.go`: multipart import, file preview, and standalone trial routes.
- `web/src/services/api/admin-skills.ts`: typed folder import, source preview, and trial clients.
- `web/src/app/(admin)/admin/skills/components/skill-folder-import.tsx`: import dialog and directory upload.
- `web/src/app/(admin)/admin/skills/components/skill-source-browser.tsx`: read-only folder tree and text preview.
- `web/src/app/(admin)/admin/skills/components/skill-trial-panel.tsx`: paste/Artifact input and two-column result.
- `web/src/app/(admin)/admin/skills/page.tsx`: simplified lifecycle shell and technical-details disclosure.
- `web/src/app/(user)/projects/[id]/skills/page.tsx`: project-owned folder import entry using the same interaction.
- `service/workflow_seed.go`: locked adapter nodes in a new immutable system Workflow version.

## Task 1: Stage template registry

**Files:**
- Create: `service/skill_stage_template.go`
- Modify: `service/capability_skill_seed.go`
- Test: `service/skill_stage_template_test.go`

- [ ] **Step 1: Add failing registry tests**

Create table-driven tests covering every existing production capability. The minimum assertions are label, executor kind, capability, input binding, output binding, Core Schema, and a package that passes `ValidateInvocableSkillPackage`:

```go
func TestSkillStageTemplatesBuildInvocablePackages(t *testing.T) {
    setupInvocationServiceTest(t)
    if err := EnsureCoreArtifactSchemas(); err != nil { t.Fatal(err) }
    for _, item := range ListSkillStageTemplates() {
        t.Run(item.Key, func(t *testing.T) {
            pkg, err := BuildImportedSkillPackage(item.Key, map[string]string{"SKILL.md": "# Test\n\nPreserve source facts."})
            if err != nil { t.Fatal(err) }
            if _, err := ValidateInvocableSkillPackage(pkg); err != nil { t.Fatal(err) }
            if item.FixedAdapter.AdapterID == "" || item.FixedAdapter.AdapterVersion == "" { t.Fatalf("template=%+v", item) }
        })
    }
}
```

- [ ] **Step 2: Run the focused test and confirm the registry is missing**

Run: `go test ./service -run TestSkillStageTemplatesBuildInvocablePackages -count=1`

Expected: FAIL because `ListSkillStageTemplates` and `BuildImportedSkillPackage` do not exist.

- [ ] **Step 3: Implement the registry and package factory**

Use a stable public DTO and an internal package factory. Do not infer a stage from imported text:

```go
type SkillStageTemplate struct {
    Key            string             `json:"key"`
    Label          string             `json:"label"`
    Description    string             `json:"description"`
    ExecutorKind   string             `json:"executorKind"`
    Capability     string             `json:"capability"`
    InputTypes     []string           `json:"inputTypes"`
    OutputType     string             `json:"outputType"`
    FixedAdapter   WorkflowAdapterRef `json:"fixedAdapter"`
}

func ResolveSkillStageTemplate(key string) (SkillStageTemplate, error)
func ListSkillStageTemplates() []SkillStageTemplate
func BuildImportedSkillPackage(key string, files map[string]string) (SkillPackage, error)
```

Register the existing six workflow stages plus content classification, three asset Brief types, three asset rendition types, and two storyboard variants. Reuse `workflowSkillSeedArtifacts`, `workflowSkillSeedContract`, capability seed inputs/outputs, Core Artifact schemas, and `capabilitySeedGates` instead of duplicating contracts.

- [ ] **Step 4: Run the focused test**

Run: `go test ./service -run TestSkillStageTemplatesBuildInvocablePackages -count=1`

Expected: PASS.

- [ ] **Step 5: Commit the stage registry**

```bash
git add service/skill_stage_template.go service/skill_stage_template_test.go service/capability_skill_seed.go
git commit -m "feat: add skill stage template registry"
```

## Task 2: Imported folder snapshot model

**Files:**
- Modify: `model/skill.go`
- Modify: `repository/db.go`
- Modify: `repository/skill.go`
- Modify: `docs/backend-database.md`
- Test: `repository/skill_migration_test.go`
- Test: `repository/skill_test.go`

- [ ] **Step 1: Add failing persistence tests**

Add assertions that a Skill Definition preserves `StageKey`, and a Skill Version round-trips source metadata and binary ZIP bytes without serializing the blob to JSON:

```go
skill := model.SkillDefinition{ID: "folder-skill", Name: "剧本优化", StageKey: "script", OwnerType: model.SkillOwnerSystem}
version := model.SkillVersion{
    ID: "folder-version", SkillID: skill.ID, Version: "1.0.0", Status: model.SkillVersionDraft,
    SourceKind: "folder_import", SourceHash: "sha256:test", SourceArchiveBlob: []byte("zip"),
    SourceFileIndexJSON: `[{"path":"SKILL.md"}]`, ImportMetadataJSON: `{"folderName":"script"}`,
}
```

- [ ] **Step 2: Run persistence tests and confirm fields are missing**

Run: `go test ./repository -run 'TestSkill.*(Migrate|Source|Folder)' -count=1`

Expected: FAIL because imported source fields do not exist.

- [ ] **Step 3: Add model fields**

Add `StageKey string` to `SkillDefinition`. Add the following to `SkillVersion`:

```go
SourceKind          string `json:"sourceKind" gorm:"index"`
SourceHash          string `json:"sourceHash" gorm:"index"`
SourceArchiveBlob   []byte `json:"-" gorm:"type:blob"`
SourceFileIndexJSON string `json:"-" gorm:"type:text"`
ImportMetadataJSON  string `json:"-" gorm:"type:text"`
```

Use direct `AutoMigrate` per project policy; do not add legacy data migration or fallback columns. Update `docs/backend-database.md` with these fields and the immutable-source purpose.

- [ ] **Step 4: Run persistence tests**

Run: `go test ./repository -run 'TestSkill.*(Migrate|Source|Folder)' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit the persistence contract**

```bash
git add model/skill.go repository/db.go repository/skill.go repository/skill_migration_test.go repository/skill_test.go docs/backend-database.md
git commit -m "feat: persist imported skill folder snapshots"
```

## Task 3: Safe folder parsing and deterministic snapshots

**Files:**
- Create: `service/skill_folder_import.go`
- Test: `service/skill_folder_import_test.go`
- Modify: `go.mod`
- Modify: `go.sum`

- [ ] **Step 1: Add parser tests**

Cover nested files, YAML frontmatter, missing metadata fallbacks, stable order-independent hashes, binary retention, duplicate paths, traversal, absolute paths, invalid UTF-8, missing root `SKILL.md`, oversized files, too many files, and total-size limits.

Use an input type independent from `multipart.FileHeader`:

```go
type SkillFolderFile struct {
    Path string
    Data []byte
}

snapshot, err := ParseSkillFolder("剧本优化", []SkillFolderFile{
    {Path: "rules/preserve.md", Data: []byte("preserve dialogue")},
    {Path: "SKILL.md", Data: []byte("---\nname: Seedance 剧本优化\ndescription: 保留剧情\nversion: 1.2.0\n---\n# Rules")},
})
```

- [ ] **Step 2: Run parser tests and confirm failure**

Run: `go test ./service -run TestParseSkillFolder -count=1`

Expected: FAIL because the parser does not exist.

- [ ] **Step 3: Implement canonical parsing**

Define:

```go
type SkillFolderMetadata struct { Name, Description, Version string }
type SkillFolderFileIndex struct { Path, MIMEType, Hash string; Size int64; Text bool }
type SkillFolderSnapshot struct {
    FolderName string
    Metadata   SkillFolderMetadata
    TextFiles  map[string]string
    FileIndex  []SkillFolderFileIndex
    Archive    []byte
    SourceHash string
}
```

Normalize `/`-relative paths, ignore only `.DS_Store` and `Thumbs.db`, reject traversal/symlinks/duplicates, sort paths, create a deterministic ZIP with zero timestamps, and hash canonical `(path, size, bytes)` tuples. Parse frontmatter with `gopkg.in/yaml.v3`. Use explicit limits: 128 files, 2 MiB per file, 32 MiB total. Retain binary files in ZIP but include only UTF-8 `.md`, `.txt`, `.json`, `.yaml`, `.yml`, and `.csv` files in `TextFiles`.

- [ ] **Step 4: Run parser tests**

Run: `go test ./service -run TestParseSkillFolder -count=1`

Expected: PASS.

- [ ] **Step 5: Commit the parser**

```bash
git add service/skill_folder_import.go service/skill_folder_import_test.go go.mod go.sum
git commit -m "feat: parse external skill folders safely"
```

## Task 4: Folder import services and source browsing

**Files:**
- Modify: `service/skill_folder_import.go`
- Modify: `service/skill_management.go`
- Modify: `repository/skill.go`
- Test: `service/skill_management_test.go`

- [ ] **Step 1: Add service tests for new Definition and new version imports**

Cover System and Project ownership, stable `StageKey`, package generation from the stage template, source hash, exact file snapshot, new-version inheritance, automatic next patch version, explicit version override, duplicate content rejection, same-version/different-content rejection, and stage change rejection.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `go test ./service -run 'TestImportOwnedSkillFolder|TestImportOwnedSkillFolderVersion|TestSkillSourceFile' -count=1`

Expected: FAIL because import services do not exist.

- [ ] **Step 3: Implement import orchestration**

Expose:

```go
type SkillFolderImportInput struct {
    OwnerType model.SkillOwnerType
    ProjectID string
    StageKey  string
    Name      string
    Summary   string
    Version   string
    Snapshot  SkillFolderSnapshot
}

func ImportManagedSkillFolder(userID string, isAdmin bool, input SkillFolderImportInput) (ResolvedSkill, error)
func ImportOwnedSkillFolderVersion(userID string, isAdmin bool, skillID, version string, snapshot SkillFolderSnapshot) (model.SkillVersion, error)
func GetManagedSkillSourceFiles(userID, versionID string, isAdmin bool) ([]SkillFolderFileIndex, error)
func GetManagedSkillSourceText(userID, versionID, filePath string, isAdmin bool) (string, error)
```

Build the package from `BuildImportedSkillPackage`, create the existing Definition/Version aggregate, then persist source fields and an audit event in the same service operation. New-version import inherits `StageKey`; it never reads stage from the folder. Preview reads only indexed text entries from the immutable ZIP and revalidates path and hash.

- [ ] **Step 4: Run focused service tests**

Run: `go test ./service -run 'TestImportOwnedSkillFolder|TestImportOwnedSkillFolderVersion|TestSkillSourceFile' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit import services**

```bash
git add service/skill_folder_import.go service/skill_management.go service/skill_management_test.go repository/skill.go
git commit -m "feat: import versioned skill folder packages"
```

## Task 5: Admin multipart import and preview APIs

**Files:**
- Modify: `handler/admin_skill.go`
- Modify: `router/router.go`
- Test: `handler/admin_skill_test.go`

- [ ] **Step 1: Add HTTP tests**

Build multipart requests with repeated `files` and `paths` fields. Verify:

- `POST /api/v1/admin/skills/import-folder` returns Definition, Version, Package, and parsed metadata.
- `POST /api/v1/admin/skills/:id/import-version` returns the new draft.
- `GET /api/v1/admin/skill-stage-templates` returns the stage selector.
- `GET /api/v1/admin/skill-versions/:id/source-files` omits ZIP bytes.
- `GET /api/v1/admin/skill-versions/:id/source-file?path=rules/preserve.md` returns text only.
- non-admin callers and binary previews are rejected.

- [ ] **Step 2: Run handler tests and confirm failure**

Run: `go test ./handler -run 'TestAdmin.*Skill(Folder|StageTemplate|Source)' -count=1`

Expected: FAIL because routes and handlers do not exist.

- [ ] **Step 3: Implement bounded multipart decoding and routes**

Use `http.MaxBytesReader` with a 34 MiB request cap, `ParseMultipartForm`, and parallel repeated `paths` values. Never trust `FileHeader.Filename` as a relative path. Convert files to `[]service.SkillFolderFile`, then call the service layer. Keep handlers limited to authentication, decoding, service calls, and `OK`/`Fail`.

Add routes under the existing admin group; do not create a second authentication model.

- [ ] **Step 4: Run handler tests**

Run: `go test ./handler -run 'TestAdmin.*Skill(Folder|StageTemplate|Source)' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit the APIs**

```bash
git add handler/admin_skill.go handler/admin_skill_test.go router/router.go
git commit -m "feat: expose skill folder import APIs"
```

## Task 6: Standalone trial and fixed conversion

**Files:**
- Create: `service/skill_trial.go`
- Modify: `service/skill_evaluation.go`
- Modify: `service/workflow_adapter.go`
- Modify: `repository/skill.go`
- Modify: `handler/admin_skill.go`
- Modify: `router/router.go`
- Test: `service/skill_trial_test.go`
- Test: `service/workflow_adapter_test.go`
- Test: `handler/admin_skill_test.go`

- [ ] **Step 1: Add standalone trial tests**

Cover pasted text, approved Artifact input, explicit API-cost confirmation, content execution failure, candidate Schema failure, fixed converter execution, converter failure, persisted raw/standard/diff/gates, and no Workflow/Project business writes.

The public contract is:

```go
type SkillTrialInput struct {
    InputText      string            `json:"inputText"`
    InputArtifacts []ArtifactRefInput `json:"inputArtifacts"`
    ConfirmAPICost bool              `json:"confirmApiCost"`
}

type SkillTrialResult struct {
    Evaluation model.SkillEvaluation `json:"evaluation"`
    StageKey    string                `json:"stageKey"`
    Raw         any                   `json:"raw"`
    Standard    any                   `json:"standard"`
    Diff        map[string]any        `json:"diff"`
    Gates       []WorkflowGateIssue   `json:"gates"`
}
```

- [ ] **Step 2: Add deterministic stage adapters**

Register exact-version adapters for all stage templates. The converters may normalize whitespace, stable IDs, names, ordering, and references, but must preserve all source fields. At minimum:

- script preserves `productionScript` byte-for-byte after outer whitespace trimming;
- asset catalog assigns missing `CHAR/SCENE/PROP/COSTUME-###` IDs deterministically and never changes evidence/description;
- storyboard assigns missing `shot-###` and `scene-###` IDs deterministically and never changes dialogue/action;
- other stage adapters canonicalize ordering and validate, without model calls.

Expose a pure helper used by both trial and Workflow:

```go
func ConvertSkillStageOutput(template SkillStageTemplate, structured map[string]any) (json.RawMessage, map[string]any, error)
```

- [ ] **Step 3: Run trial tests and confirm failure before implementation**

Run: `go test ./service -run 'TestTrialSkill|TestStageAdapter' -count=1`

Expected: FAIL because trial and converters are missing.

- [ ] **Step 4: Implement standalone execution and persistence**

Reuse `skillEvaluationExecutorFactory`, `SkillPackageInstructions`, current model-channel resolution, output Schema compilation, `SkillEvaluation` storage, and `HasPassingSkillEvaluation`. Store the raw candidate and converted standard output in `ResultJSON`; store allowed changes in `DiffJSON`; store converter and quality results in `GateJSON`. Set evaluation `Status=passed` only when content and conversion gates both pass. Do not create a Workflow Run, Workflow Stage, formal project Artifact, binding, or recommendation.

Add:

- `POST /api/v1/admin/skill-versions/:id/trials`
- `GET /api/v1/admin/skill-trials/:id`

- [ ] **Step 5: Run trial and adapter tests**

Run: `go test ./service ./handler -run 'TestTrialSkill|TestStageAdapter|TestAdminSkillTrial' -count=1`

Expected: PASS.

- [ ] **Step 6: Commit standalone trial support**

```bash
git add service/skill_trial.go service/skill_trial_test.go service/skill_evaluation.go service/workflow_adapter.go service/workflow_adapter_test.go repository/skill.go handler/admin_skill.go handler/admin_skill_test.go router/router.go
git commit -m "feat: add standalone skill trials and conversion"
```

## Task 7: Lock converters into the standard Workflow

**Files:**
- Modify: `service/workflow_seed.go`
- Modify: `service/workflow_seed_test.go`
- Modify: `web/src/app/(user)/projects/[id]/workflows/components/workflow-version-editor.tsx`
- Test: `web/src/services/api/workflow-registry.test.mts`

- [ ] **Step 1: Add Workflow seed tests**

Assert a new immutable `2.4.0` system Workflow contains a locked adapter node immediately after each replaceable content stage, downstream bindings read the adapter output, and exact adapter ID/version/hash resolve during preview.

- [ ] **Step 2: Run seed tests and confirm failure**

Run: `go test ./service -run 'Test.*Workflow.*Adapter|TestEnsureWorkflowSeeds' -count=1`

Expected: FAIL because the current `2.3.0` seed has no stage converter nodes.

- [ ] **Step 3: Add adapter-node helper and rewire dependencies**

Add:

```go
func stageAdapterWorkflowNode(key, name, stageKey, artifactType, fromNode string) WorkflowNodeSpec {
    template, _ := ResolveSkillStageTemplate(stageKey)
    return WorkflowNodeSpec{
        NodeKey: key, Name: name, ExecutorType: WorkflowExecutorAdapter,
        AdapterRef: &template.FixedAdapter,
        InputBindings: []WorkflowNodeInputBinding{workflowOutputBinding(artifactType, artifactType, fromNode)},
        OutputArtifactType: artifactType,
    }
}
```

Bump only the system seed constants to `2.4.0`; never mutate `2.3.0`. Rewire downstream nodes to the adapter node keys. Display adapter nodes in the editor as collapsed, locked “系统转换规则”; disable delete, executor change, and config editing for these nodes.

- [ ] **Step 4: Run Workflow tests**

Run: `go test ./service -run 'Test.*Workflow.*Adapter|TestEnsureWorkflowSeeds' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit Workflow conversion nodes**

```bash
git add service/workflow_seed.go service/workflow_seed_test.go web/src/app/(user)/projects/[id]/workflows/components/workflow-version-editor.tsx web/src/services/api/workflow-registry.test.mts
git commit -m "feat: lock stage converters into workflow"
```

## Task 8: Admin Skill center folder-first UI

**Files:**
- Modify: `web/src/services/api/admin-skills.ts`
- Create: `web/src/app/(admin)/admin/skills/components/skill-folder-import.tsx`
- Create: `web/src/app/(admin)/admin/skills/components/skill-source-browser.tsx`
- Create: `web/src/app/(admin)/admin/skills/components/skill-trial-panel.tsx`
- Modify: `web/src/app/(admin)/admin/skills/page.tsx`
- Modify: `web/src/app/(admin)/admin/skills/skill-view.ts`
- Test: `web/src/app/(admin)/admin/skills/skill-view.test.mts`
- Test: `web/src/services/api/admin-skills.test.mts`

- [ ] **Step 1: Add client contract and view-model tests**

Test FormData contains parallel `files`/`paths`, stage filtering, lifecycle labels (`待测试`, `可使用`, `推荐`, `已停用`), and technical fields remain outside the primary action model.

- [ ] **Step 2: Run frontend tests and confirm failure**

Run: `cd web && node --experimental-strip-types --test src/services/api/admin-skills.test.mts src/app/'(admin)'/admin/skills/skill-view.test.mts`

Expected: FAIL because import/trial clients and view models do not exist.

- [ ] **Step 3: Add typed API clients**

Add `SkillStageTemplate`, `SkillSourceFile`, `SkillTrialInput`, and `SkillTrialResult`. Complete the existing `SkillInputContract.artifactInputs` and `SkillOutputContract.artifactOutputs` client types so the generated stage contract is represented accurately. Build FormData using `file.webkitRelativePath || file.name`, appending one `paths` entry per `files` entry. Add import-new, import-version, source-index, source-text, create-trial, and fetch-trial functions.

- [ ] **Step 4: Implement the simplified UI**

Primary flow:

1. “导入 Skill 文件夹” opens directory input and stage selector.
2. Imported draft opens the trial panel.
3. Trial panel accepts pasted text or an Artifact ID and shows raw/standard columns plus readable gates.
4. Successful current-hash trial enables “设为可用”; recommendation remains separate.
5. Version menu provides import-new-version, archive, and safe draft delete.

Group cards by stage. Replace the default `SkillEditor` with `SkillSourceBrowser`; move the existing low-level editor, contracts, hashes, bindings, audit, and evaluation JSON into a collapsed “技术详情”. Keep current theme tokens and Ant Design components.

- [ ] **Step 5: Run focused frontend tests**

Run: `cd web && node --experimental-strip-types --test src/services/api/admin-skills.test.mts src/app/'(admin)'/admin/skills/skill-view.test.mts`

Expected: PASS.

- [ ] **Step 6: Commit the admin UI**

```bash
git add web/src/services/api/admin-skills.ts web/src/services/api/admin-skills.test.mts web/src/app/'(admin)'/admin/skills
git commit -m "feat: make skill center folder first"
```

## Task 9: Project-owned import and shared consumer visibility

**Files:**
- Modify: `handler/project_skill.go`
- Modify: `router/router.go`
- Modify: `web/src/services/api/project-skills.ts`
- Modify: `web/src/app/(user)/projects/[id]/skills/page.tsx`
- Test: `handler/project_skill_test.go`
- Test: `web/src/services/api/project-skills.test.mts`
- Test: `service/workflow_skill_options_test.go`

- [ ] **Step 1: Add ownership and visibility tests**

Verify a project folder import is visible only to the owner/project, published imported versions appear in `ListSkillOptions` for matching capability/contracts, and the same Version ID/hash/package is returned to Workflow, canvas, image, and direct API filters.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `go test ./service ./handler -run 'TestProjectSkillFolder|TestImportedSkillOption' -count=1`

Expected: FAIL because project import routes do not exist.

- [ ] **Step 3: Add project import routes and UI**

Mirror the admin multipart decoder through a small shared handler helper. Project routes force `OwnerType=project`, take project ID from the request, and never accept System ownership. Reuse the same stage templates, import dialog, source browser, and trial panel; do not duplicate the runtime.

- [ ] **Step 4: Run ownership and client tests**

Run: `go test ./service ./handler -run 'TestProjectSkillFolder|TestImportedSkillOption' -count=1 && cd web && node --experimental-strip-types --test src/services/api/project-skills.test.mts`

Expected: PASS.

- [ ] **Step 5: Commit project import**

```bash
git add handler/project_skill.go handler/project_skill_test.go router/router.go web/src/services/api/project-skills.ts web/src/services/api/project-skills.test.mts web/src/app/'(user)'/projects/'[id]'/skills/page.tsx service/workflow_skill_options_test.go
git commit -m "feat: share imported skills across production entries"
```

## Task 10: Documentation and targeted acceptance

**Files:**
- Modify: `docs/backend-database.md`
- Modify: `docs/pending-test.md`
- Inspect: `docs/todo.md`

- [ ] **Step 1: Update testable-change documentation**

Add one `docs/pending-test.md` section covering folder import, stage-only setup, standalone trial, raw/standard comparison, fixed converters, publish/recommend separation, project isolation, and cross-entry exact-version identity. Move an existing matching todo only if one is present; otherwise leave `docs/todo.md` unchanged.

- [ ] **Step 2: Run focused backend verification**

Run:

```bash
go test ./repository ./service ./handler -run 'Skill|WorkflowAdapter|WorkflowSeed' -count=1
```

Expected: PASS with zero failures.

- [ ] **Step 3: Run focused frontend verification**

Run the exact frontend tests changed by this plan:

```bash
cd web
node --experimental-strip-types --test \
  src/services/api/admin-skills.test.mts \
  src/services/api/project-skills.test.mts \
  src/services/api/workflow-registry.test.mts \
  src/app/'(admin)'/admin/skills/skill-view.test.mts
```

Expected: PASS with zero failures.

- [ ] **Step 4: Run non-build integrity checks**

Per project instructions, do not run TypeScript compilation, production build, lint, or full test suites unless the user separately requests comprehensive verification. Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only planned files changed.

- [ ] **Step 5: Commit documentation**

```bash
git add docs/backend-database.md docs/pending-test.md docs/todo.md
git commit -m "docs: add skill folder runtime acceptance"
```
