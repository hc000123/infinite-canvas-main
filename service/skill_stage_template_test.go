package service

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestSkillStageTemplatesBuildInvocablePackages(t *testing.T) {
	setupInvocationServiceTest(t)
	if err := EnsureCoreArtifactSchemas(); err != nil {
		t.Fatal(err)
	}
	want := map[string]string{
		WorkflowSkillStageScript: "production_script", WorkflowSkillStageArt: "asset_catalog",
		WorkflowSkillStageAssets: "asset_brief", WorkflowSkillStageStoryboard: "storyboard_package",
		WorkflowSkillStageVideo: "video_prompt_package", WorkflowSkillStageDelivery: "delivery_report",
		"content-classifier": "content_profile", "asset-brief-character": "asset_brief",
		"asset-brief-scene": "asset_brief", "asset-brief-prop": "asset_brief",
		"asset-rendition-character": "asset_rendition", "asset-rendition-scene": "asset_rendition",
		"asset-rendition-prop": "asset_rendition", "storyboard-vertical-short": "storyboard_package",
		"storyboard-horizontal-long": "storyboard_package",
	}
	templates := ListSkillStageTemplates()
	if len(templates) != len(want) {
		t.Fatalf("templates=%d want=%d", len(templates), len(want))
	}
	for _, item := range templates {
		t.Run(item.Key, func(t *testing.T) {
			if item.Label == "" || item.Capability == "" || item.FixedAdapter.AdapterID == "" || item.FixedAdapter.AdapterVersion == "" {
				t.Fatalf("template=%+v", item)
			}
			if item.OutputType != want[item.Key] {
				t.Fatalf("template=%+v wantOutput=%s", item, want[item.Key])
			}
			encoded, _ := json.Marshal(item)
			var snapshot map[string]any
			_ = json.Unmarshal(encoded, &snapshot)
			fixedAdapter, _ := snapshot["fixedAdapter"].(map[string]any)
			if snapshot["templateVersion"] != "1.0.0" || fixedAdapter["contentHash"] == "" || fixedAdapter["transformKind"] == "" {
				t.Fatalf("template snapshot=%s", encoded)
			}
			pkg, err := BuildImportedSkillPackage(item.Key, map[string]string{"SKILL.md": "# Test\n\nPreserve source facts."})
			if err != nil {
				t.Fatal(err)
			}
			if _, err := ValidateInvocableSkillPackage(pkg); err != nil {
				t.Fatal(err)
			}
			if err := ValidateSkillArtifactContracts(pkg); err != nil {
				t.Fatal(err)
			}
			if !containsSkillToken(pkg.Manifest.Capabilities, item.Capability) || !containsSkillToken(pkg.Manifest.OutputArtifactTypes, item.OutputType) {
				t.Fatalf("template=%+v manifest=%+v", item, pkg.Manifest)
			}
		})
	}
}

func TestResolveSkillStageTemplateRejectsUnknownStage(t *testing.T) {
	if _, err := ResolveSkillStageTemplate("unknown-stage"); err == nil {
		t.Fatal("unknown stage accepted")
	}
}

func TestResolveSkillStageTemplateVersionRejectsDuplicateRegistration(t *testing.T) {
	originalTemplates := registeredSkillStageTemplates
	t.Cleanup(func() { registeredSkillStageTemplates = originalTemplates })
	current, err := ResolveSkillStageTemplate(WorkflowSkillStageScript)
	if err != nil {
		t.Fatal(err)
	}
	registeredSkillStageTemplates = append(registeredSkillStageTemplates, current)
	if _, err := resolveSkillStageTemplateVersion(current.Key, current.TemplateVersion); err == nil || !strings.Contains(err.Error(), "重复") {
		t.Fatalf("duplicate registration err=%v", err)
	}
}
