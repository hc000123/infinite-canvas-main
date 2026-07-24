package service

import (
	"encoding/json"
	"path"
	"sort"
	"strings"
)

const (
	workflowSkillMaxFiles        = 32
	workflowSkillMaxFileBytes    = 64 << 10
	workflowSkillMaxPackageBytes = 128 << 10
)

func validateWorkflowSkillFiles(files map[string]string) (map[string]string, error) {
	normalizedFiles := make(map[string]string, len(files))
	totalBytes := 0
	for logicalPath, content := range files {
		logicalPath = strings.ReplaceAll(strings.TrimSpace(logicalPath), "\\", "/")
		cleaned := path.Clean(logicalPath)
		if logicalPath == "" || strings.HasPrefix(logicalPath, "/") || cleaned != logicalPath || cleaned == ".." || strings.HasPrefix(cleaned, "../") {
			return nil, safeMessageError{message: "Skill 文件路径不安全"}
		}
		extension := strings.ToLower(path.Ext(cleaned))
		if extension != ".md" && extension != ".json" {
			return nil, safeMessageError{message: "Skill 只允许 Markdown 或 JSON 文件"}
		}
		normalized := normalizeWorkflowSkillText(content)
		if len(normalized) > workflowSkillMaxFileBytes {
			return nil, safeMessageError{message: "Skill 单个文件不能超过 64 KiB"}
		}
		if extension == ".json" && !json.Valid([]byte(normalized)) {
			return nil, safeMessageError{message: "Skill JSON 文件格式不正确"}
		}
		totalBytes += len(normalized)
		if totalBytes > workflowSkillMaxPackageBytes {
			return nil, safeMessageError{message: "Skill 文件总量不能超过 128 KiB"}
		}
		normalizedFiles[cleaned] = normalized
	}
	if len(normalizedFiles) > workflowSkillMaxFiles {
		return nil, safeMessageError{message: "Skill 文件不能超过 32 个"}
	}
	if strings.TrimSpace(normalizedFiles["SKILL.md"]) == "" {
		return nil, safeMessageError{message: "Skill 必须包含非空 SKILL.md"}
	}
	return normalizedFiles, nil
}

func workflowSkillPackageInstructions(files map[string]string) string {
	names := make([]string, 0, len(files))
	for name := range files {
		names = append(names, name)
	}
	sort.Slice(names, func(left int, right int) bool {
		leftRank, rightRank := workflowSkillFileRank(names[left]), workflowSkillFileRank(names[right])
		if leftRank != rightRank {
			return leftRank < rightRank
		}
		return names[left] < names[right]
	})
	sections := make([]string, 0, len(names))
	for _, name := range names {
		sections = append(sections, "【Skill 文件："+name+"】\n"+strings.TrimSpace(files[name]))
	}
	return strings.Join(sections, "\n\n")
}

func workflowSkillFileRank(name string) int {
	switch {
	case name == "SKILL.md":
		return 0
	case strings.HasPrefix(name, "rules/"):
		return 1
	case strings.HasPrefix(name, "templates/"):
		return 2
	case strings.HasPrefix(name, "examples/"):
		return 3
	default:
		return 4
	}
}
