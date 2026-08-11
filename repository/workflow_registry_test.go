package repository

import (
	"errors"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestWorkflowRegistrySeparatesProjectsAndKeepsSystemVisible(t *testing.T) {
	setupRepositoryTestDB(t)
	mustCreateWorkflowAggregate(t, model.WorkflowOwnerSystem, "", "", "system")
	mustCreateWorkflowAggregate(t, model.WorkflowOwnerProject, "user-1", "project-1", "owned")
	mustCreateWorkflowAggregate(t, model.WorkflowOwnerProject, "user-2", "project-2", "hidden")

	items, err := ListVisibleWorkflowDefinitions("user-1", "project-1")
	if err != nil || len(items) != 2 {
		t.Fatalf("items=%#v err=%v", items, err)
	}
	for _, item := range items {
		if item.Name == "hidden" {
			t.Fatalf("foreign project Workflow leaked: %#v", item)
		}
	}
}

func TestWorkflowRegistryProtectsPublishedVersions(t *testing.T) {
	setupRepositoryTestDB(t)
	_, version := mustCreateWorkflowAggregate(t, model.WorkflowOwnerProject, "user-1", "project-1", "publish")
	version.PublishedAt = "2026-07-26T00:01:00Z"
	version.UpdatedAt = version.PublishedAt

	if err := PublishWorkflowVersion(version); err != nil {
		t.Fatal(err)
	}
	if err := PublishWorkflowVersion(version); !errors.Is(err, ErrWorkflowVersionTransitionConflict) {
		t.Fatalf("duplicate publish err=%v", err)
	}
	version.PackageJSON = `{"nodes":[{"nodeKey":"changed"}]}`
	if err := SaveWorkflowDraft(version); !errors.Is(err, ErrWorkflowVersionTransitionConflict) {
		t.Fatalf("published draft update err=%v", err)
	}
}

func TestWorkflowRegistryVersionTrackAndRecommendation(t *testing.T) {
	setupRepositoryTestDB(t)
	definition, first := mustCreateWorkflowAggregate(t, model.WorkflowOwnerProject, "user-1", "project-1", "track")
	second := first
	second.ID = "workflow-version-track-2"
	second.Version = "1.1.0"
	second.ContentHash = "sha256:track-2"
	second.CreatedAt = "2026-07-26T00:01:00Z"
	second.UpdatedAt = second.CreatedAt
	if err := CreateWorkflowVersion(second); err != nil {
		t.Fatal(err)
	}
	versions, err := ListWorkflowVersions(definition.ID)
	if err != nil || len(versions) != 2 || versions[0].ID != second.ID {
		t.Fatalf("versions=%#v err=%v", versions, err)
	}
	if err := SetRecommendedWorkflowVersion(definition.ID, second.ID, second.UpdatedAt); err != nil {
		t.Fatal(err)
	}
	saved, ok, err := GetWorkflowDefinition(definition.ID)
	if err != nil || !ok || saved.RecommendedVersionID != second.ID {
		t.Fatalf("saved=%#v ok=%v err=%v", saved, ok, err)
	}
}

func TestWorkflowDraftWritesRejectUnavailableSkillReferences(t *testing.T) {
	setupRepositoryTestDB(t)
	invalidPackage := workflowVersionReferenceJSON("missing-draft-skill-version")
	definition := model.WorkflowDefinition{ID: "invalid-workflow-create", Name: "Invalid", OwnerType: model.WorkflowOwnerProject}
	version := model.WorkflowVersion{ID: "invalid-workflow-create-version", WorkflowID: definition.ID, Version: "1.0.0", Status: model.WorkflowVersionDraft, PackageJSON: invalidPackage}
	if err := CreateWorkflowDefinitionAggregate(definition, version); !errors.Is(err, ErrSkillReferenceTargetUnavailable) {
		t.Fatalf("aggregate err=%v", err)
	}
	if _, ok, _ := GetWorkflowDefinition(definition.ID); ok {
		t.Fatal("invalid Workflow definition persisted")
	}

	_, existing := mustCreateWorkflowAggregate(t, model.WorkflowOwnerProject, "user-1", "project-1", "invalid-draft-save")
	originalPackage := existing.PackageJSON
	existing.PackageJSON = invalidPackage
	if err := SaveWorkflowDraft(existing); !errors.Is(err, ErrSkillReferenceTargetUnavailable) {
		t.Fatalf("save err=%v", err)
	}
	stored, ok, err := GetWorkflowVersion(existing.ID)
	if err != nil || !ok || stored.PackageJSON != originalPackage {
		t.Fatalf("stored=%+v ok=%v err=%v", stored, ok, err)
	}

	archived := createReferenceTestSkill(t, "workflow-draft-archived", model.SkillOwnerSystem, true, model.SkillVersionArchived)
	createdVersion := existing
	createdVersion.ID = "invalid-workflow-new-version"
	createdVersion.PackageJSON = workflowVersionReferenceJSON(archived.ID)
	if err := CreateWorkflowVersion(createdVersion); !errors.Is(err, ErrSkillReferenceTargetUnavailable) {
		t.Fatalf("version err=%v", err)
	}
	if _, ok, _ := GetWorkflowVersion(createdVersion.ID); ok {
		t.Fatal("invalid Workflow version persisted")
	}
}

func TestWorkflowRegistryExecutionCreateIsIdempotent(t *testing.T) {
	setupRepositoryTestDB(t)
	key := "workflow-execution-key"
	run := model.WorkflowExecution{
		ID: "workflow-execution-1", UserID: "user-1", ProjectID: "project-1", EpisodeID: "episode-1",
		WorkflowID: "workflow-1", WorkflowVersionID: "workflow-version-1", WorkflowContentHash: "sha256:workflow",
		Status: model.WorkflowExecutionPreflight, Revision: 1, IdempotencyKey: &key, RequestHash: "sha256:request",
		CreatedAt: "2026-07-26T00:00:00Z", UpdatedAt: "2026-07-26T00:00:00Z",
	}
	revision := model.WorkflowExecutionRevision{
		ID: "workflow-execution-revision-1", UserID: run.UserID, WorkflowExecutionID: run.ID, Revision: 1,
		WorkflowVersionID: run.WorkflowVersionID, WorkflowContentHash: run.WorkflowContentHash,
		RoutePreviewJSON: `{}`, InputArtifactRefsJSON: `[]`, ManualSelectionsJSON: `{}`,
		ConfirmationRequirementsJSON: `[]`, CreatedAt: run.CreatedAt,
	}
	nodes := []model.WorkflowNodeExecution{{
		ID: "workflow-node-execution-1", UserID: run.UserID, WorkflowExecutionID: run.ID, Revision: 1,
		Ordinal: 0, NodeKey: "extract", ExecutorType: "skill", Status: model.WorkflowNodeExecutionReady,
		OutputArtifactRefsJSON: `[]`, CreatedAt: run.CreatedAt, UpdatedAt: run.UpdatedAt,
	}}
	created, ok, err := CreateWorkflowExecutionAggregateIdempotently(run, revision, nodes)
	if err != nil || !ok || created.ID != run.ID {
		t.Fatalf("created=%#v ok=%v err=%v", created, ok, err)
	}
	replayed, ok, err := CreateWorkflowExecutionAggregateIdempotently(run, revision, nodes)
	if err != nil || ok || replayed.ID != run.ID {
		t.Fatalf("replayed=%#v ok=%v err=%v", replayed, ok, err)
	}
	run.RequestHash = "sha256:changed"
	if _, _, err := CreateWorkflowExecutionAggregateIdempotently(run, revision, nodes); !errors.Is(err, ErrWorkflowExecutionIdempotencyConflict) {
		t.Fatalf("changed replay err=%v", err)
	}
}

func mustCreateWorkflowAggregate(t *testing.T, ownerType model.WorkflowOwnerType, userID, projectID, name string) (model.WorkflowDefinition, model.WorkflowVersion) {
	t.Helper()
	stamp := "2026-07-26T00:00:00Z"
	definition := model.WorkflowDefinition{
		ID: "workflow-" + name, Name: name, OwnerType: ownerType, OwnerUserID: userID,
		OwnerProjectID: projectID, Enabled: true, CreatedAt: stamp, UpdatedAt: stamp,
	}
	version := model.WorkflowVersion{
		ID: "workflow-version-" + name, WorkflowID: definition.ID, Version: "1.0.0",
		Status: model.WorkflowVersionDraft, PackageJSON: `{"nodes":[]}`, ContentHash: "sha256:" + name,
		CreatedBy: userID, CreatedAt: stamp, UpdatedAt: stamp,
	}
	if err := CreateWorkflowDefinitionAggregate(definition, version); err != nil {
		t.Fatal(err)
	}
	return definition, version
}
