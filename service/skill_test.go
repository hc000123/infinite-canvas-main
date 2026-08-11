package service

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestListSkillOptionsAreGlobalAcrossAccountsAndProjects(t *testing.T) {
	setupAITaskTestDB(t)
	if err := EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	filter := SkillOptionFilter{Capability: "workflow.stage.script", InputArtifactType: "source_text", OutputArtifactType: "production_script"}
	first, err := ListSkillOptions("user-1", "project-1", filter)
	if err != nil {
		t.Fatal(err)
	}
	second, err := ListSkillOptions("user-2", "project-2", filter)
	if err != nil {
		t.Fatal(err)
	}
	if len(first) == 0 || !reflect.DeepEqual(first, second) {
		t.Fatalf("first=%+v second=%+v", first, second)
	}
}

func TestPublishSkillVersionRequiresMatchingPassingEvaluation(t *testing.T) {
	setupAITaskTestDB(t)
	draft := createSkillTestDraft(t, "workflow.stage.storyboard", "1.1.0")
	_, err := PublishSkillVersion("admin-1", draft.ID)
	if err == nil || !strings.Contains(err.Error(), "通过评测") {
		t.Fatalf("err=%v", err)
	}
	if err := repository.CreateSkillEvaluation(model.SkillEvaluation{ID: "eval", SkillVersionID: draft.ID, ContentHash: draft.ContentHash, InputHash: "sample", Status: "passed"}); err != nil {
		t.Fatal(err)
	}
	published, err := PublishSkillVersion("admin-1", draft.ID)
	if err != nil {
		t.Fatal(err)
	}
	if published.Version.Status != model.SkillVersionPublished || published.Skill.RecommendedVersionID != "" {
		t.Fatalf("published=%+v", published)
	}
	recommended, err := RecommendPublishedSkillVersion("admin-1", draft.SkillID, draft.ID)
	if err != nil || recommended.Skill.RecommendedVersionID != draft.ID {
		t.Fatalf("recommended=%+v err=%v", recommended, err)
	}
}

func TestCreateAndPublishSkillRequireInvocableArtifactBindings(t *testing.T) {
	setupAITaskTestDB(t)
	legacy := legacySkillTestPackage()
	if _, err := CreateSystemSkill(
		"admin-1", "Legacy", "",
		SkillDraftInput{Version: "1.0.0", Package: legacy},
	); err == nil {
		t.Fatal("new drafts must reject legacy packages without artifact bindings")
	}
	normalized, err := NormalizeSkillPackage(legacy)
	if err != nil {
		t.Fatal(err)
	}
	stamp := now()
	skill := model.SkillDefinition{
		ID: "legacy-skill", Name: "Legacy", OwnerType: model.SkillOwnerSystem,
		Enabled: true, CreatedAt: stamp, UpdatedAt: stamp,
	}
	version := skillVersionFromPackage("legacy-version", skill.ID, "1.0.0", "admin-1", stamp, normalized)
	if err := repository.CreateSkillAggregate(skill, version); err != nil {
		t.Fatal(err)
	}
	if _, err := PublishSkillVersion("admin-1", version.ID); err == nil {
		t.Fatal("publish must reject legacy packages without artifact bindings")
	}
}

func TestCreateSystemSkillPersistsEmptyOwnerIDs(t *testing.T) {
	setupAITaskTestDB(t)
	created, err := CreateSystemSkill("admin-1", "系统 Skill", "", SkillDraftInput{Version: "1.0.0", Package: validSkillTestPackage()})
	if err != nil {
		t.Fatal(err)
	}
	if created.Skill.OwnerType != model.SkillOwnerSystem || created.Skill.OwnerUserID != "" || created.Skill.OwnerProjectID != "" {
		t.Fatalf("skill=%+v", created.Skill)
	}
}

func TestUpdateSkillDraftRejectsPublishedVersion(t *testing.T) {
	setupAITaskTestDB(t)
	draft := createSkillTestDraft(t, "workflow.stage.storyboard", "1.1.0")
	if err := repository.CreateSkillEvaluation(model.SkillEvaluation{ID: "eval", SkillVersionID: draft.ID, ContentHash: draft.ContentHash, InputHash: "sample", Status: "passed"}); err != nil {
		t.Fatal(err)
	}
	if _, err := PublishSkillVersion("admin-1", draft.ID); err != nil {
		t.Fatal(err)
	}
	_, err := UpdateSkillDraft(draft.ID, SkillDraftInput{Version: draft.Version, Package: validSkillTestPackage()})
	if err == nil || !strings.Contains(err.Error(), "不可修改") {
		t.Fatalf("err=%v", err)
	}
}

func TestListSkillOptionsFiltersManifestWithoutReturningFiles(t *testing.T) {
	setupAITaskTestDB(t)
	if err := EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	items, err := ListSkillOptions("", "", SkillOptionFilter{Capability: "workflow.stage.storyboard", InputArtifactType: "production_script", OutputArtifactType: "storyboard_package"})
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 {
		t.Fatalf("items=%+v", items)
	}
	recommended := items[0]
	if items[1].IsRecommended {
		recommended = items[1]
	}
	if recommended.SkillName != "分镜拆解" || recommended.Version != "3.1.0" ||
		recommended.SkillVersionID == "" || !recommended.IsRecommended || len(recommended.InputBindings) == 0 || len(recommended.OutputBindings) == 0 {
		t.Fatalf("recommended=%+v", recommended)
	}
	raw, _ := json.Marshal(recommended)
	if strings.Contains(string(raw), "SKILL.md") || strings.Contains(string(raw), "qualityGateProfile") {
		t.Fatalf("option exposed Skill implementation: %s", raw)
	}
}

func TestListSkillOptionsSerializesEmptyContractsAsArrays(t *testing.T) {
	setupAITaskTestDB(t)
	if err := EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	items, err := ListSkillOptions("", "", SkillOptionFilter{})
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range items {
		if item.InputBindings == nil || item.OutputBindings == nil {
			t.Fatalf("skill option contracts must be arrays: %+v", item)
		}
	}
}

func TestExactResolutionRejectsLegacyProjectOwner(t *testing.T) {
	setupAITaskTestDB(t)
	pkg, err := ValidateInvocableSkillPackage(invocableSkillTestPackage())
	if err != nil {
		t.Fatal(err)
	}
	stamp := now()
	skill := model.SkillDefinition{
		ID: "legacy-project-skill", Name: "遗留项目 Skill", OwnerType: model.SkillOwnerType("project"),
		OwnerUserID: "user-1", OwnerProjectID: "project-1", Enabled: true,
		RecommendedVersionID: "legacy-project-version", CreatedAt: stamp, UpdatedAt: stamp,
	}
	version := skillVersionFromPackage("legacy-project-version", skill.ID, "1.0.0", "user-1", stamp, pkg)
	version.Status = model.SkillVersionPublished
	if err := repository.CreateSkillAggregate(skill, version); err != nil {
		t.Fatal(err)
	}
	if _, err := ResolveExactSkillVersion("user-1", "project-1", version.ID); err == nil {
		t.Fatal("legacy project owner must not resolve")
	}
}
