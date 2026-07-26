package repository

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestWorkflowTablesMigrate(t *testing.T) {
	setupRepositoryTestDB(t)
	db, err := DB()
	if err != nil {
		t.Fatalf("DB returned error: %v", err)
	}
	for _, item := range []any{
		&model.WorkflowRun{},
		&model.WorkflowStageRun{},
		&model.WorkflowEvent{},
	} {
		if !db.Migrator().HasTable(item) {
			t.Fatalf("missing table %T", item)
		}
	}
}

func TestWorkflowStageRunPersistsInvocationLink(t *testing.T) {
	setupRepositoryTestDB(t)
	stage := model.WorkflowStageRun{
		ID: "stage-1", UserID: "user-1", WorkflowRunID: "workflow-1",
		StageID: "asset-extraction", Attempt: 1, InvocationID: "invocation-1",
		Status: model.WorkflowStageRunStatusQueued,
	}
	event := model.WorkflowEvent{UserID: stage.UserID, WorkflowRunID: stage.WorkflowRunID, StageRunID: stage.ID, Type: "stage.queued"}
	if err := CreateWorkflowStageWithEvent(stage, event); err != nil {
		t.Fatal(err)
	}
	stored, ok, err := GetWorkflowStageRunByInvocationID(stage.InvocationID)
	if err != nil || !ok || stored.ID != stage.ID || stored.UserID != stage.UserID {
		t.Fatalf("stored=%#v ok=%v err=%v", stored, ok, err)
	}
	if _, ok, err := GetWorkflowStageRunByInvocationID(""); err != nil || ok {
		t.Fatalf("empty invocation lookup ok=%v err=%v", ok, err)
	}
}
