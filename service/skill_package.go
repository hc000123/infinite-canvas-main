package service

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"path"
	"sort"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/santhosh-tekuri/jsonschema/v5"
)

const (
	skillMaxFiles        = 32
	skillMaxFileBytes    = 64 << 10
	skillMaxPackageBytes = 128 << 10
)

type SkillImagePolicy struct {
	Required          bool     `json:"required"`
	Min               int      `json:"min"`
	Max               int      `json:"max"`
	AllowTextFallback bool     `json:"allowTextFallback"`
	AllowedTypes      []string `json:"allowedTypes"`
}

type SkillInputContract struct {
	RequiredInputs []string         `json:"requiredInputs"`
	ImagePolicy    SkillImagePolicy `json:"imagePolicy"`
}

type SkillOutputContract struct {
	SchemaVersion string         `json:"schemaVersion"`
	Schema        map[string]any `json:"schema"`
}

type SkillPackage struct {
	Manifest           SkillManifest       `json:"manifest"`
	Files              map[string]string   `json:"files"`
	InputContract      SkillInputContract  `json:"inputContract"`
	OutputContract     SkillOutputContract `json:"outputContract"`
	QualityGateProfile []string            `json:"qualityGateProfile"`
	ContentHash        string              `json:"contentHash"`
}

func NormalizeSkillPackage(value SkillPackage) (SkillPackage, error) {
	manifest, err := normalizeSkillManifest(value.Manifest)
	if err != nil {
		return SkillPackage{}, err
	}
	files, err := normalizeSkillFiles(value.Files)
	if err != nil {
		return SkillPackage{}, err
	}
	inputContract, err := normalizeSkillInputContract(value.InputContract)
	if err != nil {
		return SkillPackage{}, err
	}
	outputContract, err := normalizeSkillOutputContract(value.OutputContract)
	if err != nil {
		return SkillPackage{}, err
	}
	gates, err := normalizeSkillTokens(value.QualityGateProfile, "质量门", true)
	if err != nil {
		return SkillPackage{}, err
	}
	if !containsSkillToken(gates, "schema") {
		return SkillPackage{}, safeMessageError{message: "Skill 必须启用 schema 质量门"}
	}
	normalized := SkillPackage{Manifest: manifest, Files: files, InputContract: inputContract, OutputContract: outputContract, QualityGateProfile: gates}
	normalized.ContentHash = skillPackageHash(normalized)
	return normalized, nil
}

func DecodeSkillPackage(version model.SkillVersion) (SkillPackage, error) {
	var value SkillPackage
	if json.Unmarshal([]byte(version.ManifestJSON), &value.Manifest) != nil ||
		json.Unmarshal([]byte(version.FilesJSON), &value.Files) != nil ||
		json.Unmarshal([]byte(version.InputContractJSON), &value.InputContract) != nil ||
		json.Unmarshal([]byte(version.OutputContractJSON), &value.OutputContract) != nil ||
		json.Unmarshal([]byte(version.QualityGateProfileJSON), &value.QualityGateProfile) != nil {
		return SkillPackage{}, safeMessageError{message: "Skill 版本内容损坏"}
	}
	normalized, err := NormalizeSkillPackage(value)
	if err != nil {
		return SkillPackage{}, err
	}
	if normalized.ContentHash != version.ContentHash {
		return SkillPackage{}, safeMessageError{message: "Skill 内容哈希不一致"}
	}
	return normalized, nil
}

func normalizeSkillInputContract(value SkillInputContract) (SkillInputContract, error) {
	seen := map[string]bool{}
	inputs := make([]string, 0, len(value.RequiredInputs))
	for _, input := range value.RequiredInputs {
		input = strings.TrimSpace(input)
		if !skillRequiredInputPattern.MatchString(input) || seen[input] {
			return value, safeMessageError{message: "Skill 包含未知或重复的必需输入"}
		}
		seen[input] = true
		inputs = append(inputs, input)
	}
	if len(inputs) == 0 {
		return value, safeMessageError{message: "Skill 必须声明必需输入"}
	}
	sort.Strings(inputs)
	value.RequiredInputs = inputs
	if value.ImagePolicy.Min < 0 || value.ImagePolicy.Max < value.ImagePolicy.Min || value.ImagePolicy.Max > 9 {
		return value, safeMessageError{message: "图片契约必须限制在 0–9 张"}
	}
	if value.ImagePolicy.Required && (value.ImagePolicy.Min == 0 || value.ImagePolicy.AllowTextFallback) {
		return value, safeMessageError{message: "必需图片契约必须设置最少图片且禁止无图降级"}
	}
	allowed := map[string]bool{"image/png": true, "image/jpeg": true, "image/webp": true}
	types := make([]string, 0, len(value.ImagePolicy.AllowedTypes))
	seenTypes := map[string]bool{}
	for _, mimeType := range value.ImagePolicy.AllowedTypes {
		mimeType = strings.ToLower(strings.TrimSpace(mimeType))
		if !allowed[mimeType] || seenTypes[mimeType] {
			return value, safeMessageError{message: "图片契约包含未知或重复格式"}
		}
		seenTypes[mimeType] = true
		types = append(types, mimeType)
	}
	if value.ImagePolicy.Max > 0 && len(types) == 0 {
		return value, safeMessageError{message: "允许图片时必须声明图片格式"}
	}
	if value.ImagePolicy.Max == 0 && len(types) > 0 {
		return value, safeMessageError{message: "禁止图片时不能声明图片格式"}
	}
	sort.Strings(types)
	value.ImagePolicy.AllowedTypes = types
	return value, nil
}

func normalizeSkillOutputContract(value SkillOutputContract) (SkillOutputContract, error) {
	value.SchemaVersion = strings.TrimSpace(value.SchemaVersion)
	if !skillSemanticVersionRegexp.MatchString(value.SchemaVersion) {
		return value, safeMessageError{message: "输出 Schema 版本必须使用语义化版本"}
	}
	if _, err := compileSkillOutputSchema(value); err != nil {
		return value, safeMessageError{message: "输出 Schema 无效：" + err.Error()}
	}
	return value, nil
}

func compileSkillOutputSchema(contract SkillOutputContract) (*jsonschema.Schema, error) {
	if len(contract.Schema) == 0 {
		return nil, fmt.Errorf("缺少输出 Schema")
	}
	raw, err := json.Marshal(contract.Schema)
	if err != nil {
		return nil, err
	}
	return jsonschema.CompileString("skill-output-schema.json", string(raw))
}

func normalizeSkillFiles(files map[string]string) (map[string]string, error) {
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
		if _, exists := normalizedFiles[cleaned]; exists {
			return nil, safeMessageError{message: "Skill 文件路径重复"}
		}
		normalized := normalizeSkillText(content)
		if len(normalized) > skillMaxFileBytes {
			return nil, safeMessageError{message: "Skill 单个文件不能超过 64 KiB"}
		}
		if extension == ".json" && !json.Valid([]byte(normalized)) {
			return nil, safeMessageError{message: "Skill JSON 文件格式不正确"}
		}
		totalBytes += len(normalized)
		if totalBytes > skillMaxPackageBytes {
			return nil, safeMessageError{message: "Skill 文件总量不能超过 128 KiB"}
		}
		normalizedFiles[cleaned] = normalized
	}
	if len(normalizedFiles) > skillMaxFiles {
		return nil, safeMessageError{message: "Skill 文件不能超过 32 个"}
	}
	if strings.TrimSpace(normalizedFiles["SKILL.md"]) == "" {
		return nil, safeMessageError{message: "Skill 必须包含非空 SKILL.md"}
	}
	return normalizedFiles, nil
}

func normalizeSkillText(value string) string {
	value = strings.ReplaceAll(value, "\r\n", "\n")
	lines := strings.Split(value, "\n")
	for index := range lines {
		lines[index] = strings.TrimRight(lines[index], " \t")
	}
	return strings.TrimSpace(strings.Join(lines, "\n")) + "\n"
}

func skillPackageHash(value SkillPackage) string {
	keys := make([]string, 0, len(value.Files))
	for key := range value.Files {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	orderedFiles := make([][2]string, 0, len(keys))
	for _, key := range keys {
		orderedFiles = append(orderedFiles, [2]string{key, value.Files[key]})
	}
	payload, _ := json.Marshal(struct {
		Manifest           SkillManifest       `json:"manifest"`
		Files              [][2]string         `json:"files"`
		InputContract      SkillInputContract  `json:"inputContract"`
		OutputContract     SkillOutputContract `json:"outputContract"`
		QualityGateProfile []string            `json:"qualityGateProfile"`
	}{value.Manifest, orderedFiles, value.InputContract, value.OutputContract, value.QualityGateProfile})
	hash := sha256.Sum256(payload)
	return hex.EncodeToString(hash[:])
}

func SkillPackageInstructions(files map[string]string) string {
	names := make([]string, 0, len(files))
	for name := range files {
		names = append(names, name)
	}
	sort.Slice(names, func(left, right int) bool {
		leftRank, rightRank := skillFileRank(names[left]), skillFileRank(names[right])
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

func skillFileRank(name string) int {
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
