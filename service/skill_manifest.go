package service

import (
	"regexp"
	"sort"
	"strings"
)

type SkillManifest struct {
	Capabilities        []string          `json:"capabilities"`
	InputArtifactTypes  []string          `json:"inputArtifactTypes"`
	OutputArtifactTypes []string          `json:"outputArtifactTypes"`
	ProjectTags         []string          `json:"projectTags"`
	SchemaCompatibility map[string]string `json:"schemaCompatibility"`
	SideEffects         []string          `json:"sideEffects"`
	EstimatedCostClass  string            `json:"estimatedCostClass"`
	ExecutorKind        string            `json:"executorKind,omitempty"`
	RequiredTools       []string          `json:"requiredTools,omitempty"`
}

var (
	skillManifestTokenPattern  = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]*$`)
	skillCompatibilityPattern  = regexp.MustCompile(`^(?:>=|>|=)?[0-9]+\.[0-9]+(?:\.[0-9]+)?(?:[[:space:]]+(?:<=|<)[0-9]+\.[0-9]+(?:\.[0-9]+)?)?$`)
	skillRequiredInputPattern  = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9._-]*$`)
	skillSemanticVersionRegexp = regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+$`)
)

var skillCostClasses = map[string]bool{
	"none": true, "text_low": true, "text_high": true, "image": true, "video": true,
}

var skillSideEffects = map[string]bool{
	"none": true, "read": true, "write": true, "image_generation": true,
	"video_generation": true, "external_tool": true, "batch": true,
}

func normalizeSkillManifest(value SkillManifest) (SkillManifest, error) {
	var err error
	if value.Capabilities, err = normalizeSkillTokens(value.Capabilities, "capabilities", true); err != nil {
		return value, err
	}
	if value.InputArtifactTypes, err = normalizeSkillTokens(value.InputArtifactTypes, "输入 Artifact 类型", true); err != nil {
		return value, err
	}
	if value.OutputArtifactTypes, err = normalizeSkillTokens(value.OutputArtifactTypes, "输出 Artifact 类型", true); err != nil {
		return value, err
	}
	if value.ProjectTags, err = normalizeSkillTokens(value.ProjectTags, "项目标签", false); err != nil {
		return value, err
	}
	if value.SideEffects, err = normalizeSkillTokens(value.SideEffects, "副作用", true); err != nil {
		return value, err
	}
	for _, effect := range value.SideEffects {
		if !skillSideEffects[effect] {
			return value, safeMessageError{message: "Skill 包含未知副作用声明"}
		}
	}
	if len(value.SideEffects) > 1 && containsSkillToken(value.SideEffects, "none") {
		return value, safeMessageError{message: "Skill 的 none 副作用不能与其他副作用同时声明"}
	}
	value.EstimatedCostClass = strings.TrimSpace(value.EstimatedCostClass)
	if !skillCostClasses[value.EstimatedCostClass] {
		return value, safeMessageError{message: "Skill 成本等级无效"}
	}
	value.ExecutorKind = strings.ToLower(strings.TrimSpace(value.ExecutorKind))
	if value.RequiredTools != nil {
		value.RequiredTools, err = normalizeSkillTokens(value.RequiredTools, "工具 ID", false)
		if err != nil {
			return value, err
		}
	}
	compatibility := make(map[string]string, len(value.SchemaCompatibility))
	for key, versionRange := range value.SchemaCompatibility {
		key = strings.TrimSpace(key)
		versionRange = strings.Join(strings.Fields(versionRange), " ")
		if !skillManifestTokenPattern.MatchString(key) || !containsSkillToken(value.InputArtifactTypes, key) {
			return value, safeMessageError{message: "Schema 兼容声明必须对应输入 Artifact 类型"}
		}
		if !skillCompatibilityPattern.MatchString(versionRange) {
			return value, safeMessageError{message: "Schema 兼容范围无效"}
		}
		compatibility[key] = versionRange
	}
	for _, artifactType := range value.InputArtifactTypes {
		if compatibility[artifactType] == "" {
			return value, safeMessageError{message: "每个输入 Artifact 都必须声明 Schema 兼容范围"}
		}
	}
	value.SchemaCompatibility = compatibility
	return value, nil
}

func normalizeSkillTokens(values []string, label string, required bool) ([]string, error) {
	seen := map[string]bool{}
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.ToLower(strings.TrimSpace(value))
		if !skillManifestTokenPattern.MatchString(value) {
			return nil, safeMessageError{message: "Skill " + label + " 格式无效"}
		}
		if !seen[value] {
			seen[value] = true
			result = append(result, value)
		}
	}
	if required && len(result) == 0 {
		return nil, safeMessageError{message: "Skill 必须声明 " + label}
	}
	sort.Strings(result)
	return result, nil
}

func containsSkillToken(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
