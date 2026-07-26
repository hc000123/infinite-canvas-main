package service

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"path"
	"sort"
	"strings"

	"github.com/Masterminds/semver/v3"
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

type ArtifactInputSpec struct {
	BindingName      string `json:"bindingName"`
	ArtifactType     string `json:"artifactType"`
	Required         bool   `json:"required"`
	Min              int    `json:"min"`
	Max              int    `json:"max"`
	SchemaConstraint string `json:"schemaConstraint"`
	RequiresApproval bool   `json:"requiresApproval"`
}

type ArtifactOutputSpec struct {
	BindingName   string `json:"bindingName"`
	ArtifactType  string `json:"artifactType"`
	Min           int    `json:"min"`
	Max           int    `json:"max"`
	SchemaVersion string `json:"schemaVersion"`
}

type SkillInputContract struct {
	RequiredInputs []string            `json:"requiredInputs"`
	ArtifactInputs []ArtifactInputSpec `json:"artifactInputs,omitempty"`
	ImagePolicy    SkillImagePolicy    `json:"imagePolicy"`
}

type SkillOutputContract struct {
	SchemaVersion   string               `json:"schemaVersion"`
	Schema          map[string]any       `json:"schema"`
	ArtifactOutputs []ArtifactOutputSpec `json:"artifactOutputs,omitempty"`
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

func ValidateInvocableSkillPackage(value SkillPackage) (SkillPackage, error) {
	normalized, err := NormalizeSkillPackage(value)
	if err != nil {
		return SkillPackage{}, err
	}
	if normalized.Manifest.ExecutorKind != "text_model" {
		return SkillPackage{}, safeMessageError{message: "Skill 执行器无效"}
	}
	if err := validateInvocationSkillGateProfile(normalized.QualityGateProfile); err != nil {
		return SkillPackage{}, safeMessageError{message: err.Error()}
	}
	if len(normalized.InputContract.ArtifactInputs) == 0 || len(normalized.OutputContract.ArtifactOutputs) == 0 {
		return SkillPackage{}, safeMessageError{message: "可调用 Skill 必须声明 Artifact 输入和输出绑定"}
	}
	boundInputTypes := map[string]bool{}
	for _, input := range normalized.InputContract.ArtifactInputs {
		if !containsSkillToken(normalized.Manifest.InputArtifactTypes, input.ArtifactType) {
			return SkillPackage{}, safeMessageError{message: "Artifact 输入绑定类型必须在 Manifest 中声明"}
		}
		boundInputTypes[input.ArtifactType] = true
	}
	for _, artifactType := range normalized.Manifest.InputArtifactTypes {
		if !boundInputTypes[artifactType] {
			return SkillPackage{}, safeMessageError{message: "Manifest 输入 Artifact 类型缺少绑定"}
		}
	}
	boundOutputTypes := map[string]bool{}
	for _, output := range normalized.OutputContract.ArtifactOutputs {
		if !containsSkillToken(normalized.Manifest.OutputArtifactTypes, output.ArtifactType) {
			return SkillPackage{}, safeMessageError{message: "Artifact 输出绑定类型必须在 Manifest 中声明"}
		}
		boundOutputTypes[output.ArtifactType] = true
	}
	for _, artifactType := range normalized.Manifest.OutputArtifactTypes {
		if !boundOutputTypes[artifactType] {
			return SkillPackage{}, safeMessageError{message: "Manifest 输出 Artifact 类型缺少绑定"}
		}
	}
	return normalized, nil
}

// ValidateSkillArtifactContracts validates registry-dependent invocation
// contracts without requiring a Skill schema to be byte-identical to a core
// schema. Completion validates output against both frozen schemas.
func ValidateSkillArtifactContracts(value SkillPackage) error {
	for _, input := range value.InputContract.ArtifactInputs {
		if _, err := semver.NewConstraint(strings.TrimSpace(input.SchemaConstraint)); err != nil {
			return safeMessageError{message: "Artifact 输入 Schema 兼容范围无效"}
		}
	}
	for _, output := range value.OutputContract.ArtifactOutputs {
		schema, err := ResolveArtifactSchema(output.ArtifactType, output.SchemaVersion)
		if err != nil {
			if strings.Contains(err.Error(), "不存在") || strings.Contains(err.Error(), "哈希") || strings.Contains(err.Error(), "损坏") {
				return safeMessageError{message: "Artifact 输出缺少已注册 Core Schema"}
			}
			return err
		}
		if !schema.Core {
			return safeMessageError{message: "Artifact 输出缺少已注册 Core Schema"}
		}
	}
	if _, err := compileSkillOutputSchema(value.OutputContract); err != nil {
		return safeMessageError{message: "Skill 输出 Schema 无效：" + err.Error()}
	}
	return nil
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
	if value.ArtifactInputs != nil {
		artifactInputs, err := normalizeArtifactInputSpecs(value.ArtifactInputs)
		if err != nil {
			return value, err
		}
		value.ArtifactInputs = artifactInputs
	}
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
	if value.ArtifactOutputs != nil {
		artifactOutputs, err := normalizeArtifactOutputSpecs(value.ArtifactOutputs)
		if err != nil {
			return value, err
		}
		value.ArtifactOutputs = artifactOutputs
	}
	return value, nil
}

func normalizeArtifactInputSpecs(values []ArtifactInputSpec) ([]ArtifactInputSpec, error) {
	seen := map[string]bool{}
	result := make([]ArtifactInputSpec, 0, len(values))
	for _, value := range values {
		value.BindingName = strings.ToLower(strings.TrimSpace(value.BindingName))
		value.ArtifactType = strings.ToLower(strings.TrimSpace(value.ArtifactType))
		value.SchemaConstraint = strings.Join(strings.Fields(value.SchemaConstraint), " ")
		if !skillManifestTokenPattern.MatchString(value.BindingName) || seen[value.BindingName] {
			return nil, safeMessageError{message: "Artifact 输入绑定名称无效或重复"}
		}
		if !skillManifestTokenPattern.MatchString(value.ArtifactType) {
			return nil, safeMessageError{message: "Artifact 输入类型无效"}
		}
		if value.Min < 0 || value.Max < 1 || value.Min > value.Max || (value.Required && value.Min < 1) {
			return nil, safeMessageError{message: "Artifact 输入基数无效"}
		}
		if !skillCompatibilityPattern.MatchString(value.SchemaConstraint) {
			return nil, safeMessageError{message: "Artifact 输入 Schema 兼容范围无效"}
		}
		seen[value.BindingName] = true
		result = append(result, value)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].BindingName < result[j].BindingName })
	return result, nil
}

func normalizeArtifactOutputSpecs(values []ArtifactOutputSpec) ([]ArtifactOutputSpec, error) {
	seen := map[string]bool{}
	result := make([]ArtifactOutputSpec, 0, len(values))
	for _, value := range values {
		value.BindingName = strings.ToLower(strings.TrimSpace(value.BindingName))
		value.ArtifactType = strings.ToLower(strings.TrimSpace(value.ArtifactType))
		value.SchemaVersion = strings.TrimSpace(value.SchemaVersion)
		if !skillManifestTokenPattern.MatchString(value.BindingName) || seen[value.BindingName] {
			return nil, safeMessageError{message: "Artifact 输出绑定名称无效或重复"}
		}
		if !skillManifestTokenPattern.MatchString(value.ArtifactType) {
			return nil, safeMessageError{message: "Artifact 输出类型无效"}
		}
		if value.Min < 0 || value.Max < 1 || value.Min > value.Max {
			return nil, safeMessageError{message: "Artifact 输出基数无效"}
		}
		if !skillSemanticVersionRegexp.MatchString(value.SchemaVersion) {
			return nil, safeMessageError{message: "Artifact 输出 Schema 版本无效"}
		}
		seen[value.BindingName] = true
		result = append(result, value)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].BindingName < result[j].BindingName })
	return result, nil
}

func compileSkillOutputSchema(contract SkillOutputContract) (*jsonschema.Schema, error) {
	if len(contract.Schema) == 0 {
		return nil, fmt.Errorf("缺少输出 Schema")
	}
	raw, err := json.Marshal(contract.Schema)
	if err != nil {
		return nil, err
	}
	return compileLocalJSONSchema("skill-output-schema.json", raw)
}

func appendSkillSchemaIssues(content []byte, contract SkillOutputContract, report *WorkflowGateReport) {
	schema, err := compileSkillOutputSchema(contract)
	if err != nil {
		report.add("output_schema", "输出 Schema 无效："+err.Error(), "")
		return
	}
	var value any
	if err := json.Unmarshal(content, &value); err != nil {
		report.add("output_schema", "产物无法按输出 Schema 校验："+err.Error(), "")
		return
	}
	if err := schema.Validate(value); err != nil {
		report.add("output_schema", "产物不符合输出 Schema："+err.Error(), "")
	}
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
