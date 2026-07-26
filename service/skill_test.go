package service

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

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
	if _, err := CreateSkill(
		"admin-1", model.SkillOwnerSystem, "", "Legacy", "",
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

func TestListSkillOptionsRequiresProjectOwnerUser(t *testing.T) {
	setupAITaskTestDB(t)
	created, err := CreateProjectSkill(
		"user-1", "project-1", "项目私有 Skill", "",
		SkillDraftInput{Version: "1.0.0", Package: invocableSkillTestPackage()},
	)
	if err != nil {
		t.Fatal(err)
	}
	created.Version.Status = model.SkillVersionPublished
	if err := repository.SaveSkillVersion(created.Version); err != nil {
		t.Fatal(err)
	}
	filter := SkillOptionFilter{Capability: "asset.character.rendition"}
	items, err := ListSkillOptions("user-1", "project-1", filter)
	if err != nil || len(items) != 1 || items[0].SkillID != created.Skill.ID {
		t.Fatalf("same owner items=%+v err=%v", items, err)
	}
	items, err = ListSkillOptions("user-2", "project-1", filter)
	if err != nil || len(items) != 0 {
		t.Fatalf("foreign user items=%+v err=%v", items, err)
	}
}

func TestVisibleSkillResolutionRequiresProjectOwnerUser(t *testing.T) {
	setupAITaskTestDB(t)
	pkg, err := ValidateInvocableSkillPackage(invocableSkillTestPackage())
	if err != nil {
		t.Fatal(err)
	}
	stamp := now()
	skill := model.SkillDefinition{
		ID: "project-skill", Name: "项目 Skill", OwnerType: model.SkillOwnerProject,
		OwnerUserID: "user-1", OwnerProjectID: "project-1", Enabled: true,
		RecommendedVersionID: "project-version", CreatedAt: stamp, UpdatedAt: stamp,
	}
	version := skillVersionFromPackage("project-version", skill.ID, "1.0.0", "user-1", stamp, pkg)
	version.Status = model.SkillVersionPublished
	if err := repository.CreateSkillAggregate(skill, version); err != nil {
		t.Fatal(err)
	}
	for _, resolve := range []struct {
		name string
		call func(userID, projectID string) (ResolvedSkill, error)
	}{
		{name: "exact", call: func(userID, projectID string) (ResolvedSkill, error) {
			return ResolveExactSkillVersion(userID, projectID, version.ID)
		}},
		{name: "recommended", call: func(userID, projectID string) (ResolvedSkill, error) {
			return ResolveRecommendedSkill(userID, projectID, skill.ID)
		}},
	} {
		t.Run(resolve.name, func(t *testing.T) {
			if _, err := resolve.call("user-1", "project-1"); err != nil {
				t.Fatalf("same owner rejected: %v", err)
			}
			if _, err := resolve.call("user-2", "project-1"); err == nil {
				t.Fatal("foreign user must be rejected")
			}
			if _, err := resolve.call("user-1", "project-2"); err == nil {
				t.Fatal("foreign project must be rejected")
			}
		})
	}
}

func TestCreateSkillSupportsSystemAndProjectOwners(t *testing.T) {
	setupAITaskTestDB(t)
	for _, owner := range []struct {
		typeValue model.SkillOwnerType
		projectID string
	}{
		{typeValue: model.SkillOwnerSystem},
		{typeValue: model.SkillOwnerProject, projectID: "project-1"},
	} {
		created, err := CreateSkill("admin-1", owner.typeValue, owner.projectID, "可组合 Skill", "说明", SkillDraftInput{Version: "1.0.0", Package: validSkillTestPackage()})
		if err != nil {
			t.Fatal(err)
		}
		expectedOwnerUserID := ""
		if owner.typeValue == model.SkillOwnerProject {
			expectedOwnerUserID = "admin-1"
		}
		if created.Skill.OwnerType != owner.typeValue || created.Skill.OwnerUserID != expectedOwnerUserID ||
			created.Skill.OwnerProjectID != owner.projectID || created.Version.Status != model.SkillVersionDraft {
			t.Fatalf("created=%+v", created)
		}
	}
}
