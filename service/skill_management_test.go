package service

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestImportOwnedSkillFolderCreatesStagePackageAndSourceSnapshot(t *testing.T) {
	setupInvocationServiceTest(t)
	if err := EnsureCoreArtifactSchemas(); err != nil {
		t.Fatal(err)
	}
	snapshot, err := ParseSkillFolder("script-folder", []SkillFolderFile{
		{Path: "SKILL.md", Data: []byte("---\nname: Seedance 剧本整理\ndescription: 保留剧情\nversion: 1.4.0\n---\n# Rules")},
		{Path: "rules/preserve.md", Data: []byte("保留全部台词")},
	})
	if err != nil {
		t.Fatal(err)
	}
	created, err := ImportManagedSkillFolder("admin-1", true, SkillFolderImportInput{OwnerType: model.SkillOwnerSystem, StageKey: WorkflowSkillStageScript, Snapshot: snapshot})
	if err != nil {
		t.Fatal(err)
	}
	if created.Skill.Name != "Seedance 剧本整理" || created.Skill.Summary != "保留剧情" || created.Skill.StageKey != WorkflowSkillStageScript || created.Version.Version != "1.4.0" {
		t.Fatalf("created=%+v", created)
	}
	if created.Version.SourceKind != "folder_import" || created.Version.SourceHash != snapshot.SourceHash || len(created.Version.SourceArchiveBlob) == 0 || created.Package.Files["rules/preserve.md"] == "" {
		t.Fatalf("version=%+v package=%+v", created.Version, created.Package)
	}
	if created.Package.Manifest.Capabilities[0] != "workflow.stage.script" {
		t.Fatalf("manifest=%+v", created.Package.Manifest)
	}
	var importMetadata map[string]any
	if json.Unmarshal([]byte(created.Version.ImportMetadataJSON), &importMetadata) != nil {
		t.Fatalf("import metadata=%s", created.Version.ImportMetadataJSON)
	}
	fixedAdapter, _ := importMetadata["fixedAdapter"].(map[string]any)
	if importMetadata["folderName"] != "script-folder" || importMetadata["metadata"] == nil || importMetadata["stageKey"] != WorkflowSkillStageScript || importMetadata["stageTemplateVersion"] != "1.0.0" || fixedAdapter["adapterId"] == "" || fixedAdapter["adapterVersion"] == "" || fixedAdapter["transformKind"] == "" || fixedAdapter["contentHash"] == "" {
		t.Fatalf("import metadata=%s", created.Version.ImportMetadataJSON)
	}
	files, err := GetManagedSkillSourceFiles("admin-1", created.Version.ID, true)
	if err != nil || len(files) != 2 {
		t.Fatalf("files=%+v err=%v", files, err)
	}
	content, err := GetManagedSkillSourceText("admin-1", created.Version.ID, "rules/preserve.md", true)
	if err != nil || content != "保留全部台词" {
		t.Fatalf("content=%q err=%v", content, err)
	}
}

func TestImportOwnedSkillFolderVersionInheritsStageAndRejectsDuplicateContent(t *testing.T) {
	setupInvocationServiceTest(t)
	if err := EnsureCoreArtifactSchemas(); err != nil {
		t.Fatal(err)
	}
	first, _ := ParseSkillFolder("script", []SkillFolderFile{{Path: "SKILL.md", Data: []byte("# V1")}})
	created, err := ImportManagedSkillFolder("admin-1", true, SkillFolderImportInput{OwnerType: model.SkillOwnerSystem, StageKey: WorkflowSkillStageScript, Version: "2.0.0", Snapshot: first})
	if err != nil {
		t.Fatal(err)
	}
	second, _ := ParseSkillFolder("script", []SkillFolderFile{{Path: "SKILL.md", Data: []byte("# V2")}})
	version, err := ImportOwnedSkillFolderVersion("admin-1", true, created.Skill.ID, "", second)
	if err != nil || version.Version != "2.0.1" {
		t.Fatalf("version=%+v err=%v", version, err)
	}
	pkg, err := DecodeSkillPackage(version)
	if err != nil || !containsSkillToken(pkg.Manifest.Capabilities, "workflow.stage.script") {
		t.Fatalf("pkg=%+v err=%v", pkg, err)
	}
	if _, err := ImportOwnedSkillFolderVersion("admin-1", true, created.Skill.ID, "2.0.2", second); err == nil || !strings.Contains(err.Error(), "相同内容") {
		t.Fatalf("duplicate err=%v", err)
	}
}

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

func TestVisibleSkillListDoesNotExposeManagementRelations(t *testing.T) {
	setupInvocationServiceTest(t)
	if err := EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	versionID := "skill-version-system-workflow-script-3.2.0"
	stamp := now()
	if err := repository.CreateSkillEvaluation(model.SkillEvaluation{ID: "evaluation-secret", SkillVersionID: versionID, ProjectID: "project-secret", ResultJSON: `{"secret":true}`, CreatedAt: stamp}); err != nil {
		t.Fatal(err)
	}
	if err := repository.CreateSkillAuditLog(model.SkillAuditLog{ID: "audit-secret", SkillVersionID: versionID, Action: "secret", CreatedAt: stamp}); err != nil {
		t.Fatal(err)
	}
	if err := repository.SaveWorkflowStageSkillBinding(model.WorkflowStageSkillBinding{ID: "binding-secret", StageKey: "secret", Scope: model.WorkflowStageSkillScopeProject, ScopeID: "project-secret", SkillVersionID: versionID}); err != nil {
		t.Fatal(err)
	}

	items, err := ListVisibleSkillItems("user-1", "project-1")
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, item := range items {
		if item.Skill.ID == "skill-system-workflow-script" {
			found = true
			if len(item.Evaluations) != 0 || len(item.Audits) != 0 || len(item.Bindings) != 0 {
				t.Fatalf("management relations leaked to regular user: %+v", item)
			}
		}
	}
	if !found {
		t.Fatal("visible system skill was not returned")
	}
}
