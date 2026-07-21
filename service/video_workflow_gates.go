package service

import (
	"encoding/json"
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"
)

func ValidateScriptArtifact(raw json.RawMessage) WorkflowGateReport {
	report := newWorkflowGateReport()
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		report.add("invalid_json", "剧本快照不是有效 JSON", "")
		return report.finish()
	}
	script := workflowString(payload, "productionScript", "script", "rawText")
	if strings.TrimSpace(script) == "" {
		report.add("missing_script", "缺少已确认的生产剧本", "")
	}
	if len(script) > maxWorkflowScriptBytes {
		report.add("script_too_large", "生产剧本超过允许大小", "")
	}
	return report.finish()
}

func ValidateArtDesignArtifact(raw json.RawMessage) WorkflowGateReport {
	report := newWorkflowGateReport()
	payload, ok := decodeWorkflowObject(raw, &report)
	if !ok {
		return report.finish()
	}
	items := workflowItems(payload, "items", "assets")
	for _, group := range []string{"characters", "scenes", "props"} {
		items = append(items, workflowItems(payload, group)...)
	}
	if len(items) == 0 {
		report.add("missing_assets", "美术产物至少需要一条角色、场景或道具设定", "")
		return report.finish()
	}
	if len(items) > 300 {
		report.add("too_many_assets", "单次美术产物不能超过 300 条资产", "")
	}
	seen := map[string]bool{}
	for index, item := range items {
		itemID := workflowString(item, "id", "itemId", "assetId")
		if itemID == "" {
			itemID = fmt.Sprintf("item-%d", index+1)
			report.add("missing_asset_id", "资产缺少稳定 ID", itemID)
		} else if seen[itemID] {
			report.add("duplicate_asset_id", "资产 ID 重复", itemID)
		}
		seen[itemID] = true
		if workflowString(item, "name", "title") == "" {
			report.add("missing_asset_name", "资产缺少名称", itemID)
		}
		if workflowString(item, "kind", "type", "category") == "" {
			report.add("missing_asset_kind", "资产缺少角色、场景或道具类型", itemID)
		}
		if workflowString(item, "prompt", "imagePrompt", "description") == "" {
			report.add("missing_asset_prompt", "资产缺少可执行提示词", itemID)
		}
	}
	return report.finish()
}

func ValidateStoryboardArtifact(raw json.RawMessage) WorkflowGateReport {
	report := newWorkflowGateReport()
	payload, ok := decodeWorkflowObject(raw, &report)
	if !ok {
		return report.finish()
	}
	items := workflowItems(payload, "shots", "items", "videoPrompts", "packages")
	if len(items) == 0 {
		report.add("missing_shots", "分镜产物至少需要一条镜头或生成 P", "")
		return report.finish()
	}
	if len(items) > 2000 {
		report.add("too_many_shots", "单次分镜产物不能超过 2000 条", "")
	}
	seen := map[string]bool{}
	for index, item := range items {
		itemID := workflowString(item, "id", "shotId", "packageId")
		if itemID == "" {
			itemID = fmt.Sprintf("shot-%d", index+1)
			report.add("missing_shot_id", "分镜缺少稳定 ID", itemID)
		} else if seen[itemID] {
			report.add("duplicate_shot_id", "分镜 ID 重复", itemID)
		}
		seen[itemID] = true
		if workflowString(item, "sceneId", "scene", "sceneKey") == "" {
			report.add("missing_scene_id", "分镜缺少场次标识", itemID)
		}
		prompt := workflowString(item, "prompt", "seedancePrompt", "videoPrompt")
		if prompt == "" {
			report.add("missing_shot_prompt", "分镜缺少 Seedance 提示词", itemID)
		}
		if strings.Contains(prompt, "@图0") {
			report.add("invalid_reference", "素材引用必须从 @图1 开始", itemID)
		}
		duration := workflowNumber(item, "duration", "seconds")
		if duration != 0 && (duration < 4 || duration > 15) {
			report.add("invalid_duration", "镜头时长必须在 4–15 秒之间", itemID)
		}
		dialogue := workflowString(item, "dialogue", "spokenText")
		if dialogue != "" && duration > 0 && visibleRuneCount(dialogue) > int(duration*5) {
			report.add("dialogue_budget", "台词长度超过镜头时长可承载范围", itemID)
		}
	}
	return report.finish()
}

func validateWorkflowReferenceEvidence(raw json.RawMessage, manifestJSON string, report *WorkflowGateReport) {
	var manifest struct {
		Items []json.RawMessage `json:"items"`
	}
	if json.Unmarshal([]byte(manifestJSON), &manifest) != nil || len(manifest.Items) == 0 {
		return
	}
	var payload map[string]any
	if json.Unmarshal(raw, &payload) != nil {
		return
	}
	evidence := workflowItems(payload, "referenceEvidence")
	if len(evidence) < len(manifest.Items) {
		report.add("missing_reference_evidence", "参考图任务必须逐图记录画面理解证据", "")
		report.Passed = false
		return
	}
	seen := map[string]bool{}
	for _, item := range evidence {
		imageRef := workflowString(item, "imageRef", "image", "reference")
		if imageRef == "" || !workflowValuePresent(item, "observations", "observation", "visualFacts") || !workflowValuePresent(item, "appliedTo", "usage", "applied") {
			report.add("invalid_reference_evidence", "参考图理解证据缺少引用、观察结果或应用说明", imageRef)
			report.Passed = false
			continue
		}
		seen[imageRef] = true
	}
	for index := range manifest.Items {
		imageRef := fmt.Sprintf("@图%d", index+1)
		if !seen[imageRef] {
			report.add("unverified_reference_image", "参考图没有对应的画面理解证据", imageRef)
			report.Passed = false
		}
	}
}

func workflowValuePresent(payload map[string]any, keys ...string) bool {
	for _, key := range keys {
		switch value := payload[key].(type) {
		case string:
			if strings.TrimSpace(value) != "" {
				return true
			}
		case []any:
			if len(value) > 0 {
				return true
			}
		case map[string]any:
			if len(value) > 0 {
				return true
			}
		}
	}
	return false
}

func newWorkflowGateReport() WorkflowGateReport {
	return WorkflowGateReport{Passed: true, Version: workflowGateValidatorVersion, Issues: []WorkflowGateIssue{}}
}

func (report *WorkflowGateReport) add(code string, message string, itemID string) {
	report.Issues = append(report.Issues, WorkflowGateIssue{Code: code, Message: message, ItemID: itemID, Blocking: true})
}

func (report WorkflowGateReport) finish() WorkflowGateReport {
	for _, issue := range report.Issues {
		if issue.Blocking {
			report.Passed = false
			break
		}
	}
	return report
}

func decodeWorkflowObject(raw json.RawMessage, report *WorkflowGateReport) (map[string]any, bool) {
	if len(raw) == 0 || len(raw) > maxWorkflowArtifactBytes {
		report.add("invalid_artifact_size", "产物为空或超过允许大小", "")
		return nil, false
	}
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		report.add("invalid_json", "产物不是有效 JSON", "")
		return nil, false
	}
	return payload, true
}

func workflowItems(payload map[string]any, keys ...string) []map[string]any {
	result := []map[string]any{}
	for _, key := range keys {
		items, ok := payload[key].([]any)
		if !ok {
			continue
		}
		for _, item := range items {
			if record, ok := item.(map[string]any); ok {
				result = append(result, record)
			}
		}
	}
	return result
}

func workflowString(payload map[string]any, keys ...string) string {
	for _, key := range keys {
		if value, ok := payload[key].(string); ok && strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func workflowNumber(payload map[string]any, keys ...string) float64 {
	for _, key := range keys {
		switch value := payload[key].(type) {
		case float64:
			return value
		case json.Number:
			number, _ := value.Float64()
			return number
		}
	}
	return 0
}

func visibleRuneCount(value string) int {
	count := 0
	for len(value) > 0 {
		r, size := utf8.DecodeRuneInString(value)
		value = value[size:]
		if !unicode.IsSpace(r) && !unicode.IsPunct(r) {
			count++
		}
	}
	return count
}
