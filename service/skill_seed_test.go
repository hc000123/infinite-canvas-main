package service

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestEnsureSkillSeedsRegistersPublishedSystemSkills(t *testing.T) {
	setupAITaskTestDB(t)
	if err := EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	for _, stageKey := range systemSkillSeedStageKeys {
		skill, ok, err := repository.GetSkillDefinition("skill-system-workflow-" + stageKey)
		if err != nil || !ok {
			t.Fatalf("stage=%s ok=%v err=%v", stageKey, ok, err)
		}
		version, ok, err := repository.GetSkillVersion(skill.RecommendedVersionID)
		if err != nil || !ok {
			t.Fatalf("stage=%s ok=%v err=%v", stageKey, ok, err)
		}
		packageValue, err := DecodeSkillPackage(version)
		if err != nil {
			t.Fatalf("stage=%s err=%v", stageKey, err)
		}
		if skill.OwnerType != model.SkillOwnerSystem || version.Status != model.SkillVersionPublished || version.Version != "3.0.1" {
			t.Fatalf("skill=%+v version=%+v", skill, version)
		}
		if !slices.Contains(packageValue.Manifest.Capabilities, "workflow.stage."+stageKey) {
			t.Fatalf("manifest=%+v", packageValue.Manifest)
		}
		for _, path := range []string{"SKILL.md", "rules/domain-rules.md", "templates/output-template.md", "examples/good-output.json"} {
			if strings.TrimSpace(packageValue.Files[path]) == "" {
				t.Fatalf("stage=%s missing=%s", stageKey, path)
			}
		}
		var example any
		if err := json.Unmarshal([]byte(packageValue.Files["examples/good-output.json"]), &example); err != nil {
			t.Fatal(err)
		}
		schema, err := compileSkillOutputSchema(packageValue.OutputContract)
		if err != nil || schema.Validate(example) != nil {
			t.Fatalf("stage=%s schemaErr=%v", stageKey, err)
		}
	}
}

func TestEnsureSkillSeedsKeepsCustomWorkflowBinding(t *testing.T) {
	setupAITaskTestDB(t)
	if err := EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	custom := createSkillTestDraft(t, "workflow.stage.art", "9.0.0")
	custom.Status = model.SkillVersionPublished
	if err := repository.SaveSkillVersion(custom); err != nil {
		t.Fatal(err)
	}
	if err := repository.UpsertWorkflowStageSkillBinding(model.WorkflowStageSkillBinding{ID: "custom", StageKey: "art", Scope: model.WorkflowSkillScopeGlobal, SkillVersionID: custom.ID}); err != nil {
		t.Fatal(err)
	}
	if err := EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	binding, ok, err := repository.ResolveWorkflowStageSkillBinding("art", "")
	if err != nil || !ok || binding.SkillVersionID != custom.ID {
		t.Fatalf("binding=%+v ok=%v err=%v", binding, ok, err)
	}
}

func TestSkillSeedsExcludeLocalCodexOperations(t *testing.T) {
	setupAITaskTestDB(t)
	if err := EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	for _, stageKey := range systemSkillSeedStageKeys {
		skill, _, _ := repository.GetSkillDefinition("skill-system-workflow-" + stageKey)
		version, _, _ := repository.GetSkillVersion(skill.RecommendedVersionID)
		packageValue, err := DecodeSkillPackage(version)
		if err != nil {
			t.Fatal(err)
		}
		content := ""
		for _, fileContent := range packageValue.Files {
			content += "\n" + fileContent
		}
		for _, forbidden := range []string{"/goal", "dreamina ", "Suno", "ElevenLabs", "MCP", "signals.jsonl", "PostToolUse", "Stop hook"} {
			if strings.Contains(content, forbidden) {
				t.Fatalf("stage=%s contains local operation %q", stageKey, forbidden)
			}
		}
	}
}
