package repository

import (
	"errors"
	"fmt"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

// PromptCategories 返回内置提示词分类的副本。
func PromptCategories() []model.PromptCategory {
	result := make([]model.PromptCategory, len(promptCategories))
	copy(result, promptCategories)
	return result
}

// PromptCategoryByCode 根据分类编码查找内置提示词分类。
func PromptCategoryByCode(category string) (model.PromptCategory, bool) {
	for _, item := range promptCategories {
		if item.Category == category {
			return item, true
		}
	}
	return model.PromptCategory{}, false
}

// ListPromptCategories 返回内置提示词分类。
func ListPromptCategories() ([]model.PromptCategory, error) {
	return PromptCategories(), nil
}

// cleanupLegacyBuiltinPrompts removes old bundled remote prompt records while keeping manually maintained system prompts.
func cleanupLegacyBuiltinPrompts(db *gorm.DB) error {
	if len(legacyBuiltinPromptCategories) == 0 {
		return nil
	}
	return db.Where("category IN ?", legacyBuiltinPromptCategories).Delete(&model.Prompt{}).Error
}

// ListPrompts 按查询条件返回提示词分页列表。
func ListPrompts(q model.Query) ([]model.Prompt, int64, error) {
	db, err := DB()
	if err != nil {
		return nil, 0, err
	}
	q.Normalize()
	tx := applyPromptFilters(db.Model(&model.Prompt{}), q)

	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var items []model.Prompt
	if err := tx.Order("updated_at desc").Offset(q.Offset()).Limit(q.PageSize).Find(&items).Error; err != nil {
		return nil, 0, err
	}
	categories, _ := ListPromptCategories()
	githubURLs := map[string]string{}
	for _, item := range categories {
		githubURLs[item.Category] = item.GithubURL
	}
	for i := range items {
		items[i].GithubURL = githubURLs[items[i].Category]
	}
	return items, total, nil
}

// ListPromptTags 返回当前提示词查询条件下的全部标签。
func ListPromptTags(q model.Query) ([]string, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	q.Normalize()
	q.Tags = nil
	tx := applyPromptFilters(db.Model(&model.Prompt{}), q)

	var items []model.Prompt
	if err := tx.Select("tags").Find(&items).Error; err != nil {
		return nil, err
	}
	return promptTagsFromItems(items), nil
}

// ListPromptMetadataOptions 返回当前查询条件下可用的节点分组、模板类型和场景。
func ListPromptMetadataOptions(q model.Query) ([]string, []string, []string, error) {
	db, err := DB()
	if err != nil {
		return nil, nil, nil, err
	}
	q.Normalize()
	q.Type = ""
	q.Scenario = ""
	q.Favorite = ""
	tx := applyPromptFilters(db.Model(&model.Prompt{}), q)

	var items []model.Prompt
	if err := tx.Select("metadata").Find(&items).Error; err != nil {
		return nil, nil, nil, err
	}
	nodeGroups := []string{}
	types := []string{}
	scenarios := []string{}
	seenNodeGroups := map[string]bool{}
	seenTypes := map[string]bool{}
	seenScenarios := map[string]bool{}
	for _, item := range items {
		if value, ok := promptMetadataString(item.Metadata, "nodeGroup"); ok && !seenNodeGroups[value] {
			seenNodeGroups[value] = true
			nodeGroups = append(nodeGroups, value)
		}
		if value, ok := promptMetadataString(item.Metadata, "type"); ok && !seenTypes[value] {
			seenTypes[value] = true
			types = append(types, value)
		}
		if value, ok := promptMetadataString(item.Metadata, "scenario"); ok && !seenScenarios[value] {
			seenScenarios[value] = true
			scenarios = append(scenarios, value)
		}
	}
	return nodeGroups, types, scenarios, nil
}

// SavePrompt 保存提示词，并在更新时保留原创建时间。
func SavePrompt(item model.Prompt) (model.Prompt, error) {
	db, err := DB()
	if err != nil {
		return item, err
	}
	if saved, ok, err := findPrompt(db, item.ID); err != nil {
		return item, err
	} else if ok && item.CreatedAt == "" {
		item.CreatedAt = saved.CreatedAt
	}
	item.GithubURL = ""
	return item, db.Save(&item).Error
}

// DeletePrompt 删除指定提示词。
func DeletePrompt(id string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.Prompt{}, "id = ?", id).Error
}

// DeletePrompts 批量删除提示词。
func DeletePrompts(ids []string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.Prompt{}, "id IN ?", ids).Error
}

// ReplacePromptCategory 用远程同步结果替换整个提示词分类。
func ReplacePromptCategory(category model.PromptCategory, items []model.Prompt) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("category = ?", category.Category).Delete(&model.Prompt{}).Error; err != nil {
			return err
		}
		if len(items) == 0 {
			return nil
		}
		for i := range items {
			items[i].Category = category.Category
			items[i].GithubURL = ""
		}
		return tx.Create(&items).Error
	})
}

// applyPromptFilters 应用提示词列表的搜索条件。
func applyPromptFilters(tx *gorm.DB, q model.Query) *gorm.DB {
	if q.Keyword != "" {
		like := "%" + q.Keyword + "%"
		tx = tx.Where("title LIKE ? OR prompt LIKE ? OR preview LIKE ?", like, like, like)
	}
	if isActivePromptOption(q.Category) {
		tx = tx.Where("category = ?", q.Category)
	}
	tx = applyPromptTagsFilter(tx, q.Tags)
	tx = applyPromptNodeGroupFilter(tx, q.NodeGroup)
	if isActivePromptOption(q.Type) {
		tx = tx.Where(promptJSONMetadataValue(tx, "type")+" = ?", q.Type)
	}
	if isActivePromptOption(q.Scenario) {
		tx = tx.Where(promptJSONMetadataValue(tx, "scenario")+" = ?", q.Scenario)
	}
	if q.Favorite == "true" || q.Favorite == "1" {
		tx = tx.Where(promptJSONMetadataBool(tx, "favorite"))
	}
	return tx
}

// findPrompt 根据 ID 查询提示词。
func findPrompt(db *gorm.DB, id string) (model.Prompt, bool, error) {
	item := model.Prompt{}
	err := db.Where("id = ?", id).First(&item).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.Prompt{}, false, nil
	}
	return item, err == nil, err
}

// applyPromptTagsFilter 应用 JSON 标签条件。
func applyPromptTagsFilter(tx *gorm.DB, tags []string) *gorm.DB {
	if len(tags) == 0 {
		return tx
	}
	condition := tx.Session(&gorm.Session{NewDB: true})
	for _, tag := range tags {
		condition = condition.Or(promptJSONTagsContains(tx), tag)
	}
	return tx.Where(condition)
}

func applyPromptNodeGroupFilter(tx *gorm.DB, nodeGroup string) *gorm.DB {
	if !isActivePromptOption(nodeGroup) {
		return tx
	}
	fallbackTypes := promptNodeGroupFallbackTypes(nodeGroup)
	nodeField := promptJSONMetadataValue(tx, "nodeGroup")
	outputField := promptJSONMetadataValue(tx, "outputKind")
	typeField := promptJSONMetadataValue(tx, "type")
	if len(fallbackTypes) == 0 {
		return tx.Where(nodeField+" = ? OR (("+nodeField+" IS NULL OR "+nodeField+" = '') AND "+outputField+" = ?)", nodeGroup, nodeGroup)
	}
	return tx.Where(nodeField+" = ? OR (("+nodeField+" IS NULL OR "+nodeField+" = '') AND ("+outputField+" = ? OR "+typeField+" IN ?))", nodeGroup, nodeGroup, fallbackTypes)
}

func promptNodeGroupFallbackTypes(nodeGroup string) []string {
	switch nodeGroup {
	case "image":
		return []string{"image", "asset", "grid", "positive", "negative"}
	case "video":
		return []string{"video", "workflow", "positive", "negative"}
	case "text":
		return []string{"workflow"}
	default:
		return nil
	}
}

func promptTagsFromItems(items []model.Prompt) []string {
	seen := map[string]bool{}
	tags := []string{}
	for _, item := range items {
		for _, tag := range item.Tags {
			if tag != "" && !seen[tag] {
				seen[tag] = true
				tags = append(tags, tag)
			}
		}
	}
	return tags
}

// promptJSONTagsContains 返回提示词 tags 的 JSON 包含条件。
func promptJSONTagsContains(tx *gorm.DB) string {
	switch tx.Dialector.Name() {
	case "mysql":
		return "JSON_CONTAINS(tags, JSON_QUOTE(?))"
	case "postgres":
		return "jsonb_exists(tags::jsonb, ?)"
	default:
		return "EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?)"
	}
}

func promptJSONMetadataValue(tx *gorm.DB, key string) string {
	switch tx.Dialector.Name() {
	case "mysql":
		return fmt.Sprintf("JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.%s'))", key)
	case "postgres":
		return fmt.Sprintf("metadata::jsonb ->> '%s'", key)
	default:
		return fmt.Sprintf("json_extract(metadata, '$.%s')", key)
	}
}

func promptJSONMetadataBool(tx *gorm.DB, key string) string {
	switch tx.Dialector.Name() {
	case "mysql":
		return fmt.Sprintf("JSON_EXTRACT(metadata, '$.%s') = true", key)
	case "postgres":
		return fmt.Sprintf("(metadata::jsonb ->> '%s')::boolean = true", key)
	default:
		return fmt.Sprintf("json_extract(metadata, '$.%s') = 1", key)
	}
}

func promptMetadataString(metadata map[string]any, key string) (string, bool) {
	value, ok := metadata[key].(string)
	return value, ok && value != ""
}

// isActivePromptOption 判断提示词筛选项有效状态。
func isActivePromptOption(value string) bool {
	return value != "" && value != "全部" && value != "all"
}
