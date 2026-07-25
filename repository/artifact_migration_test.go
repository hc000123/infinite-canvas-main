package repository

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestArtifactSchemaTablesMigrate(t *testing.T) {
	setupRepositoryTestDB(t)
	db, err := DB()
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range []any{&model.ArtifactSchema{}, &model.Artifact{}} {
		if !db.Migrator().HasTable(item) {
			t.Fatalf("missing table %T", item)
		}
	}
}
