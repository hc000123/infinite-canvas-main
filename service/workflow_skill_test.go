package service

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestPublishWorkflowSkillRequiresPassingEvaluation(t *testing.T) {
	setupAITaskTestDB(t)
	draft := createWorkflowSkillTestDraft(t, WorkflowSkillStageStoryboard, "1.1.0")
	_, err := PublishWorkflowSkillVersion("admin-1", draft.ID, WorkflowSkillPublishInput{Scope: model.WorkflowSkillScopeProject, ScopeID: "project-1"})
	if err == nil || !strings.Contains(err.Error(), "通过评测") {
		t.Fatalf("err=%v", err)
	}
}

func TestResolveWorkflowSkillPrefersProjectBinding(t *testing.T) {
	setupAITaskTestDB(t)
	if err := EnsureWorkflowSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	draft := createWorkflowSkillTestDraft(t, WorkflowSkillStageArt, "2.1.0")
	evaluation := model.WorkflowSkillEvaluation{
		ID: newID("skilleval"), SkillVersionID: draft.ID, ContentHash: draft.ContentHash,
		InputHash: "input-1", Status: "passed", CreatedBy: "admin-1", CreatedAt: now(), UpdatedAt: now(),
	}
	if err := repository.CreateWorkflowSkillEvaluation(evaluation); err != nil {
		t.Fatal(err)
	}
	if _, err := PublishWorkflowSkillVersion("admin-1", draft.ID, WorkflowSkillPublishInput{Scope: model.WorkflowSkillScopeProject, ScopeID: "project-1"}); err != nil {
		t.Fatal(err)
	}
	resolved, err := ResolvePublishedWorkflowSkill(WorkflowSkillStageArt, "project-1")
	if err != nil || resolved.Version.ID != draft.ID {
		t.Fatalf("resolved=%+v err=%v", resolved, err)
	}
	global, err := ResolvePublishedWorkflowSkill(WorkflowSkillStageArt, "project-2")
	if err != nil || global.Version.ID == draft.ID {
		t.Fatalf("global=%+v err=%v", global, err)
	}
}

func TestEnsureWorkflowSkillSeedsUpgradesLegacyBuiltInBinding(t *testing.T) {
	setupAITaskTestDB(t)
	stamp := now()
	skill := model.WorkflowSkill{ID: "workflow-skill-video", Name: "视频生成", StageKey: WorkflowSkillStageVideo, Enabled: true, CreatedAt: stamp, UpdatedAt: stamp}
	legacy := model.WorkflowSkillVersion{ID: "workflow-skill-version-video-1.0.0", SkillID: skill.ID, Version: "1.0.0", Status: model.WorkflowSkillVersionPublished, FilesJSON: `{"SKILL.md":"legacy"}`, ContractJSON: `{}`, ContentHash: "legacy", CreatedBy: "system", PublishedAt: stamp, CreatedAt: stamp, UpdatedAt: stamp}
	if err := repository.CreateWorkflowSkillAggregate(skill, legacy); err != nil {
		t.Fatal(err)
	}
	if err := repository.UpsertWorkflowStageSkillBinding(model.WorkflowStageSkillBinding{ID: "workflow-skill-binding-global-video", StageKey: WorkflowSkillStageVideo, Scope: model.WorkflowSkillScopeGlobal, SkillVersionID: legacy.ID, CreatedAt: stamp, UpdatedAt: stamp}); err != nil {
		t.Fatal(err)
	}
	if err := EnsureWorkflowSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	resolved, err := ResolvePublishedWorkflowSkill(WorkflowSkillStageVideo, "")
	if err != nil {
		t.Fatal(err)
	}
	if resolved.Version.Version != workflowSkillSeedVersion || !strings.Contains(resolved.Package.Files["SKILL.md"], "continuity_reference") {
		t.Fatalf("resolved=%+v package=%+v", resolved.Version, resolved.Package)
	}
}

func TestEnsureWorkflowSkillSeedsKeepsCustomGlobalBinding(t *testing.T) {
	setupAITaskTestDB(t)
	if err := EnsureWorkflowSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	draft := createWorkflowSkillTestDraft(t, WorkflowSkillStageArt, "9.0.0")
	stamp := now()
	draft.Status = model.WorkflowSkillVersionPublished
	draft.PublishedAt = stamp
	if err := repository.SaveWorkflowSkillVersion(draft); err != nil {
		t.Fatal(err)
	}
	if err := repository.UpsertWorkflowStageSkillBinding(model.WorkflowStageSkillBinding{ID: "workflow-skill-binding-global-art", StageKey: WorkflowSkillStageArt, Scope: model.WorkflowSkillScopeGlobal, SkillVersionID: draft.ID, CreatedAt: stamp, UpdatedAt: stamp}); err != nil {
		t.Fatal(err)
	}
	if err := EnsureWorkflowSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	resolved, err := ResolvePublishedWorkflowSkill(WorkflowSkillStageArt, "")
	if err != nil || resolved.Version.ID != draft.ID {
		t.Fatalf("resolved=%+v err=%v", resolved.Version, err)
	}
}

func TestEnsureWorkflowSkillSeedsUpgradesExisting300BindingTo301(t *testing.T) {
	setupAITaskTestDB(t)
	contract := workflowSkillSeedContract(WorkflowSkillStageArt)
	contract.QualityGateProfile = []string{"schema", "art"}
	legacyPackage, err := NormalizeWorkflowSkillPackage(map[string]string{"SKILL.md": "old 3.0.0 asset instructions"}, contract)
	if err != nil {
		t.Fatal(err)
	}
	filesJSON, _ := json.Marshal(legacyPackage.Files)
	contractJSON, _ := json.Marshal(legacyPackage.Contract)
	stamp := now()
	skill := model.WorkflowSkill{ID: "workflow-skill-art", Name: "资产提取", StageKey: WorkflowSkillStageArt, Enabled: true, CreatedAt: stamp, UpdatedAt: stamp}
	legacy := model.WorkflowSkillVersion{
		ID: "workflow-skill-version-art-3.0.0", SkillID: skill.ID, Version: "3.0.0", Status: model.WorkflowSkillVersionPublished,
		FilesJSON: string(filesJSON), ContractJSON: string(contractJSON), ContentHash: legacyPackage.ContentHash,
		CreatedBy: "system", PublishedAt: stamp, CreatedAt: stamp, UpdatedAt: stamp,
	}
	if err := repository.CreateWorkflowSkillAggregate(skill, legacy); err != nil {
		t.Fatal(err)
	}
	if err := repository.UpsertWorkflowStageSkillBinding(model.WorkflowStageSkillBinding{ID: "workflow-skill-binding-global-art", StageKey: WorkflowSkillStageArt, Scope: model.WorkflowSkillScopeGlobal, SkillVersionID: legacy.ID, CreatedAt: stamp, UpdatedAt: stamp}); err != nil {
		t.Fatal(err)
	}

	if err := EnsureWorkflowSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	resolved, err := ResolvePublishedWorkflowSkill(WorkflowSkillStageArt, "")
	if err != nil {
		t.Fatal(err)
	}
	if resolved.Version.Version != "3.0.1" {
		t.Fatalf("version=%s, want 3.0.1", resolved.Version.Version)
	}
	if !strings.Contains(resolved.Package.Files["SKILL.md"], "包括标点在内的连续原文子串") {
		t.Fatalf("3.0.1 art package does not contain the evaluated evidence rule")
	}
	if _, ok, err := repository.GetWorkflowSkillVersion(legacy.ID); err != nil || !ok {
		t.Fatalf("legacy version should remain available for rollback: ok=%v err=%v", ok, err)
	}
}

func TestWorkflowSkillSeedsContainProductionPackagesAndStrictSchemas(t *testing.T) {
	setupAITaskTestDB(t)
	if err := EnsureWorkflowSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	for _, stageKey := range workflowSkillSeedStageKeys {
		resolved, err := ResolvePublishedWorkflowSkill(stageKey, "")
		if err != nil {
			t.Fatal(err)
		}
		if resolved.Version.Version != "3.0.1" {
			t.Fatalf("stage=%s version=%s", stageKey, resolved.Version.Version)
		}
		for _, path := range []string{"SKILL.md", "rules/domain-rules.md", "templates/output-template.md", "examples/good-output.json"} {
			if strings.TrimSpace(resolved.Package.Files[path]) == "" {
				t.Fatalf("stage=%s missing=%s", stageKey, path)
			}
		}
		required, ok := resolved.Package.Contract.OutputSchema["required"].([]any)
		if !ok || len(required) == 0 {
			t.Fatalf("stage=%s has loose schema: %#v", stageKey, resolved.Package.Contract.OutputSchema)
		}
		report := newWorkflowGateReport()
		appendWorkflowSkillSchemaIssues([]byte(resolved.Package.Files["examples/good-output.json"]), resolved.Package.Contract, &report)
		if !report.finish().Passed {
			t.Fatalf("stage=%s example does not match schema: %+v", stageKey, report.Issues)
		}
		if stageKey != WorkflowSkillStageVideo && resolved.Package.Contract.ImagePolicy.Max != 0 {
			t.Fatalf("stage=%s unexpectedly accepts images", stageKey)
		}
	}
}

func TestWorkflowSkillSeedsExcludeLocalCodexOperations(t *testing.T) {
	setupAITaskTestDB(t)
	if err := EnsureWorkflowSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	for _, stageKey := range workflowSkillSeedStageKeys {
		resolved, err := ResolvePublishedWorkflowSkill(stageKey, "")
		if err != nil {
			t.Fatal(err)
		}
		content := ""
		for _, fileContent := range resolved.Package.Files {
			content += "\n" + fileContent
		}
		for _, forbidden := range []string{"/goal", "dreamina ", "Suno", "ElevenLabs", "MCP", "signals.jsonl", "PostToolUse", "Stop hook"} {
			if strings.Contains(content, forbidden) {
				t.Fatalf("stage=%s contains local operation %q", stageKey, forbidden)
			}
		}
	}
}

func TestValidateWorkflowSkillPackageRejectsUnsafeFilesAndTooManyImages(t *testing.T) {
	contract := validWorkflowSkillTestContract()
	contract.ImagePolicy.Max = 10
	_, err := NormalizeWorkflowSkillPackage(map[string]string{"SKILL.md": "ok", "../run.sh": "bad"}, contract)
	if err == nil {
		t.Fatal("expected invalid package")
	}
}

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
		Skill:   model.WorkflowSkill{Name: "分镜"},
		Version: model.WorkflowSkillVersion{Version: "3.0.0", ContentHash: "hash"},
		Package: WorkflowSkillPackage{Files: map[string]string{
			"examples/good-output.json":    `{"shots":[]}`,
			"SKILL.md":                     "主说明",
			"templates/output-template.md": "模板",
			"rules/domain-rules.md":        "规则",
		}},
	}
	instructions := workflowSkillInstructions(resolved)
	expectedOrder := []string{"SKILL.md", "rules/domain-rules.md", "templates/output-template.md", "examples/good-output.json"}
	previous := -1
	for _, name := range expectedOrder {
		index := strings.Index(instructions, name)
		if index <= previous {
			t.Fatalf("unstable order in %q", instructions)
		}
		previous = index
	}
}

func TestNormalizeWorkflowSkillPackageRejectsInvalidOutputSchema(t *testing.T) {
	contract := validWorkflowSkillTestContract()
	contract.OutputSchema = map[string]any{"type": "definitely-not-a-json-schema-type"}
	if _, err := NormalizeWorkflowSkillPackage(map[string]string{"SKILL.md": "ok"}, contract); err == nil {
		t.Fatal("expected invalid schema")
	}
}

func TestNormalizeWorkflowSkillPackageRequiresStrictContractBoundaries(t *testing.T) {
	cases := []func(*WorkflowSkillContract){
		func(contract *WorkflowSkillContract) { contract.RequiredInputs = nil },
		func(contract *WorkflowSkillContract) { contract.QualityGateProfile = []string{"schema"} },
		func(contract *WorkflowSkillContract) { contract.ApplyTargets = nil },
		func(contract *WorkflowSkillContract) {
			contract.RequiredInputs = append(contract.RequiredInputs, "referenceImages")
			contract.ImagePolicy.Max = 9
			contract.ImagePolicy.AllowedTypes = []string{"image/png"}
			contract.ImagePolicy.AllowTextFallback = true
		},
	}
	for _, mutate := range cases {
		contract := validWorkflowSkillTestContract()
		mutate(&contract)
		if _, err := NormalizeWorkflowSkillPackage(map[string]string{"SKILL.md": "ok"}, contract); err == nil {
			t.Fatalf("expected strict contract rejection: %+v", contract)
		}
	}
}

func TestWorkflowSkillSeedSchemasRejectInvalidOutputs(t *testing.T) {
	evidence := make([]map[string]any, 10)
	for index := range evidence {
		evidence[index] = map[string]any{"imageRef": "@图1", "observations": []string{"可见特征"}, "appliedTo": []string{"CHAR-001"}}
	}
	video, _ := json.Marshal(map[string]any{"shotId": "shot-001", "prompt": "场景：室内。\n声音：环境音。\n画面内容：0-6秒，人物进门。\n限制：不切镜。", "promptInputHash": "hash", "referenceEvidence": evidence})
	cases := []struct {
		stageKey string
		content  []byte
	}{
		{WorkflowSkillStageArt, []byte(`{"items":[{"logicalAssetId":"CHAR-001","kind":"vehicle","name":"林秋","scriptEvidence":"林秋进门","description":"主要角色"}]}`)},
		{WorkflowSkillStageAssets, []byte(`{"items":[{"logicalAssetId":"CHAR-001","kind":"character","name":"林秋","scriptEvidence":"林秋进门","description":"主要角色","imagePrompt":42,"status":"ready"}]}`)},
		{WorkflowSkillStageStoryboard, []byte(`{"shots":[{"shotId":"shot-001","sceneKey":"scene-001","sourceScript":"林秋进门。","shotDraft":{"shotSize":"中景","camera":"平视","movement":"推近","action":"进门","performance":"克制","dialogue":"","durationSeconds":16,"continuityMode":"unknown"}}]}`)},
		{WorkflowSkillStageVideo, video},
	}
	for _, testCase := range cases {
		report := newWorkflowGateReport()
		appendWorkflowSkillSchemaIssues(testCase.content, workflowSkillSeedContract(testCase.stageKey), &report)
		if report.finish().Passed {
			t.Fatalf("stage=%s accepted invalid output", testCase.stageKey)
		}
	}
}

func TestWorkflowSkillOutputSchemaAddsBlockingIssue(t *testing.T) {
	contract := validWorkflowSkillTestContract()
	contract.OutputSchema = map[string]any{
		"type":       "object",
		"required":   []string{"items"},
		"properties": map[string]any{"items": map[string]any{"type": "array", "minItems": 1}},
	}
	report := newWorkflowGateReport()
	appendWorkflowSkillSchemaIssues([]byte(`{"wrong":[]}`), contract, &report)
	if report.finish().Passed || len(report.Issues) == 0 || report.Issues[0].Code != "output_schema" {
		t.Fatalf("report=%+v", report)
	}
}

func TestWorkflowSkillRuntimeInputRequiresConfiguredImages(t *testing.T) {
	contract := validWorkflowSkillTestContract()
	contract.RequiredInputs = []string{"workflow", "script", "upstreamArtifact", "shotContext"}
	contract.ImagePolicy.Min = 1
	contract.ImagePolicy.Max = 9
	contract.ImagePolicy.AllowTextFallback = false
	detail := WorkflowRunDetail{Run: model.WorkflowRun{ID: "workflow-1", UserID: "user-1", ScriptSnapshot: "剧本"}}
	artifact := model.WorkflowArtifact{ID: "artifact-1", ContentJSON: `{"shots":[]}`}
	input := WorkflowStageStartInput{Context: json.RawMessage(`{"shotId":"shot-1"}`)}
	err := validateWorkflowSkillRuntimeInput("user-1", detail, WorkflowStageShotPrompt, artifact, input, contract)
	if err == nil || !strings.Contains(err.Error(), "至少需要 1 张参考图片") {
		t.Fatalf("err=%v", err)
	}
}

func createWorkflowSkillTestDraft(t *testing.T, stageKey string, versionName string) model.WorkflowSkillVersion {
	t.Helper()
	if err := EnsureWorkflowSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	skill, ok, err := repository.FindWorkflowSkillByStage(stageKey)
	if err != nil || !ok {
		t.Fatalf("skill ok=%v err=%v", ok, err)
	}
	contract := validWorkflowSkillTestContract()
	contract.ApplyTargets = []string{stageKey}
	contract.QualityGateProfile = []string{"schema", workflowSkillRequiredGateByTarget[stageKey]}
	packageValue, err := NormalizeWorkflowSkillPackage(map[string]string{"SKILL.md": "生成可审核的结构化结果。"}, contract)
	if err != nil {
		t.Fatal(err)
	}
	filesJSON, _ := json.Marshal(packageValue.Files)
	contractJSON, _ := json.Marshal(packageValue.Contract)
	draft := model.WorkflowSkillVersion{
		ID: newID("skillversion"), SkillID: skill.ID, Version: versionName,
		Status: model.WorkflowSkillVersionDraft, FilesJSON: string(filesJSON), ContractJSON: string(contractJSON),
		ContentHash: packageValue.ContentHash, CreatedBy: "admin-1", CreatedAt: now(), UpdatedAt: now(),
	}
	if err := repository.CreateWorkflowSkillVersion(draft); err != nil {
		t.Fatal(err)
	}
	return draft
}

func validWorkflowSkillTestContract() WorkflowSkillContract {
	contract := WorkflowSkillContract{
		RequiredInputs:      []string{"script"},
		OutputSchemaVersion: "1.0.0",
		OutputSchema:        map[string]any{"type": "object"},
		QualityGateProfile:  []string{"schema", "art"},
		ApplyTargets:        []string{WorkflowSkillStageArt},
	}
	contract.ImagePolicy.Max = 9
	contract.ImagePolicy.AllowedTypes = []string{"image/png", "image/jpeg", "image/webp"}
	contract.ImagePolicy.AllowTextFallback = true
	return contract
}
