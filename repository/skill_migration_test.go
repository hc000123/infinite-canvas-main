package repository

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestSkillRegistryTablesMigrate(t *testing.T) {
	setupRepositoryTestDB(t)
	db, err := DB()
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range []any{
		&model.SkillDefinition{},
		&model.SkillVersion{},
		&model.SkillEvaluation{},
		&model.SkillAuditLog{},
		&model.WorkflowStageSkillBinding{},
	} {
		if !db.Migrator().HasTable(item) {
			t.Fatalf("missing table %T", item)
		}
	}
}
