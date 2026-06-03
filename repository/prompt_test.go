package repository

import (
	"path/filepath"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
)

func TestCleanupLegacyBuiltinPromptsKeepsSystemPrompts(t *testing.T) {
	setupPromptTestDB(t)
	db, err := DB()
	if err != nil {
		t.Fatalf("DB returned error: %v", err)
	}
	prompts := []model.Prompt{
		{ID: "system-prompt", Title: "手动提示词", Prompt: "保留", Category: "system"},
		{ID: "builtin-one", Title: "内置提示词一", Prompt: "删除", Category: "gpt-image-2-prompts"},
		{ID: "builtin-two", Title: "内置提示词二", Prompt: "删除", Category: "awesome-gpt-image"},
	}
	if err := db.Create(&prompts).Error; err != nil {
		t.Fatalf("Create prompts returned error: %v", err)
	}

	if err := cleanupLegacyBuiltinPrompts(db); err != nil {
		t.Fatalf("cleanupLegacyBuiltinPrompts returned error: %v", err)
	}

	var saved []model.Prompt
	if err := db.Order("id asc").Find(&saved).Error; err != nil {
		t.Fatalf("Find prompts returned error: %v", err)
	}
	if len(saved) != 1 || saved[0].ID != "system-prompt" {
		t.Fatalf("saved prompts = %#v, want only system prompt", saved)
	}
}

func TestPromptCategoriesOnlyExposeManualSystemCategory(t *testing.T) {
	categories := PromptCategories()
	if len(categories) != 1 {
		t.Fatalf("categories length = %d, want 1", len(categories))
	}
	if categories[0].Category != "system" || categories[0].Remote {
		t.Fatalf("category = %#v, want non-remote system category", categories[0])
	}
}

func setupPromptTestDB(t *testing.T) {
	t.Helper()
	tmp := t.TempDir()
	oldStorageDriver := config.Cfg.StorageDriver
	oldDatabaseDSN := config.Cfg.DatabaseDSN
	t.Cleanup(func() {
		config.Cfg.StorageDriver = oldStorageDriver
		config.Cfg.DatabaseDSN = oldDatabaseDSN
		ResetForTest()
	})
	config.Cfg.StorageDriver = "sqlite"
	config.Cfg.DatabaseDSN = filepath.Join(tmp, "test.db")
	ResetForTest()
}
