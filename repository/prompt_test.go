package repository

import (
	"path/filepath"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

func TestCleanupLegacyBuiltinPromptsKeepsSystemPrompts(t *testing.T) {
	setupRepositoryTestDB(t)
	db, err := DB()
	if err != nil {
		t.Fatalf("DB returned error: %v", err)
	}
	clearPromptTestDB(t, db)
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

func TestSeedSystemPromptsAddsMissingWithoutOverwriting(t *testing.T) {
	setupRepositoryTestDB(t)
	db, err := DB()
	if err != nil {
		t.Fatalf("DB returned error: %v", err)
	}
	clearPromptTestDB(t, db)
	edited := model.Prompt{ID: "system-image-grid-general", Title: "已编辑九宫格", Prompt: "保留用户编辑", Category: "system"}
	if err := db.Create(&edited).Error; err != nil {
		t.Fatalf("Create edited prompt returned error: %v", err)
	}

	if err := seedSystemPrompts(db); err != nil {
		t.Fatalf("seedSystemPrompts returned error: %v", err)
	}
	if err := seedSystemPrompts(db); err != nil {
		t.Fatalf("seedSystemPrompts second call returned error: %v", err)
	}

	var saved model.Prompt
	if err := db.First(&saved, "id = ?", edited.ID).Error; err != nil {
		t.Fatalf("Find edited prompt returned error: %v", err)
	}
	if saved.Title != edited.Title || saved.Prompt != edited.Prompt {
		t.Fatalf("edited prompt = %#v, want original user edit", saved)
	}
	if saved.Category != "prop" {
		t.Fatalf("edited prompt category = %q, want prop", saved.Category)
	}
	var count int64
	if err := db.Model(&model.Prompt{}).Where("id = ?", "system-scene-multi-angle-general").Count(&count).Error; err != nil {
		t.Fatalf("Count seeded prompt returned error: %v", err)
	}
	if count != 1 {
		t.Fatalf("system-scene-multi-angle-general count = %d, want 1", count)
	}
}

func TestPromptCategoriesExposeBusinessTaxonomy(t *testing.T) {
	categories := PromptCategories()
	want := []model.PromptCategory{
		{Category: "scene", Name: "场景", Description: "场景与空间环境提示词"},
		{Category: "prop", Name: "道具", Description: "道具与通用图片资产提示词"},
		{Category: "character", Name: "角色", Description: "角色设定与人物修复提示词"},
		{Category: "video", Name: "视频", Description: "视频镜头与动态生成提示词"},
		{Category: "text", Name: "文本", Description: "文本创作与分析提示词"},
	}
	if len(categories) != len(want) {
		t.Fatalf("categories length = %d, want %d", len(categories), len(want))
	}
	for i := range want {
		if categories[i].Category != want[i].Category || categories[i].Name != want[i].Name || categories[i].Description != want[i].Description || categories[i].Remote {
			t.Fatalf("category[%d] = %#v, want %#v", i, categories[i], want[i])
		}
	}
}

func TestSystemPromptSeedsUseBusinessTaxonomy(t *testing.T) {
	seeds := systemPromptSeeds("now")
	byID := map[string]model.Prompt{}
	for _, item := range seeds {
		byID[item.ID] = item
	}
	for id, category := range map[string]string{
		"system-scene-multi-angle-general":     "scene",
		"system-image-grid-character-variants": "character",
		"system-image-grid-general":            "prop",
	} {
		if byID[id].Category != category {
			t.Fatalf("seed %s category = %q, want %q", id, byID[id].Category, category)
		}
	}
}

func TestListPromptsFiltersPromptMetadata(t *testing.T) {
	setupRepositoryTestDB(t)
	db, err := DB()
	if err != nil {
		t.Fatalf("DB returned error: %v", err)
	}
	clearPromptTestDB(t, db)
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

	items, total, err = ListPrompts(model.Query{NodeGroup: "video"})
	if err != nil {
		t.Fatalf("ListPrompts returned error: %v", err)
	}
	if total != 1 || len(items) != 1 || items[0].ID != "video-fav" {
		t.Fatalf("items=%#v total=%d, want video node group to include legacy video template", items, total)
	}

	nodeGroups, types, scenarios, err := ListPromptMetadataOptions(model.Query{Category: "system"})
	if err != nil {
		t.Fatalf("ListPromptMetadataOptions returned error: %v", err)
	}
	if len(nodeGroups) != 0 || len(types) != 2 || len(scenarios) != 2 {
		t.Fatalf("nodeGroups=%v types=%v scenarios=%v, want metadata options without legacy prompt", nodeGroups, types, scenarios)
	}
}

func TestListPromptsSearchesVisibleFieldsAndTags(t *testing.T) {
	setupRepositoryTestDB(t)
	db, err := DB()
	if err != nil {
		t.Fatalf("DB returned error: %v", err)
	}
	clearPromptTestDB(t, db)
	prompts := []model.Prompt{
		{ID: "title-hit", Title: "九宫格标题", Prompt: "普通内容", Category: "system", Tags: []string{"图片"}},
		{ID: "prompt-hit", Title: "普通标题", Prompt: "包含九宫格的提示词内容", Category: "system", Tags: []string{"图片"}},
		{ID: "tag-hit", Title: "标签命中", Prompt: "普通内容", Category: "system", Tags: []string{"九宫格"}},
		{ID: "preview-only", Title: "隐藏说明命中", Prompt: "普通内容", Category: "system", Tags: []string{"图片"}, Preview: "九宫格"},
	}
	if err := db.Create(&prompts).Error; err != nil {
		t.Fatalf("Create prompts returned error: %v", err)
	}

	items, total, err := ListPrompts(model.Query{Keyword: "九宫格", Page: 1, PageSize: 10})
	if err != nil {
		t.Fatalf("ListPrompts returned error: %v", err)
	}
	got := map[string]bool{}
	for _, item := range items {
		got[item.ID] = true
	}
	if total != 3 || len(items) != 3 || !got["title-hit"] || !got["prompt-hit"] || !got["tag-hit"] || got["preview-only"] {
		t.Fatalf("items=%#v total=%d, want title/prompt/tag hits only", items, total)
	}
}

func setupRepositoryTestDB(t *testing.T) {
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

func clearPromptTestDB(t *testing.T, db anyDB) {
	t.Helper()
	if err := db.Exec("DELETE FROM prompts").Error; err != nil {
		t.Fatalf("Delete prompts returned error: %v", err)
	}
}

type anyDB interface {
	Exec(sql string, values ...any) *gorm.DB
}
