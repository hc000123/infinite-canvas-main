package service

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestProjectSkillManagementEnforcesOwnerAndLifecycle(t *testing.T) {
	setupInvocationServiceTest(t)
	pkg := validSkillTestPackage()
	pkg.Manifest.EstimatedCostClass = "none"
	created, err := CreateProjectSkill("user-owner", "project-1", "项目剧本", "项目专用", SkillDraftInput{Version: "1.0.0", Package: pkg})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := UpdateOwnedSkillDefinition("user-other", false, created.Skill.ID, "越权改名", "", nil); err == nil {
		t.Fatal("foreign project user mutated skill")
	}
	renamed, err := UpdateOwnedSkillDefinition("user-owner", false, created.Skill.ID, "项目剧本新版", "", nil)
	if err != nil || renamed.Name != "项目剧本新版" {
		t.Fatalf("renamed=%+v err=%v", renamed, err)
	}
	published, err := PublishOwnedSkillVersion("user-owner", false, created.Version.ID)
	if err != nil || published.Version.Status != model.SkillVersionPublished {
		t.Fatalf("published=%+v err=%v", published, err)
	}
	recommended, err := RecommendOwnedSkillVersion("user-owner", false, created.Skill.ID, created.Version.ID)
	if err != nil || recommended.Skill.RecommendedVersionID != created.Version.ID {
		t.Fatalf("recommended=%+v err=%v", recommended, err)
	}
	archived, err := ArchiveOwnedSkillVersion("user-owner", false, created.Version.ID)
	if err != nil || archived.Status != model.SkillVersionArchived {
		t.Fatalf("archived=%+v err=%v", archived, err)
	}
	definition, _, _ := repository.GetSkillDefinition(created.Skill.ID)
	if definition.RecommendedVersionID != "" {
		t.Fatalf("archived version remains recommended: %+v", definition)
	}
	if err := DeleteOwnedSkillDefinition("user-owner", false, created.Skill.ID); err == nil {
		t.Fatal("published definition was physically deleted")
	}
}

func TestProjectSkillCopyAndSafeDraftDeletion(t *testing.T) {
	setupInvocationServiceTest(t)
	if err := EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	source, _, _ := repository.GetSkillDefinition("skill-system-workflow-script")
	copied, err := CopySystemSkillToProject("user-owner", false, source.ID, "project-1", "项目剧本副本", "1.0.0")
	if err != nil || copied.Skill.OwnerType != model.SkillOwnerProject || copied.Skill.OwnerUserID != "user-owner" || copied.Skill.OwnerProjectID != "project-1" || copied.Version.Status != model.SkillVersionDraft {
		t.Fatalf("copied=%+v err=%v", copied, err)
	}
	reloadedSource, _, _ := repository.GetSkillDefinition(source.ID)
	if reloadedSource.RecommendedVersionID != source.RecommendedVersionID {
		t.Fatal("copy changed system source")
	}
	if err := DeleteOwnedSkillVersion("user-owner", false, copied.Version.ID); err != nil {
		t.Fatal(err)
	}
	if _, ok, _ := repository.GetSkillVersion(copied.Version.ID); ok {
		t.Fatal("unreferenced draft still exists")
	}
	if err := DeleteOwnedSkillDefinition("user-owner", false, copied.Skill.ID); err != nil {
		t.Fatal(err)
	}
	if _, ok, _ := repository.GetSkillDefinition(copied.Skill.ID); ok {
		t.Fatal("never-published definition still exists")
	}
}

func TestProjectSkillDraftCannotBeDeletedWhenWorkflowReferencesIt(t *testing.T) {
	setupInvocationServiceTest(t)
	pkg := validSkillTestPackage()
	pkg.Manifest.EstimatedCostClass = "none"
	created, err := CreateOwnedProjectSkill("user-owner", "project-1", "被引用 Skill", "", SkillDraftInput{Version: "1.0.0", Package: pkg})
	if err != nil {
		t.Fatal(err)
	}
	_, err = CreateProjectWorkflow("user-owner", WorkflowCreateInput{ProjectID: "project-1", Name: "引用草稿", Version: "1.0.0", Package: WorkflowPackage{Nodes: []WorkflowNodeSpec{{
		NodeKey: "script", Name: "剧本", ExecutorType: WorkflowExecutorSkill,
		SkillBinding: &WorkflowSkillBinding{Mode: WorkflowSkillBindingFixed, SkillID: created.Skill.ID, SkillVersionID: created.Version.ID}, OutputArtifactType: "production_script",
	}}}})
	if err != nil {
		t.Fatal(err)
	}
	if err := DeleteOwnedSkillVersion("user-owner", false, created.Version.ID); err == nil {
		t.Fatal("referenced draft was deleted")
	}
}

func TestRegularUserCannotMutateSystemSkill(t *testing.T) {
	setupInvocationServiceTest(t)
	if err := EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	if _, err := UpdateOwnedSkillDefinition("user-1", false, "skill-system-workflow-script", "改系统 Skill", "", nil); err == nil {
		t.Fatal("regular user mutated a system skill")
	}
	if _, err := UpdateOwnedSkillDefinition("admin-1", true, "skill-system-workflow-script", "剧本整理", "", nil); err != nil {
		t.Fatal(err)
	}
	disabled := false
	if _, err := UpdateOwnedSkillDefinition("admin-1", true, "skill-system-workflow-script", "", "", &disabled); err != nil {
		t.Fatal(err)
	}
	if _, err := ArchiveOwnedSkillVersion("admin-1", true, "skill-version-system-workflow-script-3.2.0"); err != nil {
		t.Fatal(err)
	}
	if err := EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	skill, _, _ := repository.GetSkillDefinition("skill-system-workflow-script")
	version, _, _ := repository.GetSkillVersion("skill-version-system-workflow-script-3.2.0")
	if skill.Enabled || version.Status != model.SkillVersionArchived {
		t.Fatalf("seed restore overwrote managed state: skill=%+v version=%+v", skill, version)
	}
}
