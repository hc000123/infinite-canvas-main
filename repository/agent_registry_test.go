package repository

import (
	"errors"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestListVisibleAgentDefinitionsSeparatesProjects(t *testing.T) {
	setupRepositoryTestDB(t)
	mustCreateAgentAggregate(t, model.AgentOwnerSystem, "", "", "system")
	mustCreateAgentAggregate(t, model.AgentOwnerProject, "user-1", "project-1", "owned")
	mustCreateAgentAggregate(t, model.AgentOwnerProject, "user-2", "project-2", "hidden")

	items, err := ListVisibleAgentDefinitions("user-1", "project-1")
	if err != nil || len(items) != 2 {
		t.Fatalf("items=%#v err=%v", items, err)
	}
	for _, item := range items {
		if item.Name == "hidden" {
			t.Fatalf("foreign project Agent leaked: %#v", item)
		}
	}
}

func TestPublishAgentVersionUsesCompareAndSwap(t *testing.T) {
	setupRepositoryTestDB(t)
	_, version := mustCreateAgentAggregate(t, model.AgentOwnerProject, "user-1", "project-1", "director")
	version.Status = model.AgentVersionPublished
	version.PublishedAt = "2026-07-26T00:00:00Z"
	version.UpdatedAt = version.PublishedAt

	if err := PublishAgentVersion(version); err != nil {
		t.Fatal(err)
	}
	if err := PublishAgentVersion(version); !errors.Is(err, ErrAgentVersionTransitionConflict) {
		t.Fatalf("duplicate publish err=%v", err)
	}
}

func TestSaveAgentDraftRejectsPublishedVersion(t *testing.T) {
	setupRepositoryTestDB(t)
	_, version := mustCreateAgentAggregate(t, model.AgentOwnerProject, "user-1", "project-1", "writer")
	version.Status = model.AgentVersionPublished
	version.PublishedAt = "2026-07-26T00:00:00Z"
	version.UpdatedAt = version.PublishedAt
	if err := PublishAgentVersion(version); err != nil {
		t.Fatal(err)
	}
	version.RolePrompt = "must not persist"
	if err := SaveAgentDraft(version); !errors.Is(err, ErrAgentVersionTransitionConflict) {
		t.Fatalf("published draft update err=%v", err)
	}
	saved, ok, err := GetAgentVersion(version.ID)
	if err != nil || !ok || saved.RolePrompt == version.RolePrompt {
		t.Fatalf("saved=%#v ok=%v err=%v", saved, ok, err)
	}
}

func TestAgentVersionTrackAndRecommendation(t *testing.T) {
	setupRepositoryTestDB(t)
	agent, first := mustCreateAgentAggregate(t, model.AgentOwnerProject, "user-1", "project-1", "track")
	second := first
	second.ID = "agent-version-track-2"
	second.Version = "1.1.0"
	second.ContentHash = "hash-track-2"
	second.CreatedAt = "2026-07-26T00:01:00Z"
	second.UpdatedAt = second.CreatedAt
	if err := CreateAgentVersion(second); err != nil {
		t.Fatal(err)
	}
	versions, err := ListAgentVersions(agent.ID)
	if err != nil || len(versions) != 2 || versions[0].ID != second.ID {
		t.Fatalf("versions=%#v err=%v", versions, err)
	}
	if err := SetRecommendedAgentVersion(agent.ID, second.ID, second.UpdatedAt); err != nil {
		t.Fatal(err)
	}
	saved, ok, err := GetAgentDefinition(agent.ID)
	if err != nil || !ok || saved.RecommendedVersionID != second.ID {
		t.Fatalf("saved=%#v ok=%v err=%v", saved, ok, err)
	}
}

func TestAgentDraftWritesRejectUnavailableSkillReferences(t *testing.T) {
	setupRepositoryTestDB(t)
	project := createReferenceTestSkill(t, "agent-draft-project", model.SkillOwnerType("project"), true, model.SkillVersionPublished)
	agent := model.AgentDefinition{ID: "invalid-agent-create", Name: "Invalid", OwnerType: model.AgentOwnerProject}
	version := model.AgentVersion{ID: "invalid-agent-create-version", AgentID: agent.ID, Version: "1.0.0", Status: model.AgentVersionDraft, SkillAccessPolicyJSON: `{"allowedSkillIds":["` + project.SkillID + `"]}`}
	if err := CreateAgentAggregate(agent, version); !errors.Is(err, ErrSkillReferenceTargetUnavailable) {
		t.Fatalf("aggregate err=%v", err)
	}
	if _, ok, _ := GetAgentDefinition(agent.ID); ok {
		t.Fatal("invalid Agent definition persisted")
	}

	_, existing := mustCreateAgentAggregate(t, model.AgentOwnerProject, "user-1", "project-1", "invalid-draft-save")
	originalRefs := existing.DefaultSkillRefsJSON
	archived := createReferenceTestSkill(t, "agent-draft-archived", model.SkillOwnerSystem, true, model.SkillVersionArchived)
	existing.DefaultSkillRefsJSON = `[{"skillVersionId":"` + archived.ID + `"}]`
	if err := SaveAgentDraft(existing); !errors.Is(err, ErrSkillReferenceTargetUnavailable) {
		t.Fatalf("save err=%v", err)
	}
	stored, ok, err := GetAgentVersion(existing.ID)
	if err != nil || !ok || stored.DefaultSkillRefsJSON != originalRefs {
		t.Fatalf("stored=%+v ok=%v err=%v", stored, ok, err)
	}

	createdVersion := existing
	createdVersion.ID = "invalid-agent-new-version"
	createdVersion.DefaultSkillRefsJSON = `[{"skillVersionId":"missing-agent-skill-version"}]`
	if err := CreateAgentVersion(createdVersion); !errors.Is(err, ErrSkillReferenceTargetUnavailable) {
		t.Fatalf("version err=%v", err)
	}
	if _, ok, _ := GetAgentVersion(createdVersion.ID); ok {
		t.Fatal("invalid Agent version persisted")
	}
}

func mustCreateAgentAggregate(t *testing.T, ownerType model.AgentOwnerType, userID, projectID, name string) (model.AgentDefinition, model.AgentVersion) {
	t.Helper()
	stamp := "2026-07-26T00:00:00Z"
	agent := model.AgentDefinition{
		ID:             "agent-" + name,
		Name:           name,
		OwnerType:      ownerType,
		OwnerUserID:    userID,
		OwnerProjectID: projectID,
		Enabled:        true,
		CreatedAt:      stamp,
		UpdatedAt:      stamp,
	}
	version := model.AgentVersion{
		ID:          "agent-version-" + name,
		AgentID:     agent.ID,
		Version:     "1.0.0",
		Status:      model.AgentVersionDraft,
		PlannerMode: "configured_chain",
		RolePrompt:  "role",
		ContentHash: "hash-" + name,
		CreatedBy:   userID,
		CreatedAt:   stamp,
		UpdatedAt:   stamp,
	}
	if err := CreateAgentAggregate(agent, version); err != nil {
		t.Fatal(err)
	}
	return agent, version
}
