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
	created, err := ImportManagedSkillFolder("admin-1", true, SkillFolderImportInput{StageKey: WorkflowSkillStageScript, Snapshot: snapshot})
	if err != nil {
		t.Fatal(err)
	}
	if created.Skill.OwnerType != model.SkillOwnerSystem || created.Skill.OwnerUserID != "" || created.Skill.OwnerProjectID != "" {
		t.Fatalf("owner=%+v", created.Skill)
	}
	stored, ok, err := repository.GetSkillDefinition(created.Skill.ID)
	if err != nil || !ok || stored.OwnerType != model.SkillOwnerSystem || stored.OwnerUserID != "" || stored.OwnerProjectID != "" {
		t.Fatalf("stored=%+v ok=%v err=%v", stored, ok, err)
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

func TestImportManagedSkillFolderRequiresAdmin(t *testing.T) {
	setupInvocationServiceTest(t)
	snapshot, _ := ParseSkillFolder("script", []SkillFolderFile{{Path: "SKILL.md", Data: []byte("# Rules")}})
	_, err := ImportManagedSkillFolder("user-1", false, SkillFolderImportInput{StageKey: WorkflowSkillStageScript, Snapshot: snapshot})
	if err == nil || !strings.Contains(err.Error(), "只有管理员可以导入 System Skill") {
		t.Fatalf("err=%v", err)
	}
}

func TestImportOwnedSkillFolderVersionInheritsStageAndRejectsDuplicateContent(t *testing.T) {
	setupInvocationServiceTest(t)
	if err := EnsureCoreArtifactSchemas(); err != nil {
		t.Fatal(err)
	}
	first, _ := ParseSkillFolder("script", []SkillFolderFile{{Path: "SKILL.md", Data: []byte("# V1")}})
	created, err := ImportManagedSkillFolder("admin-1", true, SkillFolderImportInput{StageKey: WorkflowSkillStageScript, Version: "2.0.0", Snapshot: first})
	if err != nil {
		t.Fatal(err)
	}
	second, _ := ParseSkillFolder("script", []SkillFolderFile{{Path: "SKILL.md", Data: []byte("# V2")}})
	version, err := ImportOwnedSkillFolderVersion("admin-1", true, created.Skill.ID, "", false, second)
	if err != nil || version.Version != "2.0.1" {
		t.Fatalf("version=%+v err=%v", version, err)
	}
	pkg, err := DecodeSkillPackage(version)
	if err != nil || !containsSkillToken(pkg.Manifest.Capabilities, "workflow.stage.script") {
		t.Fatalf("pkg=%+v err=%v", pkg, err)
	}
	if _, err := ImportOwnedSkillFolderVersion("admin-1", true, created.Skill.ID, "2.0.2", true, second); err == nil || !strings.Contains(err.Error(), "相同内容") {
		t.Fatalf("duplicate err=%v", err)
	}
}

func TestImportOwnedSkillFolderAllowsIndependentDefinitionsWithTheSameName(t *testing.T) {
	setupInvocationServiceTest(t)
	if err := EnsureCoreArtifactSchemas(); err != nil {
		t.Fatal(err)
	}
	for index, content := range []string{"# First", "# Second"} {
		snapshot, err := ParseSkillFolder("script", []SkillFolderFile{{Path: "SKILL.md", Data: []byte(content)}})
		if err != nil {
			t.Fatal(err)
		}
		created, err := ImportManagedSkillFolder("admin-1", true, SkillFolderImportInput{
			StageKey: WorkflowSkillStageScript, Name: "同名剧本 Skill", Snapshot: snapshot,
		})
		if err != nil {
			t.Fatalf("import %d err=%v", index, err)
		}
		if index == 0 {
			continue
		}
		definitions, err := repository.ListSkillDefinitions()
		if err != nil {
			t.Fatal(err)
		}
		count := 0
		for _, definition := range definitions {
			if definition.Name == "同名剧本 Skill" {
				count++
			}
		}
		if count != 2 || created.Skill.Name != "同名剧本 Skill" {
			t.Fatalf("count=%d created=%+v", count, created.Skill)
		}
	}
}

func TestSkillFolderImportDistinguishesMissingAndExplicitEmptyMetadata(t *testing.T) {
	setupInvocationServiceTest(t)
	if err := EnsureCoreArtifactSchemas(); err != nil {
		t.Fatal(err)
	}
	snapshot, _ := ParseSkillFolder("script", []SkillFolderFile{{Path: "SKILL.md", Data: []byte("---\nname: Frontmatter\ndescription: Frontmatter summary\nversion: 3.0.0\n---\n# V1")}})
	fallback, err := ImportManagedSkillFolder("admin-1", true, SkillFolderImportInput{StageKey: WorkflowSkillStageScript, Snapshot: snapshot})
	if err != nil || fallback.Skill.Summary != "Frontmatter summary" || fallback.Version.Version != "3.0.0" {
		t.Fatalf("fallback=%+v err=%v", fallback, err)
	}
	explicit, err := ImportManagedSkillFolder("admin-1", true, SkillFolderImportInput{StageKey: WorkflowSkillStageScript, Name: "Confirmed", Summary: "", SummaryProvided: true, Version: "", VersionProvided: true, Snapshot: snapshot})
	if err != nil || explicit.Skill.Summary != "" || explicit.Version.Version != "1.0.0" {
		t.Fatalf("explicit=%+v err=%v", explicit, err)
	}
	metadataNext, _ := ParseSkillFolder("script", []SkillFolderFile{{Path: "SKILL.md", Data: []byte("---\nversion: 4.0.0\n---\n# metadata V2")}})
	metadataVersion, err := ImportOwnedSkillFolderVersion("admin-1", true, fallback.Skill.ID, "", false, metadataNext)
	if err != nil || metadataVersion.Version != "4.0.0" {
		t.Fatalf("metadata version=%+v err=%v", metadataVersion, err)
	}
	next, _ := ParseSkillFolder("script", []SkillFolderFile{{Path: "SKILL.md", Data: []byte("---\nversion: 9.0.0\n---\n# V2")}})
	version, err := ImportOwnedSkillFolderVersion("admin-1", true, explicit.Skill.ID, "", true, next)
	if err != nil || version.Version != "1.0.1" {
		t.Fatalf("version=%+v err=%v", version, err)
	}
}

func TestUpdateSkillDraftRejectsFolderImportWithoutChangingSourceSnapshot(t *testing.T) {
	setupInvocationServiceTest(t)
	snapshot, _ := ParseSkillFolder("script", []SkillFolderFile{{Path: "SKILL.md", Data: []byte("# Frozen")}})
	created, err := ImportManagedSkillFolder("admin-1", true, SkillFolderImportInput{StageKey: WorkflowSkillStageScript, Snapshot: snapshot})
	if err != nil {
		t.Fatal(err)
	}
	_, err = UpdateSkillDraft(created.Version.ID, SkillDraftInput{Version: created.Version.Version, Package: created.Package})
	if err == nil || !strings.Contains(err.Error(), "文件夹导入") {
		t.Fatalf("update err=%v", err)
	}
	reloaded, ok, err := repository.GetSkillVersion(created.Version.ID)
	if err != nil || !ok {
		t.Fatalf("reload ok=%v err=%v", ok, err)
	}
	if reloaded.SourceKind != created.Version.SourceKind || reloaded.SourceHash != created.Version.SourceHash || string(reloaded.SourceArchiveBlob) != string(created.Version.SourceArchiveBlob) || reloaded.SourceFileIndexJSON != created.Version.SourceFileIndexJSON || reloaded.ImportMetadataJSON != created.Version.ImportMetadataJSON {
		t.Fatalf("source snapshot changed: before=%+v after=%+v", created.Version, reloaded)
	}
}

func TestSkillManagementRequiresAdminAndCreatesSystemOwner(t *testing.T) {
	setupInvocationServiceTest(t)
	pkg := validSkillTestPackage()
	pkg.Manifest.EstimatedCostClass = "none"
	if _, err := CreateManagedSystemSkill("user-1", false, "全局 Skill", "", SkillDraftInput{Version: "1.0.0", Package: pkg}); err == nil || !strings.Contains(err.Error(), "只有管理员可以创建 Skill") {
		t.Fatalf("non-admin create err=%v", err)
	}
	created, err := CreateManagedSystemSkill("admin-1", true, "全局 Skill", "系统共享", SkillDraftInput{Version: "1.0.0", Package: pkg})
	if err != nil {
		t.Fatal(err)
	}
	if created.Skill.OwnerType != model.SkillOwnerSystem || created.Skill.OwnerUserID != "" || created.Skill.OwnerProjectID != "" {
		t.Fatalf("created owner=%+v", created.Skill)
	}
	stored, ok, err := repository.GetSkillDefinition(created.Skill.ID)
	if err != nil || !ok || stored.OwnerType != model.SkillOwnerSystem || stored.OwnerUserID != "" || stored.OwnerProjectID != "" {
		t.Fatalf("stored=%+v ok=%v err=%v", stored, ok, err)
	}
	if _, err := UpdateOwnedSkillDefinition("user-1", false, created.Skill.ID, "越权改名", "", nil); err == nil {
		t.Fatal("non-admin mutated a system Skill")
	}
}

func TestSkillManagementRejectsLegacyProjectOwnerAndNonAdminPackageRead(t *testing.T) {
	setupInvocationServiceTest(t)
	pkg, err := ValidateInvocableSkillPackage(validSkillTestPackage())
	if err != nil {
		t.Fatal(err)
	}
	stamp := now()
	skill := model.SkillDefinition{ID: "legacy-project-skill", Name: "Legacy", OwnerType: model.SkillOwnerType("project"), OwnerUserID: "user-1", OwnerProjectID: "project-1", Enabled: true, CreatedAt: stamp, UpdatedAt: stamp}
	version := skillVersionFromPackage("legacy-project-version", skill.ID, "1.0.0", "user-1", stamp, pkg)
	if err := repository.CreateSkillAggregate(skill, version); err != nil {
		t.Fatal(err)
	}
	if _, err := UpdateOwnedSkillDefinition("admin-1", true, skill.ID, "不应更新", "", nil); err == nil {
		t.Fatal("admin mutated a non-system Skill")
	}
	if _, _, err := GetManagedSkillVersionPackage("user-1", version.ID, false); err == nil {
		t.Fatal("non-admin read a management package")
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
