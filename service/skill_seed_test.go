package service

import (
	"encoding/json"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestEnsureSkillSeedsPublishesDynamicScriptAsOptionalVersion(t *testing.T) {
	setupAITaskTestDB(t)
	if err := EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	skill, ok, err := repository.GetSkillDefinition("skill-system-workflow-script")
	if err != nil || !ok {
		t.Fatalf("script skill missing: %v", err)
	}
	oldVersion, oldOK, err := repository.GetSkillVersion("skill-version-system-workflow-script-3.1.0")
	if err != nil {
		t.Fatal(err)
	}
	dynamic, newOK, err := repository.GetSkillVersion("skill-version-system-workflow-script-3.2.0")
	if err != nil {
		t.Fatal(err)
	}
	if !oldOK || !newOK || oldVersion.Status != model.SkillVersionPublished || dynamic.Status != model.SkillVersionPublished {
		t.Fatal("both script versions must remain published")
	}
	if oldVersion.SkillID != skill.ID || dynamic.SkillID != skill.ID {
		t.Fatal("script versions must share one definition")
	}
	if skill.RecommendedVersionID != oldVersion.ID {
		t.Fatalf("publishing an option must not change recommendation: %s", skill.RecommendedVersionID)
	}
	oldPackage, err := DecodeSkillPackage(oldVersion)
	if err != nil {
		t.Fatal(err)
	}
	dynamicPackage, err := DecodeSkillPackage(dynamic)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(oldPackage.Manifest.Capabilities, dynamicPackage.Manifest.Capabilities) ||
		!reflect.DeepEqual(oldPackage.InputContract.ArtifactInputs, dynamicPackage.InputContract.ArtifactInputs) ||
		!reflect.DeepEqual(oldPackage.OutputContract.ArtifactOutputs, dynamicPackage.OutputContract.ArtifactOutputs) {
		t.Fatal("3.2.0 changed the stable invocation contract")
	}
	if !strings.Contains(dynamicPackage.Files["SKILL.md"], "Seedance 2.0 短剧动态剧本转写") {
		t.Fatal("dynamic instructions were not imported")
	}
}

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
		if skill.OwnerType != model.SkillOwnerSystem || skill.OwnerUserID != "" ||
			version.Status != model.SkillVersionPublished || version.Version != "3.1.0" {
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

func TestNormalizeLegacySkillSeedsPreservesGoldenHashesAndAbsentContracts(t *testing.T) {
	setupAITaskTestDB(t)
	if err := EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	golden := map[string]string{
		WorkflowSkillStageScript:     "aa12e685eda07408f57c6b42b5f94a90ac4d2dbf0896a780a4116b79deb94ba3",
		WorkflowSkillStageArt:        "ca304ce0df9fee4f32d5db656813709dac40b1b6c311968660f36753199a69e7",
		WorkflowSkillStageAssets:     "2a74834120ab2f992ea0cd3f8f53642ceb1e02e23a196eae93f42b629968a2bf",
		WorkflowSkillStageStoryboard: "067f3d0995ddc342f1ad087c2ae862d9d2d71a09b1a3382cb163b650d6d3cf14",
		WorkflowSkillStageVideo:      "8c7f77638f2c73d59a3823ebc4039111bc820651e7a7de844148fe03660b02b3",
		WorkflowSkillStageDelivery:   "7fbfc609fdfb24c85c787a805ddfe77fa25a3abb31fc1d25246bd8bf6b975148",
	}
	for _, stageKey := range systemSkillSeedStageKeys {
		version, ok, err := repository.GetSkillVersion("skill-version-system-workflow-" + stageKey + "-3.0.1")
		if err != nil || !ok {
			t.Fatalf("stage=%s ok=%v err=%v", stageKey, ok, err)
		}
		pkg, err := DecodeSkillPackage(version)
		if err != nil {
			t.Fatalf("stage=%s err=%v", stageKey, err)
		}
		if version.ContentHash != golden[stageKey] || pkg.ContentHash != golden[stageKey] {
			t.Fatalf("stage=%s hash=%s packageHash=%s", stageKey, version.ContentHash, pkg.ContentHash)
		}
		if pkg.Manifest.ExecutorKind != "" || pkg.Manifest.RequiredTools != nil ||
			pkg.InputContract.ArtifactInputs != nil || pkg.OutputContract.ArtifactOutputs != nil {
			t.Fatalf("stage=%s legacy optional fields materialized: %+v", stageKey, pkg)
		}
	}
}

func TestEnsureSkillSeedsPublishesInvocationReady310WithoutRewritingLegacy(t *testing.T) {
	setupAITaskTestDB(t)
	if err := EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	for _, stageKey := range systemSkillSeedStageKeys {
		skill, ok, err := repository.GetSkillDefinition("skill-system-workflow-" + stageKey)
		if err != nil || !ok {
			t.Fatalf("stage=%s ok=%v err=%v", stageKey, ok, err)
		}
		if skill.OwnerUserID != "" || skill.RecommendedVersionID != "skill-version-system-workflow-"+stageKey+"-3.1.0" {
			t.Fatalf("stage=%s skill=%+v", stageKey, skill)
		}
		version, ok, err := repository.GetSkillVersion(skill.RecommendedVersionID)
		if err != nil || !ok || version.Version != "3.1.0" {
			t.Fatalf("stage=%s version=%+v ok=%v err=%v", stageKey, version, ok, err)
		}
		pkg, err := DecodeSkillPackage(version)
		if err != nil {
			t.Fatalf("stage=%s err=%v", stageKey, err)
		}
		if _, err := ValidateInvocableSkillPackage(pkg); err != nil {
			t.Fatalf("stage=%s invocable=%v", stageKey, err)
		}
		if pkg.Manifest.ExecutorKind != "text_model" || len(pkg.Manifest.RequiredTools) != 0 ||
			len(pkg.InputContract.ArtifactInputs) != len(pkg.Manifest.InputArtifactTypes) ||
			len(pkg.OutputContract.ArtifactOutputs) != len(pkg.Manifest.OutputArtifactTypes) {
			t.Fatalf("stage=%s contract=%+v", stageKey, pkg)
		}
		if stageKey == WorkflowSkillStageVideo {
			foundOptionalImages := false
			for _, input := range pkg.InputContract.ArtifactInputs {
				if input.ArtifactType == "asset_rendition" && !input.Required && input.Min == 0 && input.Max == 9 {
					foundOptionalImages = true
				}
			}
			if !foundOptionalImages {
				t.Fatalf("stage=%s missing optional 0..9 asset_rendition binding", stageKey)
			}
		}
		passed, err := repository.HasPassingSkillEvaluation(version.ID, version.ContentHash)
		if err != nil || !passed {
			t.Fatalf("stage=%s seed evaluation passed=%v err=%v", stageKey, passed, err)
		}
		binding, ok, err := repository.ResolveWorkflowStageSkillBinding(stageKey, "")
		if err != nil || !ok || binding.SkillVersionID != "skill-version-system-workflow-"+stageKey+"-3.0.1" {
			t.Fatalf("stage=%s binding=%+v ok=%v err=%v", stageKey, binding, ok, err)
		}
	}
}

func TestInvocationSkillSeedsPassSkillAndCoreOutputSchemas(t *testing.T) {
	setupAITaskTestDB(t)
	if err := EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	if err := EnsureCoreArtifactSchemas(); err != nil {
		t.Fatal(err)
	}
	wantCardinality := map[string][2]int{
		WorkflowSkillStageScript: {1, 1}, WorkflowSkillStageArt: {1, 1},
		WorkflowSkillStageAssets: {1, 300}, WorkflowSkillStageStoryboard: {1, 1},
		WorkflowSkillStageVideo: {1, 1}, WorkflowSkillStageDelivery: {1, 1},
	}
	for _, stageKey := range systemSkillSeedStageKeys {
		t.Run(stageKey, func(t *testing.T) {
			version, ok, err := repository.GetSkillVersion("skill-version-system-workflow-" + stageKey + "-3.1.0")
			if err != nil || !ok {
				t.Fatalf("version ok=%v err=%v", ok, err)
			}
			pkg, err := DecodeSkillPackage(version)
			if err != nil {
				t.Fatal(err)
			}
			var example any
			if err := json.Unmarshal([]byte(pkg.Files["examples/good-output.json"]), &example); err != nil {
				t.Fatal(err)
			}
			skillSchema, err := compileSkillOutputSchema(pkg.OutputContract)
			if err != nil {
				t.Fatalf("compile Skill schema: %v", err)
			}
			if err := skillSchema.Validate(example); err != nil {
				t.Fatalf("good output fails Skill schema: %v", err)
			}
			if len(pkg.OutputContract.ArtifactOutputs) != 1 {
				t.Fatalf("outputs=%+v", pkg.OutputContract.ArtifactOutputs)
			}
			for _, output := range pkg.OutputContract.ArtifactOutputs {
				want := wantCardinality[stageKey]
				if output.Min != want[0] || output.Max != want[1] {
					t.Fatalf("cardinality=%d..%d want=%d..%d", output.Min, output.Max, want[0], want[1])
				}
				core, err := ResolveArtifactSchema(output.ArtifactType, output.SchemaVersion)
				if err != nil {
					t.Fatal(err)
				}
				if err := ValidateArtifactPayload(core, json.RawMessage(pkg.Files["examples/good-output.json"])); err != nil {
					t.Fatalf("good output fails core schema %s: %v", output.ArtifactType, err)
				}
			}
		})
	}
}

func TestInvocationSkillSeedOverlaysRemoveLegacyOutputGuidance(t *testing.T) {
	setupAITaskTestDB(t)
	if err := EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	for _, stageKey := range []string{WorkflowSkillStageArt, WorkflowSkillStageAssets, WorkflowSkillStageVideo} {
		version, ok, err := repository.GetSkillVersion("skill-version-system-workflow-" + stageKey + "-3.1.0")
		if err != nil || !ok {
			t.Fatalf("stage=%s ok=%v err=%v", stageKey, ok, err)
		}
		pkg, err := DecodeSkillPackage(version)
		if err != nil {
			t.Fatal(err)
		}
		for _, path := range []string{"SKILL.md", "rules/domain-rules.md", "templates/output-template.md", "examples/good-output.json"} {
			content := pkg.Files[path]
			for _, forbidden := range []string{"logicalAssetId", "parentLogicalAssetId", "promptInputHash", "referenceEvidence"} {
				if strings.Contains(content, forbidden) {
					t.Fatalf("stage=%s file=%s retains legacy output field %s", stageKey, path, forbidden)
				}
			}
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
	if err := repository.UpsertWorkflowStageSkillBinding(model.WorkflowStageSkillBinding{ID: "custom", StageKey: "art", Scope: model.WorkflowStageSkillScopeGlobal, SkillVersionID: custom.ID}); err != nil {
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
