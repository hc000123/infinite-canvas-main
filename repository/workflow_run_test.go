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
		&model.WorkflowArtifact{},
		&model.WorkflowQualityGateResult{},
		&model.WorkflowEvent{},
	} {
		if !db.Migrator().HasTable(item) {
			t.Fatalf("missing table %T", item)
		}
	}
}
