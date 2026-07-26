package service

import (
	"testing"
)

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
