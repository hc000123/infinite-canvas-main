package service

import (
	"encoding/json"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
)

const currentSkillStageTemplateVersion = "1.0.0"

type SkillStageTemplate struct {
	Key             string             `json:"key"`
	TemplateVersion string             `json:"templateVersion"`
	Label           string             `json:"label"`
	Description     string             `json:"description"`
	ExecutorKind    string             `json:"executorKind"`
	Capability      string             `json:"capability"`
	InputTypes      []string           `json:"inputTypes"`
	OutputType      string             `json:"outputType"`
	OutputMin       int                `json:"outputMin"`
	OutputMax       int                `json:"outputMax"`
	FixedAdapter    WorkflowAdapterRef `json:"fixedAdapter"`
}

var workflowStageTemplateLabels = map[string][2]string{
	WorkflowSkillStageScript:     {"剧本整理", "把内容文本整理为可制作的生产剧本。"},
	WorkflowSkillStageArt:        {"资产提取", "从生产剧本提取角色、场景、道具和造型事实。"},
	WorkflowSkillStageAssets:     {"资产制作 Brief", "把资产事实转成可执行的资产制作说明。"},
	WorkflowSkillStageStoryboard: {"分镜制作", "把生产剧本和资产引用拆成结构化镜头。"},
	WorkflowSkillStageVideo:      {"视频提示词", "把分镜与实际参考素材组合为视频提示词。"},
	WorkflowSkillStageDelivery:   {"交付审核", "汇总生成结果、失败项和交付清单。"},
}

var registeredSkillStageTemplates = buildSkillStageTemplateRegistry()
var currentSkillStageTemplateVersions = buildCurrentSkillStageTemplateVersions()

func buildSkillStageTemplateRegistry() []SkillStageTemplate {
	result := make([]SkillStageTemplate, 0, len(systemSkillSeedStageKeys)+len(capabilitySkillSeeds()))
	for _, key := range systemSkillSeedStageKeys {
		artifacts := workflowSkillSeedArtifacts[key]
		label := workflowStageTemplateLabels[key]
		outputMax := 1
		if key == WorkflowSkillStageAssets {
			outputMax = 300
		}
		result = append(result, SkillStageTemplate{
			Key: key, TemplateVersion: currentSkillStageTemplateVersion, Label: label[0], Description: label[1], ExecutorKind: "text_model",
			Capability: "workflow.stage." + key, InputTypes: append([]string(nil), artifacts.Inputs...), OutputType: artifacts.Outputs[0], OutputMin: 1, OutputMax: outputMax,
			FixedAdapter: WorkflowAdapterRef{AdapterID: "stage-" + key + "-normalize", AdapterVersion: "1.0.0", TransformKind: "stage-" + key + "-normalize-v1"},
		})
	}
	for _, seed := range capabilitySkillSeeds() {
		executorKind := seed.ExecutorKind
		if executorKind == "" {
			executorKind = "text_model"
		}
		inputs := make([]string, 0, len(seed.Inputs))
		for _, input := range seed.Inputs {
			inputs = append(inputs, input.ArtifactType)
		}
		result = append(result, SkillStageTemplate{
			Key: seed.Key, TemplateVersion: currentSkillStageTemplateVersion, Label: seed.Name, Description: seed.Summary, ExecutorKind: executorKind,
			Capability: seed.Capabilities[0], InputTypes: inputs, OutputType: seed.Output.ArtifactType, OutputMin: seed.Output.Min, OutputMax: seed.Output.Max,
			FixedAdapter: WorkflowAdapterRef{AdapterID: "stage-" + seed.Key + "-normalize", AdapterVersion: "1.0.0", TransformKind: "stage-" + seed.Key + "-normalize-v1"},
		})
	}
	return result
}

func buildCurrentSkillStageTemplateVersions() map[string]string {
	result := make(map[string]string, len(systemSkillSeedStageKeys)+len(capabilitySkillSeeds()))
	for _, key := range systemSkillSeedStageKeys {
		result[key] = currentSkillStageTemplateVersion
	}
	for _, seed := range capabilitySkillSeeds() {
		result[seed.Key] = currentSkillStageTemplateVersion
	}
	return result
}

func freezeSkillStageTemplate(template SkillStageTemplate) (SkillStageTemplate, error) {
	definition, err := normalizeWorkflowAdapterDefinition(stageWorkflowAdapter(template))
	if err != nil {
		return SkillStageTemplate{}, safeMessageError{message: "Skill 冻结 Adapter 行为实现未注册"}
	}
	template.FixedAdapter.ContentHash = definition.ContentHash
	return template, nil
}

func ListSkillStageTemplates() []SkillStageTemplate {
	result := make([]SkillStageTemplate, 0, len(currentSkillStageTemplateVersions))
	seen := map[string]bool{}
	for _, template := range registeredSkillStageTemplates {
		if seen[template.Key] || currentSkillStageTemplateVersions[template.Key] == "" {
			continue
		}
		seen[template.Key] = true
		frozen, err := resolveSkillStageTemplateVersion(template.Key, currentSkillStageTemplateVersions[template.Key])
		if err == nil {
			result = append(result, frozen)
		}
	}
	return result
}

func ResolveSkillStageTemplate(key string) (SkillStageTemplate, error) {
	key = strings.ToLower(strings.TrimSpace(key))
	version := currentSkillStageTemplateVersions[key]
	if version != "" {
		return resolveSkillStageTemplateVersion(key, version)
	}
	return SkillStageTemplate{}, safeMessageError{message: "Skill 所属阶段不存在"}
}

func resolveSkillStageTemplateVersion(key, version string) (SkillStageTemplate, error) {
	key, version = strings.ToLower(strings.TrimSpace(key)), strings.TrimSpace(version)
	var matched *SkillStageTemplate
	for _, item := range registeredSkillStageTemplates {
		if item.Key == key && item.TemplateVersion == version {
			if matched != nil {
				return SkillStageTemplate{}, safeMessageError{message: "Skill 阶段模板版本重复注册"}
			}
			copyValue := item
			matched = &copyValue
		}
	}
	if matched != nil {
		return freezeSkillStageTemplate(*matched)
	}
	return SkillStageTemplate{}, safeMessageError{message: "Skill 冻结阶段模板精确版本未注册"}
}

type importedSkillStageMetadata struct {
	StageKey             string             `json:"stageKey"`
	StageTemplateVersion string             `json:"stageTemplateVersion"`
	FixedAdapter         WorkflowAdapterRef `json:"fixedAdapter"`
	RawSchemaVersion     string             `json:"rawSchemaVersion"`
	RawSchemaContentHash string             `json:"rawSchemaContentHash"`
}

func ResolveImportedSkillStageSnapshot(version model.SkillVersion, frozenPackages ...SkillPackage) (SkillStageTemplate, error) {
	if version.SourceKind != "folder_import" {
		return SkillStageTemplate{}, safeMessageError{message: "Skill 版本不是文件夹导入快照"}
	}
	var snapshot importedSkillStageMetadata
	if strings.TrimSpace(version.ImportMetadataJSON) == "" || json.Unmarshal([]byte(version.ImportMetadataJSON), &snapshot) != nil || strings.TrimSpace(snapshot.StageKey) == "" || strings.TrimSpace(snapshot.StageTemplateVersion) == "" || strings.TrimSpace(snapshot.FixedAdapter.AdapterID) == "" || strings.TrimSpace(snapshot.FixedAdapter.AdapterVersion) == "" || strings.TrimSpace(snapshot.FixedAdapter.TransformKind) == "" || strings.TrimSpace(snapshot.FixedAdapter.ContentHash) == "" || snapshot.RawSchemaVersion != importedSkillRawSchemaVersion || snapshot.RawSchemaContentHash == "" {
		return SkillStageTemplate{}, safeMessageError{message: "Skill 导入阶段快照缺失或损坏"}
	}
	template, err := resolveSkillStageTemplateVersion(snapshot.StageKey, snapshot.StageTemplateVersion)
	if err != nil {
		return SkillStageTemplate{}, err
	}
	if template.FixedAdapter.AdapterID != snapshot.FixedAdapter.AdapterID || template.FixedAdapter.AdapterVersion != snapshot.FixedAdapter.AdapterVersion || template.FixedAdapter.TransformKind != snapshot.FixedAdapter.TransformKind {
		return SkillStageTemplate{}, safeMessageError{message: "Skill 冻结 Adapter 与阶段模板不匹配"}
	}
	definition, err := ResolveWorkflowAdapter(snapshot.FixedAdapter)
	if err != nil || definition.ContentHash != snapshot.FixedAdapter.ContentHash {
		return SkillStageTemplate{}, safeMessageError{message: "Skill 冻结 Adapter 精确版本或哈希已失效"}
	}
	template.FixedAdapter = snapshot.FixedAdapter
	var packageValue SkillPackage
	if len(frozenPackages) == 1 {
		packageValue = frozenPackages[0]
	} else if len(frozenPackages) == 0 {
		packageValue, err = DecodeSkillPackage(version)
	} else {
		err = safeMessageError{message: "Skill 冻结 SkillPackage 参数无效"}
	}
	if err != nil {
		return SkillStageTemplate{}, err
	}
	if packageValue.OutputContract.SchemaVersion != snapshot.RawSchemaVersion || importedSkillRawSchemaHash(packageValue.OutputContract.Schema) != snapshot.RawSchemaContentHash {
		return SkillStageTemplate{}, safeMessageError{message: "Skill 冻结 raw Schema 版本或哈希已失效"}
	}
	if !importedSkillStageMatchesPackage(template, packageValue) {
		return SkillStageTemplate{}, safeMessageError{message: "Skill 导入阶段快照与冻结 SkillPackage 不一致"}
	}
	return template, nil
}

func importedSkillStageMatchesPackage(template SkillStageTemplate, packageValue SkillPackage) bool {
	if packageValue.Manifest.ExecutorKind != template.ExecutorKind || !containsSkillToken(packageValue.Manifest.Capabilities, template.Capability) || !sameSkillTokens(packageValue.Manifest.InputArtifactTypes, template.InputTypes) || len(packageValue.Manifest.OutputArtifactTypes) != 1 || packageValue.Manifest.OutputArtifactTypes[0] != template.OutputType || len(packageValue.OutputContract.ArtifactOutputs) != 1 {
		return false
	}
	output := packageValue.OutputContract.ArtifactOutputs[0]
	return output.ArtifactType == template.OutputType && output.Min == template.OutputMin && output.Max == template.OutputMax
}

func sameSkillTokens(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for _, value := range left {
		if !containsSkillToken(right, value) {
			return false
		}
	}
	return true
}

func BuildImportedSkillPackage(key string, files map[string]string) (SkillPackage, error) {
	template, err := ResolveSkillStageTemplate(key)
	if err != nil {
		return SkillPackage{}, err
	}
	for _, stageKey := range systemSkillSeedStageKeys {
		if stageKey == template.Key {
			return buildInvocationWorkflowSkillSeedPackageForSource(stageKey, files, "folder_import")
		}
	}
	for _, seed := range capabilitySkillSeeds() {
		if seed.Key == template.Key {
			return buildCapabilitySkillPackageForSource(seed, files, "folder_import")
		}
	}
	return SkillPackage{}, safeMessageError{message: "Skill 所属阶段没有运行模板"}
}
