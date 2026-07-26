package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
)

type invocationBusinessValidator struct {
	ID      string
	Version string
	Check   func(map[string]any) error
}

var invocationBusinessValidatorKeys = map[string]string{
	"source_text": "core.source_text@1", "production_script": "core.production_script@1",
	"content_profile": "core.content_profile@1", "asset_catalog": "core.asset_catalog@1",
	"asset_record": "core.asset_record@1", "asset_brief": "core.asset_brief@1",
	"asset_rendition": "core.asset_rendition@1", "storyboard_package": "core.storyboard_package@1",
	"video_prompt_package": "core.video_prompt_package@1", "delivery_report": "core.delivery_report@1",
}

var invocationBusinessValidators = map[string]invocationBusinessValidator{
	"core.source_text@1":          {ID: "core.source_text", Version: "1", Check: requireInvocationString("text")},
	"core.production_script@1":    {ID: "core.production_script", Version: "1", Check: requireInvocationString("productionScript")},
	"core.content_profile@1":      {ID: "core.content_profile", Version: "1", Check: requireInvocationArray("routingTags")},
	"core.asset_catalog@1":        {ID: "core.asset_catalog", Version: "1", Check: validateInvocationAssetCatalog},
	"core.asset_record@1":         {ID: "core.asset_record", Version: "1", Check: requireInvocationStrings("assetId", "kind", "name")},
	"core.asset_brief@1":          {ID: "core.asset_brief", Version: "1", Check: requireInvocationStrings("assetId", "brief", "format")},
	"core.asset_rendition@1":      {ID: "core.asset_rendition", Version: "1", Check: requireInvocationStrings("assetId", "renditionId", "mediaType", "mediaRef")},
	"core.storyboard_package@1":   {ID: "core.storyboard_package", Version: "1", Check: validateInvocationStoryboardPackage},
	"core.video_prompt_package@1": {ID: "core.video_prompt_package", Version: "1", Check: validateInvocationVideoPromptPackage},
	"core.delivery_report@1":      {ID: "core.delivery_report", Version: "1", Check: requireInvocationString("summary")},
}

var invocationSkillGateAliases = map[string]bool{
	"schema": true, "script": true, "art": true, "asset": true,
	"media": true, "storyboard": true, "delivery": true,
}

func validateInvocationSkillGateProfile(gates []string) error {
	registered := map[string]bool{}
	for key := range invocationBusinessValidators {
		registered[key] = true
	}
	for _, gate := range gates {
		if !invocationSkillGateAliases[gate] && !registered[gate] {
			return fmt.Errorf("Skill 包含未知质量门 validator %q", gate)
		}
	}
	return nil
}

func requireInvocationString(key string) func(map[string]any) error {
	return requireInvocationStrings(key)
}

func requireInvocationStrings(keys ...string) func(map[string]any) error {
	return func(payload map[string]any) error {
		for _, key := range keys {
			value, ok := payload[key].(string)
			if !ok || strings.TrimSpace(value) == "" {
				return fmt.Errorf("%s 不能为空", key)
			}
		}
		return nil
	}
}

func requireInvocationArray(key string) func(map[string]any) error {
	return func(payload map[string]any) error {
		if _, ok := payload[key].([]any); !ok {
			return fmt.Errorf("%s 必须是数组", key)
		}
		return nil
	}
}

func invocationBusinessValidatorFor(artifactType string) (invocationBusinessValidator, error) {
	key, ok := invocationBusinessValidatorKeys[artifactType]
	if !ok {
		return invocationBusinessValidator{}, errors.New("未知 Artifact 类型没有系统 business validator")
	}
	validator, ok := invocationBusinessValidators[key]
	if !ok {
		return invocationBusinessValidator{}, errors.New("未知 Artifact 类型没有系统 business validator")
	}
	return validator, nil
}

func validateInvocationBusinessPayload(validator invocationBusinessValidator, payload map[string]any, revision model.InvocationPreflightRevision) error {
	errs := []error{}
	if err := validator.Check(payload); err != nil {
		errs = append(errs, err)
	}
	var bindings []ResolvedArtifactBinding
	if json.Unmarshal([]byte(revision.InputSnapshotJSON), &bindings) != nil {
		return errors.Join(append(errs, errors.New("冻结输入快照无效"))...)
	}
	switch validator.ID {
	case "core.asset_catalog":
		script := invocationInputScript(bindings)
		for _, item := range invocationObjectItems(payload, "items") {
			for _, evidence := range invocationStringItems(item["sourceEvidence"]) {
				if script == "" || !strings.Contains(script, evidence) {
					errs = append(errs, fmt.Errorf("资产 %s 的证据不是已确认剧本原文", invocationString(item, "assetId")))
				}
			}
		}
	case "core.storyboard_package":
		script := invocationInputScript(bindings)
		for _, shot := range invocationObjectItems(payload, "shots") {
			source := invocationString(shot, "sourceScript")
			if script == "" || source == "" || !strings.Contains(script, source) {
				errs = append(errs, fmt.Errorf("分镜 %s 的 sourceScript 不是已确认原剧本", invocationString(shot, "shotId")))
			}
		}
	case "core.video_prompt_package":
		errs = append(errs, validateInvocationVideoPromptRefs(payload, bindings)...)
	}
	return errors.Join(errs...)
}

func validateInvocationAssetCatalog(payload map[string]any) error {
	items := invocationObjectItems(payload, "items")
	if len(items) == 0 {
		return errors.New("资产目录至少需要一项")
	}
	errs := []error{}
	if len(items) > 300 {
		errs = append(errs, errors.New("资产目录不能超过 300 项"))
	}
	seen, characters := map[string]bool{}, map[string]bool{}
	for _, item := range items {
		if invocationString(item, "kind") == "character" {
			characters[invocationString(item, "assetId")] = true
		}
	}
	assetIDPattern := regexp.MustCompile(`^(character|scene|prop|costume)-\d{3}$`)
	characterPattern := regexp.MustCompile(`character-\d{3}`)
	for index, item := range items {
		id := invocationString(item, "assetId")
		if !assetIDPattern.MatchString(id) {
			errs = append(errs, fmt.Errorf("第 %d 项资产 ID 格式无效", index+1))
		} else if seen[id] {
			errs = append(errs, fmt.Errorf("资产 ID %s 重复", id))
		}
		seen[id] = true
		if len(invocationStringItems(item["sourceEvidence"])) == 0 {
			errs = append(errs, fmt.Errorf("资产 %s 缺少原文证据", id))
		}
		facts := invocationStringItems(item["coreFacts"])
		if len(facts) == 0 {
			errs = append(errs, fmt.Errorf("资产 %s 缺少核心事实", id))
		}
		if invocationString(item, "kind") == "costume" {
			parent := ""
			for _, fact := range facts {
				if match := characterPattern.FindString(fact); match != "" {
					parent = match
					break
				}
			}
			if parent == "" || !characters[parent] {
				errs = append(errs, fmt.Errorf("外观资产 %s 必须在 coreFacts 绑定当前目录角色", id))
			}
		}
	}
	return errors.Join(errs...)
}

func validateInvocationStoryboardPackage(payload map[string]any) error {
	shots := invocationObjectItems(payload, "shots")
	if len(shots) == 0 {
		return errors.New("分镜包至少需要一镜")
	}
	errs, seen := []error{}, map[string]bool{}
	for index, shot := range shots {
		id := invocationString(shot, "shotId")
		if id == "" {
			errs = append(errs, fmt.Errorf("第 %d 镜缺少 shotId", index+1))
		} else if seen[id] {
			errs = append(errs, fmt.Errorf("分镜 ID %s 重复", id))
		}
		seen[id] = true
		draft, ok := shot["shotDraft"].(map[string]any)
		if !ok {
			errs = append(errs, fmt.Errorf("分镜 %s 缺少 shotDraft", id))
			continue
		}
		duration := workflowNumber(draft, "durationSeconds")
		if duration < 4 || duration > 15 {
			errs = append(errs, fmt.Errorf("分镜 %s 时长必须在 4–15 秒之间", id))
		}
		dialogue, _ := draft["dialogue"].(string)
		if duration > 0 && visibleRuneCount(dialogue) > int(duration*5) {
			errs = append(errs, fmt.Errorf("分镜 %s 台词超过时长预算", id))
		}
	}
	return errors.Join(errs...)
}

func validateInvocationVideoPromptPackage(payload map[string]any) error {
	items := invocationObjectItems(payload, "items")
	if len(items) == 0 {
		return errors.New("视频提示词包至少需要一项")
	}
	errs, seen := []error{}, map[string]bool{}
	for index, item := range items {
		id := invocationString(item, "shotId")
		if id == "" {
			errs = append(errs, fmt.Errorf("第 %d 项提示词缺少 shotId", index+1))
		} else if seen[id] {
			errs = append(errs, fmt.Errorf("提示词 shotId %s 重复", id))
		}
		seen[id] = true
		prompt := invocationString(item, "prompt")
		if !validStoryboardPromptStructure(prompt) || !invocationContinuousTimeline(prompt) {
			errs = append(errs, fmt.Errorf("提示词 %s 缺少四段成品或连续时间轴", id))
		}
		if strings.Contains(prompt, "@图0") {
			errs = append(errs, fmt.Errorf("提示词 %s 包含无效引用 @图0", id))
		}
	}
	return errors.Join(errs...)
}

func validateInvocationVideoPromptRefs(payload map[string]any, bindings []ResolvedArtifactBinding) []error {
	type coordinate struct{ binding, id, hash, role string }
	expected := map[string]coordinate{}
	for _, binding := range bindings {
		role := ""
		if metadata, ok := binding.Artifact.Extensions["workflow_media_import"].(map[string]any); ok {
			role = invocationString(metadata, "role")
		}
		item := coordinate{binding.BindingName, binding.Artifact.Artifact.ID, binding.Artifact.Artifact.ContentHash, role}
		expected[item.id] = item
	}
	errs := []error{}
	for _, output := range invocationObjectItems(payload, "items") {
		usedContinuity := false
		for _, ref := range invocationObjectItems(output, "inputArtifactRefs") {
			binding, id, hash := invocationString(ref, "bindingName"), invocationString(ref, "artifactId"), invocationString(ref, "contentHash")
			want, ok := expected[id]
			if !ok || want.hash != hash || want.binding != binding {
				errs = append(errs, fmt.Errorf("提示词 %s 包含非冻结 Artifact 引用", invocationString(output, "shotId")))
			}
			if ok && want.role == "continuity_reference" {
				usedContinuity = true
			}
			if binding == "first_frame" && ok && want.role == "continuity_reference" {
				errs = append(errs, errors.New("上一镜尾帧不得作为首帧"))
			}
		}
		prompt := invocationString(output, "prompt")
		if usedContinuity && (strings.Contains(prompt, "首帧") || strings.Contains(prompt, "第一帧复刻")) {
			errs = append(errs, errors.New("上一镜尾帧 continuity_reference 只能作为普通参考图，不得要求首帧复刻"))
		}
	}
	return errs
}

func invocationObjectItems(payload map[string]any, key string) []map[string]any {
	values, _ := payload[key].([]any)
	items := make([]map[string]any, 0, len(values))
	for _, value := range values {
		if item, ok := value.(map[string]any); ok {
			items = append(items, item)
		}
	}
	return items
}

func invocationString(payload map[string]any, key string) string {
	value, _ := payload[key].(string)
	return strings.TrimSpace(value)
}

func invocationStringItems(value any) []string {
	values, _ := value.([]any)
	result := make([]string, 0, len(values))
	for _, item := range values {
		if text, ok := item.(string); ok && strings.TrimSpace(text) != "" {
			result = append(result, strings.TrimSpace(text))
		}
	}
	return result
}

func invocationInputScript(bindings []ResolvedArtifactBinding) string {
	for _, binding := range bindings {
		switch binding.Artifact.Artifact.ArtifactType {
		case "production_script":
			if value, ok := binding.Artifact.Payload["productionScript"].(string); ok {
				return value
			}
		case "source_text":
			if value, ok := binding.Artifact.Payload["text"].(string); ok {
				return value
			}
		}
	}
	return ""
}

func invocationContinuousTimeline(prompt string) bool {
	matches := regexp.MustCompile(`(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)秒`).FindAllStringSubmatch(prompt, -1)
	if len(matches) == 0 {
		return false
	}
	previous := float64(0)
	for index, match := range matches {
		start, startErr := strconv.ParseFloat(match[1], 64)
		end, endErr := strconv.ParseFloat(match[2], 64)
		if startErr != nil || endErr != nil || end <= start || (index == 0 && start != 0) || (index > 0 && start != previous) {
			return false
		}
		previous = end
	}
	return true
}
