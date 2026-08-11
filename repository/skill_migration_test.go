package repository

import (
	"slices"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
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

func TestSameIndexColumnsIgnoresDriverOrder(t *testing.T) {
	want := []string{"owner_type", "owner_user_id", "owner_project_id", "name"}
	shuffled := []string{"name", "owner_project_id", "owner_type", "owner_user_id"}
	if !sameIndexColumns(shuffled, want) {
		t.Fatal("the same index columns in driver-specific order must match")
	}
	if sameIndexColumns([]string{"owner_type", "owner_project_id", "name"}, want) {
		t.Fatal("legacy three-column index must not match")
	}
	if shuffled[0] != "name" || want[0] != "owner_type" {
		t.Fatal("comparison must not mutate caller slices")
	}
}

func TestSkillOwnerIndexMigratesLegacyUniqueIndexToNonUniqueLookupIndex(t *testing.T) {
	setupRepositoryTestDB(t)
	legacy, err := gorm.Open(sqlite.Open(config.Cfg.DatabaseDSN), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := legacy.Exec(`CREATE TABLE skill_definitions (
		id text PRIMARY KEY, name text, owner_type text, owner_project_id text
	)`).Error; err != nil {
		t.Fatal(err)
	}
	if err := legacy.Exec(`CREATE UNIQUE INDEX idx_skill_owner_name
		ON skill_definitions(owner_type, owner_project_id, name)`).Error; err != nil {
		t.Fatal(err)
	}
	if sqlDB, err := legacy.DB(); err == nil {
		_ = sqlDB.Close()
	}

	db, err := DB()
	if err != nil {
		t.Fatal(err)
	}
	indexes, err := db.Migrator().GetIndexes(&model.SkillDefinition{})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"owner_type", "owner_user_id", "owner_project_id", "name"}
	found := false
	for _, index := range indexes {
		if index.Name() == "idx_skill_owner_name" {
			found = true
			if !slices.Equal(index.Columns(), want) {
				t.Fatalf("columns=%v want=%v", index.Columns(), want)
			}
			unique, ok := index.Unique()
			if !ok || unique {
				t.Fatal("owner-name index must allow independent definitions with the same name")
			}
		}
	}
	if !found {
		t.Fatal("missing idx_skill_owner_name")
	}
	for _, userID := range []string{"user-1", "user-2"} {
		if err := CreateSkillDefinition(model.SkillDefinition{
			ID: "skill-" + userID, Name: "同名技能", OwnerType: model.SkillOwnerType("project"),
			OwnerUserID: userID, OwnerProjectID: "project-1", Enabled: true,
		}); err != nil {
			t.Fatalf("user=%s err=%v", userID, err)
		}
	}
	for _, id := range []string{"skill-same-owner-1", "skill-same-owner-2"} {
		if err := CreateSkillDefinition(model.SkillDefinition{
			ID: id, Name: "同名技能", OwnerType: model.SkillOwnerType("project"),
			OwnerUserID: "user-1", OwnerProjectID: "project-1", Enabled: true,
		}); err != nil {
			t.Fatalf("same owner definition %s err=%v", id, err)
		}
	}
}
