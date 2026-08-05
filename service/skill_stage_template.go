package service

import "strings"

type SkillStageTemplate struct {
	Key          string             `json:"key"`
	Label        string             `json:"label"`
	Description  string             `json:"description"`
	ExecutorKind string             `json:"executorKind"`
	Capability   string             `json:"capability"`
	InputTypes   []string           `json:"inputTypes"`
	OutputType   string             `json:"outputType"`
	FixedAdapter WorkflowAdapterRef `json:"fixedAdapter"`
}

var workflowStageTemplateLabels = map[string][2]string{
	WorkflowSkillStageScript:     {"剧本整理", "把内容文本整理为可制作的生产剧本。"},
	WorkflowSkillStageArt:        {"资产提取", "从生产剧本提取角色、场景、道具和造型事实。"},
	WorkflowSkillStageAssets:     {"资产制作 Brief", "把资产事实转成可执行的资产制作说明。"},
	WorkflowSkillStageStoryboard: {"分镜制作", "把生产剧本和资产引用拆成结构化镜头。"},
	WorkflowSkillStageVideo:      {"视频提示词", "把分镜与实际参考素材组合为视频提示词。"},
	WorkflowSkillStageDelivery:   {"交付审核", "汇总生成结果、失败项和交付清单。"},
}

func ListSkillStageTemplates() []SkillStageTemplate {
	result := make([]SkillStageTemplate, 0, len(systemSkillSeedStageKeys)+len(capabilitySkillSeeds()))
	for _, key := range systemSkillSeedStageKeys {
		artifacts := workflowSkillSeedArtifacts[key]
		label := workflowStageTemplateLabels[key]
		result = append(result, SkillStageTemplate{
			Key: key, Label: label[0], Description: label[1], ExecutorKind: "text_model",
			Capability: "workflow.stage." + key, InputTypes: append([]string(nil), artifacts.Inputs...), OutputType: artifacts.Outputs[0],
			FixedAdapter: WorkflowAdapterRef{AdapterID: "stage-" + key + "-normalize", AdapterVersion: "1.0.0"},
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
			Key: seed.Key, Label: seed.Name, Description: seed.Summary, ExecutorKind: executorKind,
			Capability: seed.Capabilities[0], InputTypes: inputs, OutputType: seed.Output.ArtifactType,
			FixedAdapter: WorkflowAdapterRef{AdapterID: "stage-" + seed.Key + "-normalize", AdapterVersion: "1.0.0"},
		})
	}
	return result
}

func ResolveSkillStageTemplate(key string) (SkillStageTemplate, error) {
	key = strings.ToLower(strings.TrimSpace(key))
	for _, item := range ListSkillStageTemplates() {
		if item.Key == key {
			return item, nil
		}
	}
	return SkillStageTemplate{}, safeMessageError{message: "Skill 所属阶段不存在"}
}

func BuildImportedSkillPackage(key string, files map[string]string) (SkillPackage, error) {
	template, err := ResolveSkillStageTemplate(key)
	if err != nil {
		return SkillPackage{}, err
	}
	for _, stageKey := range systemSkillSeedStageKeys {
		if stageKey == template.Key {
			return buildInvocationWorkflowSkillSeedPackage(stageKey, files)
		}
	}
	for _, seed := range capabilitySkillSeeds() {
		if seed.Key == template.Key {
			return buildCapabilitySkillPackage(seed, files)
		}
	}
	return SkillPackage{}, safeMessageError{message: "Skill 所属阶段没有运行模板"}
}
