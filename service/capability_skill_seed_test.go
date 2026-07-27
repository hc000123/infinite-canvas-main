package service

import (
	"encoding/json"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestEnsureSkillSeedsPublishesClassificationAssetBriefAndStoryboardVariants(t *testing.T) {
	setupInvocationServiceTest(t)
	if err := EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	want := []struct {
		id, capability, input, output string
		tags                          []string
	}{
		{"skill-system-content-classifier", "content.classify", "production_script", "content_profile", nil},
		{"skill-system-asset-brief-character", "asset.brief.compose", "asset_catalog", "asset_brief", []string{"character"}},
		{"skill-system-asset-brief-scene", "asset.brief.compose", "asset_catalog", "asset_brief", []string{"scene"}},
		{"skill-system-asset-brief-prop", "asset.brief.compose", "asset_catalog", "asset_brief", []string{"prop"}},
		{"skill-system-storyboard-vertical-short", "storyboard.compose", "content_profile", "storyboard_package", []string{"short_drama", "vertical"}},
		{"skill-system-storyboard-horizontal-long", "storyboard.compose", "content_profile", "storyboard_package", []string{"horizontal", "long_form"}},
	}
	for _, item := range want {
		skill, ok, err := repository.GetSkillDefinition(item.id)
		if err != nil || !ok || skill.OwnerType != model.SkillOwnerSystem || skill.RecommendedVersionID == "" {
			t.Fatalf("skill=%s value=%#v ok=%v err=%v", item.id, skill, ok, err)
		}
		version, ok, err := repository.GetSkillVersion(skill.RecommendedVersionID)
		if err != nil || !ok || version.Status != model.SkillVersionPublished || version.Version != "1.0.0" {
			t.Fatalf("skill=%s version=%#v ok=%v err=%v", item.id, version, ok, err)
		}
		pkg, err := DecodeSkillPackage(version)
		if err != nil {
			t.Fatal(err)
		}
		if !containsSkillToken(pkg.Manifest.Capabilities, item.capability) || !containsSkillToken(pkg.Manifest.InputArtifactTypes, item.input) || !containsSkillToken(pkg.Manifest.OutputArtifactTypes, item.output) {
			t.Fatalf("skill=%s manifest=%#v", item.id, pkg.Manifest)
		}
		for _, tag := range item.tags {
			if !containsSkillToken(pkg.Manifest.ProjectTags, tag) {
				t.Fatalf("skill=%s tags=%v", item.id, pkg.Manifest.ProjectTags)
			}
		}
		for _, path := range []string{"SKILL.md", "rules/domain-rules.md", "templates/output-template.md", "examples/good-output.json"} {
			if pkg.Files[path] == "" {
				t.Fatalf("skill=%s missing %s", item.id, path)
			}
		}
		if err := validateWorkflowSkillSeedExample(pkg); err != nil {
			t.Fatalf("skill=%s example: %v", item.id, err)
		}
	}
}

func TestEnsureSkillSeedsPublishesInvocableAssetRenditionVariants(t *testing.T) {
	setupInvocationServiceTest(t)
	if err := EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	if err := EnsureCoreArtifactSchemas(); err != nil {
		t.Fatal(err)
	}
	for _, kind := range []string{"character", "scene", "prop"} {
		t.Run(kind, func(t *testing.T) {
			skillID := "skill-system-asset-rendition-" + kind
			skill, ok, err := repository.GetSkillDefinition(skillID)
			if err != nil || !ok || skill.OwnerType != model.SkillOwnerSystem || skill.RecommendedVersionID == "" {
				t.Fatalf("skill=%s value=%#v ok=%v err=%v", skillID, skill, ok, err)
			}
			version, ok, err := repository.GetSkillVersion(skill.RecommendedVersionID)
			if err != nil || !ok || version.Status != model.SkillVersionPublished || version.Version != capabilitySkillSeedVersion {
				t.Fatalf("skill=%s version=%#v ok=%v err=%v", skillID, version, ok, err)
			}
			pkg, err := DecodeSkillPackage(version)
			if err != nil {
				t.Fatal(err)
			}
			if pkg.Manifest.ExecutorKind != "image_model" || pkg.Manifest.EstimatedCostClass != "image" ||
				len(pkg.Manifest.SideEffects) != 1 || pkg.Manifest.SideEffects[0] != "image_generation" {
				t.Fatalf("skill=%s manifest=%#v", skillID, pkg.Manifest)
			}
			if len(pkg.InputContract.ArtifactInputs) != 1 {
				t.Fatalf("skill=%s inputs=%#v", skillID, pkg.InputContract.ArtifactInputs)
			}
			input := pkg.InputContract.ArtifactInputs[0]
			if input.BindingName != "asset_brief" || input.ArtifactType != "asset_brief" || !input.Required ||
				input.Min != 1 || input.Max != 1 || !input.RequiresApproval {
				t.Fatalf("skill=%s input=%#v", skillID, input)
			}
			if len(pkg.OutputContract.ArtifactOutputs) != 1 {
				t.Fatalf("skill=%s outputs=%#v", skillID, pkg.OutputContract.ArtifactOutputs)
			}
			output := pkg.OutputContract.ArtifactOutputs[0]
			if output.BindingName != "asset_rendition" || output.ArtifactType != "asset_rendition" || output.Min != 1 || output.Max != 4 {
				t.Fatalf("skill=%s output=%#v", skillID, output)
			}
			for _, path := range []string{"SKILL.md", "rules/domain-rules.md", "templates/output-template.md", "examples/good-output.json"} {
				if pkg.Files[path] == "" {
					t.Fatalf("skill=%s missing %s", skillID, path)
				}
			}
			if err := validateWorkflowSkillSeedExample(pkg); err != nil {
				t.Fatalf("skill=%s example: %v", skillID, err)
			}
			passed, err := repository.HasPassingSkillEvaluation(version.ID, version.ContentHash)
			if err != nil || !passed {
				t.Fatalf("skill=%s evaluation passed=%v err=%v", skillID, passed, err)
			}
		})
	}
}

func TestWorkflowRoutingTagsDeriveFormatAndSeriesType(t *testing.T) {
	tags := workflowRoutingTags([]string{"female_audience"}, json.RawMessage(`{"format":"9:16","seriesType":"short_drama"}`))
	for _, want := range []string{"female_audience", "vertical", "short_drama"} {
		if !containsInvocationString(tags, want) {
			t.Fatalf("tags=%v missing=%s", tags, want)
		}
	}
	tags = workflowRoutingTags(nil, json.RawMessage(`{"format":"16:9","seriesType":"long_form"}`))
	for _, want := range []string{"horizontal", "long_form"} {
		if !containsInvocationString(tags, want) {
			t.Fatalf("tags=%v missing=%s", tags, want)
		}
	}
}
