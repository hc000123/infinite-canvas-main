package service

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	mps "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/mps/v20190612"
)

type tencentMPSTemplateAPI interface {
	DescribeTranscodeTemplatesWithContext(context.Context, *mps.DescribeTranscodeTemplatesRequest) (*mps.DescribeTranscodeTemplatesResponse, error)
}

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

func listTencentMPSEnhancementTemplates(ctx context.Context, api tencentMPSTemplateAPI) ([]model.TencentMPSTemplateSetting, error) {
	result := []model.TencentMPSTemplateSetting{}
	seen := map[int64]bool{}
	for offset := uint64(0); offset < 500; offset += 100 {
		limit := uint64(100)
		request := mps.NewDescribeTranscodeTemplatesRequest()
		request.TranscodeType, request.Offset, request.Limit = stringPointer("Enhance"), &offset, &limit
		response, err := api.DescribeTranscodeTemplatesWithContext(ctx, request)
		if err != nil {
			return nil, err
		}
		if response == nil || response.Response == nil {
			return nil, errors.New("Tencent MPS template response is empty")
		}
		for _, upstream := range response.Response.TranscodeTemplateSet {
			item, ok := tencentMPSTemplateSetting(upstream)
			if ok && !seen[item.Definition] {
				seen[item.Definition] = true
				result = append(result, item)
			}
		}
		if response.Response.TotalCount == nil || offset+limit >= *response.Response.TotalCount {
			break
		}
	}
	return result, nil
}

func tencentMPSTemplateSetting(upstream *mps.TranscodeTemplate) (model.TencentMPSTemplateSetting, bool) {
	if upstream == nil {
		return model.TencentMPSTemplateSetting{}, false
	}
	definition, err := strconv.ParseInt(pointerString(upstream.Definition), 10, 64)
	if err != nil || definition <= 0 {
		return model.TencentMPSTemplateSetting{}, false
	}
	item := model.TencentMPSTemplateSetting{
		Definition: definition, UpstreamName: pointerString(upstream.Name), DisplayName: pointerString(upstream.Name),
		SourceType: pointerString(upstream.Type), Scene: tencentTemplateSceneForDefinition(definition),
		RemoveAudio: upstream.RemoveAudio != nil && *upstream.RemoveAudio != 0,
	}
	if video := upstream.VideoTemplate; video != nil {
		if video.Width != nil {
			item.Width = int(*video.Width)
		}
		if video.Height != nil {
			item.Height = int(*video.Height)
		}
		item.Codec = pointerString(video.Codec)
		if video.Fps != nil {
			item.FPS = *video.Fps
		}
		item.Target = tencentTemplateTargetForDimensions(item.Width, item.Height)
		item.Supported = item.Target != "" && !item.RemoveAudio && (upstream.RemoveVideo == nil || *upstream.RemoveVideo == 0)
	}
	return normalizeTencentMPSTemplates([]model.TencentMPSTemplateSetting{item})[0], true
}

func tencentTemplateTargetForDimensions(width, height int) string {
	if width == 0 || height == 0 {
		fixed := width
		if fixed == 0 {
			fixed = height
		}
		if fixed == 1080 || fixed == 1920 {
			return "1080p"
		}
		if fixed == 1440 || fixed == 2560 {
			return "2k"
		}
		return ""
	}
	longEdge, shortEdge := width, height
	if longEdge < shortEdge {
		longEdge, shortEdge = shortEdge, longEdge
	}
	if longEdge == 1920 && shortEdge == 1080 {
		return "1080p"
	}
	if longEdge == 2560 && shortEdge == 1440 {
		return "2k"
	}
	return ""
}

func tencentTemplateSceneForDefinition(definition int64) string {
	for _, item := range defaultTencentMPSTemplates() {
		if item.Definition == definition {
			return item.Scene
		}
	}
	return "custom"
}

func enabledTencentMPSTemplate(setting model.TencentMPSVideoSetting, definition int64) (model.TencentMPSTemplateSetting, error) {
	for _, item := range normalizeTencentMPSTemplates(setting.Templates) {
		if item.Definition == definition && item.Enabled && item.Supported {
			return item, nil
		}
	}
	return model.TencentMPSTemplateSetting{}, safeMessageError{message: "所选腾讯增强模板不可用，请重新同步或选择其他方案"}
}
