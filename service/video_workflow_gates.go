package service

import (
	"encoding/json"
	"fmt"
	"regexp"
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

func ValidateAssetExtractionArtifact(raw json.RawMessage) WorkflowGateReport {
	report := newWorkflowGateReport()
	payload, ok := decodeWorkflowObject(raw, &report)
	if !ok {
		return report.finish()
	}
	items := workflowItems(payload, "items")
	if len(items) == 0 {
		report.add("missing_assets", "资产提取至少需要一条角色、场景、道具或服装", "")
		return report.finish()
	}
	if len(items) > 300 {
		report.add("too_many_assets", "单次美术产物不能超过 300 条资产", "")
	}
	characterIDs := map[string]bool{}
	for _, item := range items {
		if workflowString(item, "kind", "type", "category") == "character" {
			characterIDs[workflowString(item, "logicalAssetId")] = true
		}
	}
	seen := map[string]bool{}
	for index, item := range items {
		itemID := workflowString(item, "logicalAssetId")
		if itemID == "" {
			itemID = fmt.Sprintf("item-%d", index+1)
			report.add("missing_asset_id", "资产缺少稳定 logicalAssetId", itemID)
		} else if !regexp.MustCompile(`^(CHAR|SCENE|PROP|COSTUME)-\d{3}$`).MatchString(itemID) {
			report.add("invalid_asset_id", "资产编号必须使用 CHAR/SCENE/PROP/COSTUME 加三位序号", itemID)
		} else if seen[itemID] {
			report.add("duplicate_asset_id", "资产 ID 重复", itemID)
		}
		seen[itemID] = true
		if workflowString(item, "name", "title") == "" {
			report.add("missing_asset_name", "资产缺少名称", itemID)
		}
		kind := workflowString(item, "kind", "type", "category")
		if kind == "" {
			report.add("missing_asset_kind", "资产缺少角色、场景或道具类型", itemID)
		}
		if workflowString(item, "scriptEvidence") == "" {
			report.add("missing_script_evidence", "资产缺少剧本原文证据", itemID)
		}
		if workflowString(item, "description") == "" {
			report.add("missing_asset_description", "资产缺少从剧本提取的描述", itemID)
		}
		if kind == "costume" {
			parentID := workflowString(item, "parentLogicalAssetId")
			if parentID == "" || !characterIDs[parentID] {
				report.add("invalid_variant_parent", "角色马甲必须绑定当前产物中的角色编号", itemID)
			}
			variantType := workflowString(item, "variantType")
			if !map[string]bool{"costume": true, "hair": true, "makeup": true, "age": true, "injury": true, "other": true}[variantType] {
				report.add("invalid_variant_type", "角色马甲必须标记服装、发型、妆容、年龄、伤势或其他外观变化", itemID)
			}
			if workflowString(item, "variantName") == "" {
				report.add("missing_variant_name", "角色马甲缺少马甲名称", itemID)
			}
		}
	}
	return report.finish()
}

func ValidateAssetImagePromptArtifact(raw json.RawMessage) WorkflowGateReport {
	report := ValidateAssetExtractionArtifact(raw)
	if !report.Passed {
		return report
	}
	payload, ok := decodeWorkflowObject(raw, &report)
	if !ok {
		return report.finish()
	}
	for index, item := range workflowItems(payload, "items", "assets") {
		itemID := workflowString(item, "logicalAssetId")
		if itemID == "" {
			itemID = fmt.Sprintf("item-%d", index+1)
		}
		if workflowString(item, "imagePrompt") == "" {
			report.add("missing_image_prompt", "资产缺少可执行生图提示词", itemID)
		}
		if workflowString(item, "status") != "ready" {
			report.add("asset_not_ready", "资产产物必须明确标记为 ready", itemID)
		}
	}
	return report.finish()
}

func ValidateShotBreakdownArtifact(raw json.RawMessage) WorkflowGateReport {
	report := newWorkflowGateReport()
	payload, ok := decodeWorkflowObject(raw, &report)
	if !ok {
		return report.finish()
	}
	items := workflowItems(payload, "shots")
	if len(items) == 0 {
		report.add("missing_shots", "分镜产物至少需要一条镜头或生成 P", "")
		return report.finish()
	}
	if len(items) > 2000 {
		report.add("too_many_shots", "单次分镜产物不能超过 2000 条", "")
	}
	seen := map[string]bool{}
	for index, item := range items {
		itemID := workflowString(item, "shotId")
		if itemID == "" {
			itemID = fmt.Sprintf("shot-%d", index+1)
			report.add("missing_shot_id", "分镜缺少稳定 ID", itemID)
		} else if seen[itemID] {
			report.add("duplicate_shot_id", "分镜 ID 重复", itemID)
		}
		seen[itemID] = true
		if workflowString(item, "sceneKey") == "" {
			report.add("missing_scene_id", "分镜缺少场次标识", itemID)
		}
		if workflowString(item, "sourceScript") == "" {
			report.add("missing_source_script", "分镜缺少对应原剧本", itemID)
		}
		draft, ok := item["shotDraft"].(map[string]any)
		if !ok || len(draft) == 0 {
			report.add("missing_shot_draft", "分镜缺少可编辑结构", itemID)
			continue
		}
		for _, field := range []string{"shotSize", "camera", "movement", "action", "performance", "continuityMode"} {
			if workflowString(draft, field) == "" {
				report.add("missing_shot_field", "分镜可编辑结构缺少 "+field, itemID)
			}
		}
		duration := workflowNumber(draft, "durationSeconds")
		if duration == 0 {
			report.add("missing_duration", "分镜可编辑结构缺少 durationSeconds", itemID)
		} else if duration < 4 || duration > 15 {
			report.add("invalid_duration", "镜头时长必须在 4–15 秒之间", itemID)
		}
		if mode := workflowString(draft, "continuityMode"); mode != "continuous" && mode != "cut" {
			report.add("invalid_continuity_mode", "continuityMode 只能是 continuous 或 cut", itemID)
		}
		dialogue := workflowString(draft, "dialogue")
		if dialogue != "" && duration > 0 && visibleRuneCount(dialogue) > int(duration*5) {
			report.add("dialogue_budget", "台词长度超过镜头时长可承载范围", itemID)
		}
	}
	return report.finish()
}

func ValidateShotPromptArtifact(raw json.RawMessage) WorkflowGateReport {
	report := newWorkflowGateReport()
	payload, ok := decodeWorkflowObject(raw, &report)
	if !ok {
		return report.finish()
	}
	if workflowString(payload, "shotId") == "" {
		report.add("missing_shot_id", "提示词产物缺少镜头 ID", "")
	}
	prompt := workflowString(payload, "prompt")
	if prompt == "" {
		report.add("missing_shot_prompt", "提示词产物缺少最终视频提示词", "")
	} else if !validStoryboardPromptStructure(prompt) {
		report.add("invalid_shot_prompt_structure", "最终提示词必须使用完整可执行字段合同和连续时间段", workflowString(payload, "shotId"))
	}
	if strings.Contains(prompt, "@图0") {
		report.add("invalid_reference", "素材引用必须从 @图1 开始", workflowString(payload, "shotId"))
	}
	if workflowString(payload, "promptInputHash") == "" {
		report.add("missing_prompt_input_hash", "提示词产物缺少输入快照哈希", workflowString(payload, "shotId"))
	}
	return report.finish()
}

// Deprecated wrappers keep non-workflow callers source-compatible while using v2 gates.
func ValidateArtDesignArtifact(raw json.RawMessage) WorkflowGateReport {
	return ValidateAssetExtractionArtifact(raw)
}

func ValidateAssetGenerationArtifact(raw json.RawMessage) WorkflowGateReport {
	return ValidateAssetImagePromptArtifact(raw)
}

func ValidateStoryboardArtifact(raw json.RawMessage) WorkflowGateReport {
	return ValidateShotPromptArtifact(raw)
}

func validStoryboardPromptStructure(prompt string) bool {
	copyOnly := []string{"场景：", "声音：", "画面内容：", "限制："}
	if containsWorkflowFields(prompt, copyOnly) && regexp.MustCompile(`\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?秒`).MatchString(prompt) {
		return true
	}
	skill5 := []string{"场景：", "人物位置关系：", "情绪基调：", "焦段：", "光圈：", "机位：", "构图：", "运镜：", "主体动作/表情："}
	if containsWorkflowFields(prompt, skill5) && len(regexp.MustCompile(`【分镜\s*[^】]+】`).FindAllString(prompt, -1)) >= 2 {
		return true
	}
	legacy := []string{"基础设定", "场景起始状态", "场景固定视觉设定", "画面内容分镜", "兜底约束", "生产审核用时间预算校验", "场景空间", "固定画幅", "景别：", "构图：", "运镜手法：", "画面内容：", "声音/台词："}
	return containsWorkflowFields(prompt, legacy) && len(regexp.MustCompile(`分镜\s*[一二三四五六七八九十百\d]+`).FindAllString(prompt, -1)) >= 2
}

func containsWorkflowFields(text string, fields []string) bool {
	for _, field := range fields {
		if strings.HasSuffix(field, "：") && (strings.Contains(text, field) || strings.Contains(text, strings.TrimSuffix(field, "：")+":")) {
			continue
		}
		if !strings.Contains(text, field) {
			return false
		}
	}
	return true
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
