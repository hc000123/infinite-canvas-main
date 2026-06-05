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

func TestListPromptsFiltersPromptMetadata(t *testing.T) {
	setupPromptTestDB(t)
	db, err := DB()
	if err != nil {
		t.Fatalf("DB returned error: %v", err)
	}
	prompts := []model.Prompt{
		{ID: "video-fav", Title: "视频常用", Prompt: "让 {角色} 走进 {场景}", Category: "system", Tags: []string{"短剧"}, Metadata: map[string]any{"type": "video", "scenario": "短剧", "favorite": true}},
		{ID: "image-one", Title: "图片模板", Prompt: "画一张图", Category: "system", Tags: []string{"图片"}, Metadata: map[string]any{"type": "image", "scenario": "海报"}},
		{ID: "legacy", Title: "旧提示词", Prompt: "普通提示词", Category: "system", Tags: []string{"普通"}},
	}
	if err := db.Create(&prompts).Error; err != nil {
		t.Fatalf("Create prompts returned error: %v", err)
	}

	items, total, err := ListPrompts(model.Query{Type: "video", Scenario: "短剧", Favorite: "true"})
	if err != nil {
		t.Fatalf("ListPrompts returned error: %v", err)
	}
	if total != 1 || len(items) != 1 || items[0].ID != "video-fav" {
		t.Fatalf("items=%#v total=%d, want only video-fav", items, total)
	}

	types, scenarios, err := ListPromptMetadataOptions(model.Query{Category: "system"})
	if err != nil {
		t.Fatalf("ListPromptMetadataOptions returned error: %v", err)
	}
	if len(types) != 2 || len(scenarios) != 2 {
		t.Fatalf("types=%v scenarios=%v, want metadata options without legacy prompt", types, scenarios)
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
