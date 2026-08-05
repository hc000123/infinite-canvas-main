package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

const maxContentFidelityReasons = 8

func workflowAdapterContentFidelity(transformKind string, before any, after json.RawMessage) (map[string]any, error) {
	canonicalBefore, err := marshalInvocationCanonical(before)
	if err != nil {
		return nil, err
	}
	canonicalAfter, err := marshalInvocationCanonical(after)
	if err != nil {
		return nil, err
	}
	beforeValue, err := decodeContentFidelityJSON(canonicalBefore)
	if err != nil {
		return nil, err
	}
	afterValue, err := decodeContentFidelityJSON(canonicalAfter)
	if err != nil {
		return nil, err
	}
	reasons := []string{}
	switch strings.ToLower(strings.TrimSpace(transformKind)) {
	case "production-script-envelope-v1", "stage-script-normalize-v1":
		compareProductionScriptV1(beforeValue, afterValue, &reasons)
	case "stage-art-normalize-v1":
		compareAssetNormalizationV1(beforeValue, afterValue, &reasons)
	case "stage-storyboard-normalize-v1", "stage-storyboard-vertical-short-normalize-v1", "stage-storyboard-horizontal-long-normalize-v1":
		compareStoryboardNormalizationV1(beforeValue, afterValue, &reasons)
	default:
		compareContentFidelityExact(beforeValue, afterValue, "$", &reasons)
	}
	return map[string]any{
		"structureChanged":     !bytes.Equal(canonicalBefore, canonicalAfter),
		"contentChanged":       len(reasons) > 0,
		"contentChangeReasons": reasons,
	}, nil
}

func decodeContentFidelityJSON(raw []byte) (any, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, err
	}
	return value, nil
}

func compareProductionScriptV1(before, after any, reasons *[]string) {
	left, leftOK := before.(map[string]any)
	right, rightOK := after.(map[string]any)
	if !leftOK || !rightOK {
		compareContentFidelityExact(before, after, "$", reasons)
		return
	}
	compareContentFidelityMaps(left, right, "$", "productionScript", reasons, func(leftValue, rightValue any, path string) {
		original, originalOK := leftValue.(string)
		converted, convertedOK := rightValue.(string)
		if !originalOK || !convertedOK || (converted != original && converted != strings.TrimSpace(original)) {
			addContentFidelityReason(reasons, fmt.Sprintf("%s 除字符串外层空白 trim 外发生变化", path))
		}
	})
}

func compareAssetNormalizationV1(before, after any, reasons *[]string) {
	left, leftOK := before.(map[string]any)
	right, rightOK := after.(map[string]any)
	if !leftOK || !rightOK {
		compareContentFidelityExact(before, after, "$", reasons)
		return
	}
	compareContentFidelityMaps(left, right, "$", "items", reasons, func(leftValue, rightValue any, path string) {
		leftItems, leftOK := leftValue.([]any)
		rightItems, rightOK := rightValue.([]any)
		if !leftOK || !rightOK {
			compareContentFidelityExact(leftValue, rightValue, path, reasons)
			return
		}
		if len(leftItems) != len(rightItems) {
			addContentFidelityReason(reasons, fmt.Sprintf("%s 数量从 %d 变为 %d", path, len(leftItems), len(rightItems)))
		}
		counters := map[string]int{}
		for index := 0; index < len(leftItems); index++ {
			itemPath := fmt.Sprintf("%s[%d]", path, index)
			leftItem, itemOK := leftItems[index].(map[string]any)
			if !itemOK {
				if index < len(rightItems) {
					compareContentFidelityExact(leftItems[index], rightItems[index], itemPath, reasons)
				}
				continue
			}
			prefix := contentFidelityAssetPrefix(leftItem["kind"])
			if prefix != "" {
				counters[prefix]++
			}
			if index >= len(rightItems) {
				continue
			}
			rightItem, itemOK := rightItems[index].(map[string]any)
			if !itemOK {
				compareContentFidelityExact(leftItems[index], rightItems[index], itemPath, reasons)
				continue
			}
			compareContentFidelityMaps(leftItem, rightItem, itemPath, "assetId", reasons, func(leftID, rightID any, idPath string) {
				if !contentFidelityEmptyID(leftID) {
					compareContentFidelityExact(leftID, rightID, idPath, reasons)
					return
				}
				expected := ""
				if prefix != "" {
					expected = fmt.Sprintf("%s-%03d", prefix, counters[prefix])
				}
				if !contentFidelityEmptyID(rightID) && rightID != expected {
					addContentFidelityReason(reasons, fmt.Sprintf("%s 新增值不是稳定 ID %q", idPath, expected))
				}
			})
		}
	})
}

func compareStoryboardNormalizationV1(before, after any, reasons *[]string) {
	left, leftOK := before.(map[string]any)
	right, rightOK := after.(map[string]any)
	if !leftOK || !rightOK {
		compareContentFidelityExact(before, after, "$", reasons)
		return
	}
	compareContentFidelityMaps(left, right, "$", "shots", reasons, func(leftValue, rightValue any, path string) {
		leftShots, leftOK := leftValue.([]any)
		rightShots, rightOK := rightValue.([]any)
		if !leftOK || !rightOK {
			compareContentFidelityExact(leftValue, rightValue, path, reasons)
			return
		}
		if len(leftShots) != len(rightShots) {
			addContentFidelityReason(reasons, fmt.Sprintf("%s 数量从 %d 变为 %d", path, len(leftShots), len(rightShots)))
		}
		for index := 0; index < len(leftShots) && index < len(rightShots); index++ {
			shotPath := fmt.Sprintf("%s[%d]", path, index)
			leftShot, leftOK := leftShots[index].(map[string]any)
			rightShot, rightOK := rightShots[index].(map[string]any)
			if !leftOK || !rightOK {
				compareContentFidelityExact(leftShots[index], rightShots[index], shotPath, reasons)
				continue
			}
			compareStoryboardShotV1(leftShot, rightShot, index, shotPath, reasons)
		}
	})
}

func compareStoryboardShotV1(left, right map[string]any, index int, path string, reasons *[]string) {
	keys := make([]string, 0, len(left)+len(right))
	seen := map[string]bool{}
	for key := range left {
		seen[key] = true
		keys = append(keys, key)
	}
	for key := range right {
		if !seen[key] {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	for _, key := range keys {
		leftValue, leftExists := left[key]
		rightValue, rightExists := right[key]
		keyPath := contentFidelityPath(path, key)
		if key != "shotId" && key != "sceneKey" {
			compareContentFidelityExactPresence(leftValue, rightValue, leftExists, rightExists, keyPath, reasons)
			continue
		}
		if !leftExists {
			leftValue = nil
		}
		if !rightExists {
			rightValue = nil
		}
		expected := "scene-001"
		if key == "shotId" {
			expected = fmt.Sprintf("shot-%03d", index+1)
		}
		compareAddedStableID(leftValue, rightValue, expected, keyPath, reasons)
	}
}

func compareAddedStableID(before, after any, expected, path string, reasons *[]string) {
	if !contentFidelityEmptyID(before) {
		compareContentFidelityExact(before, after, path, reasons)
		return
	}
	if !contentFidelityEmptyID(after) && after != expected {
		addContentFidelityReason(reasons, fmt.Sprintf("%s 新增值不是稳定 ID %q", path, expected))
	}
}

func compareContentFidelityMaps(left, right map[string]any, path, specialKey string, reasons *[]string, compareSpecial func(any, any, string)) {
	keys := make([]string, 0, len(left)+len(right))
	seen := map[string]bool{}
	for key := range left {
		seen[key] = true
		keys = append(keys, key)
	}
	for key := range right {
		if !seen[key] {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	for _, key := range keys {
		leftValue, leftExists := left[key]
		rightValue, rightExists := right[key]
		keyPath := contentFidelityPath(path, key)
		if key == specialKey {
			if !leftExists {
				leftValue = nil
			}
			if !rightExists {
				rightValue = nil
			}
			compareSpecial(leftValue, rightValue, keyPath)
			continue
		}
		compareContentFidelityExactPresence(leftValue, rightValue, leftExists, rightExists, keyPath, reasons)
	}
}

func compareContentFidelityExactPresence(left, right any, leftExists, rightExists bool, path string, reasons *[]string) {
	if reasons == nil {
		return
	}
	if !leftExists || !rightExists {
		addContentFidelityReason(reasons, fmt.Sprintf("%s 字段被新增或删除", path))
		return
	}
	compareContentFidelityExact(left, right, path, reasons)
}

func compareContentFidelityExact(left, right any, path string, reasons *[]string) {
	switch leftValue := left.(type) {
	case map[string]any:
		rightValue, ok := right.(map[string]any)
		if !ok {
			addContentFidelityReason(reasons, fmt.Sprintf("%s 类型发生变化", path))
			return
		}
		compareContentFidelityMapsExact(leftValue, rightValue, path, reasons)
	case []any:
		rightValue, ok := right.([]any)
		if !ok {
			addContentFidelityReason(reasons, fmt.Sprintf("%s 类型发生变化", path))
			return
		}
		if len(leftValue) != len(rightValue) {
			addContentFidelityReason(reasons, fmt.Sprintf("%s 数量从 %d 变为 %d", path, len(leftValue), len(rightValue)))
		}
		for index := 0; index < len(leftValue) && index < len(rightValue); index++ {
			compareContentFidelityExact(leftValue[index], rightValue[index], fmt.Sprintf("%s[%d]", path, index), reasons)
		}
	default:
		leftRaw, _ := json.Marshal(left)
		rightRaw, _ := json.Marshal(right)
		if !bytes.Equal(leftRaw, rightRaw) {
			addContentFidelityReason(reasons, fmt.Sprintf("%s 值发生变化", path))
		}
	}
}

func compareContentFidelityMapsExact(left, right map[string]any, path string, reasons *[]string) {
	keys := make([]string, 0, len(left)+len(right))
	seen := map[string]bool{}
	for key := range left {
		seen[key] = true
		keys = append(keys, key)
	}
	for key := range right {
		if !seen[key] {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	for _, key := range keys {
		leftValue, leftExists := left[key]
		rightValue, rightExists := right[key]
		compareContentFidelityExactPresence(leftValue, rightValue, leftExists, rightExists, contentFidelityPath(path, key), reasons)
	}
}

func contentFidelityPath(parent, key string) string {
	valid := key != ""
	for index, char := range key {
		if (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char == '_' || (index > 0 && char >= '0' && char <= '9') {
			continue
		}
		valid = false
		break
	}
	if valid {
		return parent + "." + key
	}
	return fmt.Sprintf("%s[%q]", parent, key)
}

func contentFidelityAssetPrefix(kind any) string {
	prefixes := map[string]string{"character": "CHAR", "scene": "SCENE", "prop": "PROP", "costume": "COSTUME"}
	value, _ := kind.(string)
	return prefixes[strings.ToLower(strings.TrimSpace(value))]
}

func contentFidelityEmptyID(value any) bool {
	if value == nil {
		return true
	}
	text, ok := value.(string)
	return ok && strings.TrimSpace(text) == ""
}

func addContentFidelityReason(reasons *[]string, reason string) {
	if reasons != nil && len(*reasons) < maxContentFidelityReasons {
		*reasons = append(*reasons, reason)
	}
}

func workflowAdapterContentFidelitySummary(diff map[string]any) string {
	reasons, _ := diff["contentChangeReasons"].([]string)
	if len(reasons) == 0 {
		return "转换修改了业务内容"
	}
	return strings.Join(reasons, "；")
}
