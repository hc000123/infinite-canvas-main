package service

import (
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
	items, err := ListSkillOptions("", SkillOptionFilter{Capability: "workflow.stage.storyboard", InputArtifactType: "production_script", OutputArtifactType: "storyboard_package"})
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].SkillName != "分镜拆解" || items[0].SkillVersionID == "" || !items[0].IsRecommended {
		t.Fatalf("items=%+v", items)
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
		if created.Skill.OwnerType != owner.typeValue || created.Skill.OwnerProjectID != owner.projectID || created.Version.Status != model.SkillVersionDraft {
			t.Fatalf("created=%+v", created)
		}
	}
}
