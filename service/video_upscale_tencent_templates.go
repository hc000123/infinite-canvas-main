package service

import (
	"fmt"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
)

func defaultTencentMPSTemplates() []model.TencentMPSTemplateSetting {
	return []model.TencentMPSTemplateSetting{
		defaultTencentMPSTemplate(327004, "漫剧增强 1080p", "comic", "1080p", 1920, 1080),
		defaultTencentMPSTemplate(327006, "漫剧增强 2K", "comic", "2k", 2560, 1440),
		defaultTencentMPSTemplate(327003, "真人增强 1080p", "live", "1080p", 1920, 1080),
		defaultTencentMPSTemplate(327005, "真人增强 2K", "live", "2k", 2560, 1440),
		defaultTencentMPSTemplate(327022, "老片修复 1080p", "restore", "1080p", 1920, 1080),
		defaultTencentMPSTemplate(327023, "老片修复 2K", "restore", "2k", 2560, 1440),
	}
}

func defaultTencentMPSTemplate(definition int64, name, scene, target string, width, height int) model.TencentMPSTemplateSetting {
	return model.TencentMPSTemplateSetting{
		Definition: definition, UpstreamName: name, DisplayName: name, SourceType: "Preset",
		Enabled: true, Scene: scene, Target: target, Width: width, Height: height, Supported: true,
	}
}

func normalizeTencentMPSTemplates(items []model.TencentMPSTemplateSetting) []model.TencentMPSTemplateSetting {
	if len(items) == 0 {
		return defaultTencentMPSTemplates()
	}
	result := make([]model.TencentMPSTemplateSetting, 0, len(items))
	seen := map[int64]bool{}
	for _, item := range items {
		if item.Definition <= 0 || seen[item.Definition] {
			continue
		}
		seen[item.Definition] = true
		item.UpstreamName = strings.TrimSpace(item.UpstreamName)
		item.DisplayName = firstNonEmpty(strings.TrimSpace(item.DisplayName), item.UpstreamName, fmt.Sprintf("模板 %d", item.Definition))
		item.SourceType = normalizeTencentTemplateSourceType(item.SourceType)
		item.Scene = normalizeTencentTemplateScene(item.Scene)
		item.Target = normalizeTencentTemplateTarget(item.Target)
		item.Codec = strings.ToLower(strings.TrimSpace(item.Codec))
		item.Supported = item.Supported && !item.RemoveAudio && (item.Target == "1080p" || item.Target == "2k")
		item.Enabled = item.Enabled && item.Supported
		result = append(result, item)
	}
	return result
}

func mergeTencentMPSTemplates(saved, remote []model.TencentMPSTemplateSetting) []model.TencentMPSTemplateSetting {
	local := map[int64]model.TencentMPSTemplateSetting{}
	for _, item := range normalizeTencentMPSTemplates(saved) {
		local[item.Definition] = item
	}
	merged := make([]model.TencentMPSTemplateSetting, 0, len(remote))
	for _, item := range remote {
		if previous, ok := local[item.Definition]; ok {
			item.Enabled = previous.Enabled
			item.DisplayName = previous.DisplayName
			item.Scene = previous.Scene
		}
		merged = append(merged, item)
	}
	return normalizeTencentMPSTemplates(merged)
}

func normalizeTencentTemplateSourceType(value string) string {
	if strings.EqualFold(strings.TrimSpace(value), "Preset") {
		return "Preset"
	}
	return "Custom"
}

func normalizeTencentTemplateScene(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "comic" || value == "live" || value == "restore" {
		return value
	}
	return "custom"
}

func normalizeTencentTemplateTarget(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "2k" || value == "1440p" {
		return "2k"
	}
	if value == "1080p" {
		return value
	}
	return ""
}
