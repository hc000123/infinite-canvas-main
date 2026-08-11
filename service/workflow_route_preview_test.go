package service

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestWorkflowExecutionKeepsManualSkillVersionAfterRecommendationChanges(t *testing.T) {
	setupInvocationServiceTest(t)
	setupSystemProductionWorkflowModels(t)
	stamp := now()
	if _, err := repository.SaveUser(model.User{ID: "user-1", Username: "manual-freeze", Credits: 100, Status: model.UserStatusActive, CreatedAt: stamp, UpdatedAt: stamp}); err != nil {
		t.Fatal(err)
	}
	if err := EnsureWorkflowSeeds(); err != nil {
		t.Fatal(err)
	}
	source := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"公交站"}`)
	preflight, err := PreflightWorkflowExecution("user-1", WorkflowExecutionPreflightInput{
		WorkflowVersionID: systemProductionWorkflowVersionID, ProjectID: "project-1", EpisodeID: "episode-1",
		InputArtifactRefs: []ArtifactRefInput{{BindingName: "source_text", ArtifactID: source.Artifact.ID, ContentHash: source.Artifact.ContentHash}},
		ManualSelections:  map[string]string{"script": "skill-version-system-workflow-script-3.2.0"}, IdempotencyKey: "manual-script-freeze",
	})
	if err != nil || !preflight.Preview.Executable || preflight.Preview.Nodes[0].SkillVersionID != "skill-version-system-workflow-script-3.2.0" {
		t.Fatalf("preflight=%+v err=%v", preflight, err)
	}
	skill, ok, err := repository.GetSkillDefinition("skill-system-workflow-script")
	if err != nil || !ok {
		t.Fatalf("skill=%+v ok=%v err=%v", skill, ok, err)
	}
	skill.RecommendedVersionID = "skill-version-system-workflow-script-3.1.0"
	if err := repository.SaveSkillDefinition(skill); err != nil {
		t.Fatal(err)
	}
	confirmed, err := ConfirmWorkflowExecution("user-1", preflight.Run.ID, WorkflowExecutionConfirmationInput{Revision: 1, Fingerprint: preflight.Run.ConfirmationFingerprint, RequirementCodes: preflight.ConfirmationRequirements})
	if err != nil {
		t.Fatal(err)
	}
	invocation, err := GetInvocationDetail("user-1", confirmed.Nodes[0].InvocationID)
	if err != nil || len(invocation.Revisions) != 1 || invocation.Revisions[0].SkillVersionID != "skill-version-system-workflow-script-3.2.0" || invocation.Revisions[0].SkillContentHash != preflight.Preview.Nodes[0].SkillContentHash {
		t.Fatalf("invocation=%+v err=%v", invocation, err)
	}
}

func TestWorkflowPreviewUsesTheExactRegistryOptionSnapshot(t *testing.T) {
	setupInvocationServiceTest(t)
	skill, version := seedInvocationSkill(t, invocationSkillSeed{
		ID: "workflow-cross-entry-skill", VersionID: "workflow-cross-entry-skill-v1", Version: "1.0.0", Recommended: true,
		Mutate: func(pkg *SkillPackage) { pkg.Manifest.Capabilities = []string{"workflow.stage.cross_entry"} },
	})
	options, err := ListSkillOptions("user-1", "project-1", SkillOptionFilter{Capability: "workflow.stage.cross_entry"})
	if err != nil || len(options) != 1 {
		t.Fatalf("options=%+v err=%v", options, err)
	}
	root := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"公交站"}`)
	created, err := CreateProjectWorkflow("user-1", WorkflowCreateInput{ProjectID: "project-1", Name: "跨入口一致性", Version: "1.0.0", Package: WorkflowPackage{
		InputArtifactTypes: []string{"source_text"}, Nodes: []WorkflowNodeSpec{{
			NodeKey: "script", Name: "剧本", ExecutorType: WorkflowExecutorSkill,
			SkillBinding:       &WorkflowSkillBinding{Mode: WorkflowSkillBindingManualBeforeRun, Capability: "workflow.stage.cross_entry", CandidateSkillIDs: []string{skill.ID}},
			InputBindings:      []WorkflowNodeInputBinding{{BindingName: "source", ArtifactType: "source_text", Source: WorkflowInputSource, WorkflowInputName: "source", Required: true}},
			OutputArtifactType: "production_script",
		}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	published, err := PublishWorkflowVersion("user-1", created.Version.ID)
	if err != nil {
		t.Fatal(err)
	}
	preview, err := PreviewWorkflowVersion("user-1", published.Version.ID, WorkflowPreviewInput{
		ProjectID: "project-1", EpisodeID: "episode-1",
		InputArtifactRefs: []ArtifactRefInput{{BindingName: "source", ArtifactID: root.Artifact.ID, ContentHash: root.Artifact.ContentHash}},
		ManualSelections:  map[string]string{"script": version.ID},
	})
	if err != nil || !preview.Executable || len(preview.Nodes) != 1 {
		t.Fatalf("preview=%+v err=%v", preview, err)
	}
	option, node := options[0], preview.Nodes[0]
	resolved, err := ResolveExactSkillVersion("user-1", "project-1", node.SkillVersionID)
	if err != nil || node.SkillVersionID != option.SkillVersionID || node.SkillContentHash != option.ContentHash || resolved.Version.ContentHash != option.ContentHash {
		t.Fatalf("workflow registry drift option=%+v node=%+v resolved=%+v err=%v", option, node, resolved, err)
	}
}

func TestPreviewWorkflowRouteRequiresManualSelection(t *testing.T) {
	fixture := workflowPreviewFixture(t)
	preview, err := PreviewWorkflowVersion(fixture.userID, fixture.versionID, WorkflowPreviewInput{
		ProjectID: fixture.projectID, EpisodeID: fixture.episodeID, InputArtifactRefs: fixture.inputRefs,
	})
	if err != nil {
		t.Fatal(err)
	}
	if preview.Executable || preview.Nodes[2].BlockCode != "manual_selection_required" || len(preview.Nodes[2].RouteTrace.Candidates) == 0 {
		t.Fatalf("preview=%#v", preview)
	}
}

func TestPreviewWorkflowRouteResolvesFixedTagAndManualBindings(t *testing.T) {
	fixture := workflowPreviewFixture(t)
	preview, err := PreviewWorkflowVersion(fixture.userID, fixture.versionID, WorkflowPreviewInput{
		ProjectID: fixture.projectID, EpisodeID: fixture.episodeID, InputArtifactRefs: fixture.inputRefs,
		ManualSelections: map[string]string{"manual": fixture.skillVersionID},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !preview.Executable || preview.ContentHash == "" || len(preview.Nodes) != 3 {
		t.Fatalf("preview=%#v", preview)
	}
	for _, node := range preview.Nodes {
		if node.SkillVersionID != fixture.skillVersionID || node.RouteTrace.FinalSkillVersionID != fixture.skillVersionID || node.BlockCode != "" {
			t.Fatalf("node=%#v", node)
		}
	}
}

func TestPreviewWorkflowRouteRejectsManualSelectionOutsideScope(t *testing.T) {
	fixture := workflowPreviewFixture(t)
	_, otherVersion := seedInvocationSkill(t, invocationSkillSeed{ID: "workflow-preview-other", VersionID: "workflow-preview-other-v1", Version: "1.0.0", Recommended: true})
	preview, err := PreviewWorkflowVersion(fixture.userID, fixture.versionID, WorkflowPreviewInput{
		ProjectID: fixture.projectID, EpisodeID: fixture.episodeID, InputArtifactRefs: fixture.inputRefs,
		ManualSelections: map[string]string{"manual": otherVersion.ID},
	})
	if err != nil {
		t.Fatal(err)
	}
	if preview.Executable || preview.Nodes[2].BlockCode != "manual_selection_incompatible" {
		t.Fatalf("preview=%#v", preview)
	}
}

func TestPreviewWorkflowRoutePropagatesDownstreamOutputContract(t *testing.T) {
	setupInvocationServiceTest(t)
	firstSkill, firstVersion := seedInvocationSkill(t, invocationSkillSeed{ID: "workflow-preview-first", VersionID: "workflow-preview-first-v1", Version: "1.0.0", Recommended: true})
	secondSkill, secondVersion := seedInvocationSkill(t, invocationSkillSeed{ID: "workflow-preview-second", VersionID: "workflow-preview-second-v1", Version: "1.0.0", Recommended: true, Mutate: func(pkg *SkillPackage) {
		pkg.Manifest.Capabilities = []string{"asset.extract"}
		pkg.Manifest.InputArtifactTypes = []string{"production_script"}
		pkg.Manifest.OutputArtifactTypes = []string{"asset_catalog"}
		pkg.Manifest.SchemaCompatibility = map[string]string{"production_script": ">=1.0 <2.0"}
		pkg.InputContract.ArtifactInputs = []ArtifactInputSpec{{BindingName: "script", ArtifactType: "production_script", Required: true, RequiresApproval: true, Min: 1, Max: 1, SchemaConstraint: ">=1.0 <2.0"}}
		pkg.OutputContract.ArtifactOutputs = []ArtifactOutputSpec{{BindingName: "assets", ArtifactType: "asset_catalog", Min: 1, Max: 1, SchemaVersion: "1.0.0"}}
	}})
	root := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"公交站"}`)
	pkg := WorkflowPackage{InputArtifactTypes: []string{"source_text"}, Nodes: []WorkflowNodeSpec{
		{NodeKey: "script", Name: "剧本", ExecutorType: WorkflowExecutorSkill, SkillBinding: &WorkflowSkillBinding{Mode: WorkflowSkillBindingFixed, SkillID: firstSkill.ID}, InputBindings: []WorkflowNodeInputBinding{{BindingName: "source", ArtifactType: "source_text", Source: WorkflowInputSource, WorkflowInputName: "source"}}, OutputArtifactType: "production_script"},
		{NodeKey: "assets", Name: "资产", ExecutorType: WorkflowExecutorSkill, SkillBinding: &WorkflowSkillBinding{Mode: WorkflowSkillBindingFixed, SkillID: secondSkill.ID}, InputBindings: []WorkflowNodeInputBinding{{BindingName: "script", ArtifactType: "production_script", Source: WorkflowNodeSource, FromNodeKey: "script"}}, DependsOn: []string{"script"}, OutputArtifactType: "asset_catalog"},
	}}
	created, err := CreateProjectWorkflow("user-1", WorkflowCreateInput{ProjectID: "project-1", Name: "下游契约", Version: "1.0.0", Package: pkg})
	if err != nil {
		t.Fatal(err)
	}
	published, err := PublishWorkflowVersion("user-1", created.Version.ID)
	if err != nil {
		t.Fatal(err)
	}
	preview, err := PreviewWorkflowVersion("user-1", published.Version.ID, WorkflowPreviewInput{ProjectID: "project-1", EpisodeID: "episode-1", InputArtifactRefs: []ArtifactRefInput{{BindingName: "source", ArtifactID: root.Artifact.ID, ContentHash: root.Artifact.ContentHash}}})
	if err != nil || !preview.Executable || preview.Nodes[0].SkillVersionID != firstVersion.ID || preview.Nodes[1].SkillVersionID != secondVersion.ID {
		t.Fatalf("preview=%#v err=%v", preview, err)
	}
}

type workflowPreviewTestFixture struct {
	userID, projectID, episodeID, versionID, skillVersionID string
	inputRefs                                               []ArtifactRefInput
}

func workflowPreviewFixture(t *testing.T) workflowPreviewTestFixture {
	t.Helper()
	setupInvocationServiceTest(t)
	skill, skillVersion := seedInvocationSkill(t, invocationSkillSeed{ID: "workflow-preview-skill", VersionID: "workflow-preview-v1", Version: "1.0.0", Recommended: true, ProjectTags: []string{"vertical"}})
	root := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"公交站"}`)
	rootBinding := []WorkflowNodeInputBinding{{BindingName: "source", ArtifactType: "source_text", Source: WorkflowInputSource, WorkflowInputName: "source", Required: true}}
	pkg := WorkflowPackage{InputArtifactTypes: []string{"source_text"}, Nodes: []WorkflowNodeSpec{
		{NodeKey: "fixed", Name: "固定", ExecutorType: WorkflowExecutorSkill, SkillBinding: &WorkflowSkillBinding{Mode: WorkflowSkillBindingFixed, SkillID: skill.ID}, InputBindings: rootBinding, OutputArtifactType: "production_script"},
		{NodeKey: "tag", Name: "标签", ExecutorType: WorkflowExecutorSkill, SkillBinding: &WorkflowSkillBinding{Mode: WorkflowSkillBindingTagRoute, Capability: "script.create", ProjectTags: []string{"vertical"}, CandidateSkillIDs: []string{skill.ID}}, InputBindings: rootBinding, OutputArtifactType: "production_script"},
		{NodeKey: "manual", Name: "手选", ExecutorType: WorkflowExecutorSkill, SkillBinding: &WorkflowSkillBinding{Mode: WorkflowSkillBindingManualBeforeRun, Capability: "script.create", CandidateSkillIDs: []string{skill.ID}}, InputBindings: rootBinding, OutputArtifactType: "production_script"},
	}}
	created, err := CreateProjectWorkflow("user-1", WorkflowCreateInput{ProjectID: "project-1", Name: "预览流程", Version: "1.0.0", Package: pkg})
	if err != nil {
		t.Fatal(err)
	}
	published, err := PublishWorkflowVersion("user-1", created.Version.ID)
	if err != nil {
		t.Fatal(err)
	}
	return workflowPreviewTestFixture{userID: "user-1", projectID: "project-1", episodeID: "episode-1", versionID: published.Version.ID, skillVersionID: skillVersion.ID, inputRefs: []ArtifactRefInput{{BindingName: "source", ArtifactID: root.Artifact.ID, ContentHash: root.Artifact.ContentHash}}}
}
