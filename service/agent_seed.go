package service

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

const agentSeedVersion = "1.0.0"

type agentSeed struct {
	Key        string
	Name       string
	Summary    string
	RolePrompt string
	Stages     []string
}

func EnsureAgentSeeds() error {
	if err := EnsureSkillSeeds(); err != nil {
		return err
	}
	seeds := []agentSeed{
		{Key: "script", Name: "剧本制作 Agent", Summary: "将原始文本整理为可制作的生产剧本。", RolePrompt: "你是剧本制作负责人。你的职责是确定剧本生产步骤、检查输入是否齐全并调用已授权 Skill；不得在 Agent 内复制或改写 Skill 的业务规则。", Stages: []string{WorkflowSkillStageScript}},
		{Key: "art", Name: "资产提取 Agent", Summary: "从已批准剧本提取角色、场景、道具和服装资产。", RolePrompt: "你是资产提取负责人。你只规划资产提取任务、检查依赖并调用已授权 Skill；不得自行替代 Skill 的抽取规则。", Stages: []string{WorkflowSkillStageArt}},
		{Key: "assets", Name: "资产制作 Agent", Summary: "把资产事实转成可执行的资产制作 Brief。", RolePrompt: "你是资产制作负责人。你负责组织资产制作步骤与输入绑定，并调用已授权 Skill；不得重新解释已批准资产事实。", Stages: []string{WorkflowSkillStageAssets}},
		{Key: "storyboard", Name: "分镜导演 Agent", Summary: "根据剧本与资产引用组织分镜生产。", RolePrompt: "你是分镜导演。你负责选择和排序分镜 Skill、检查剧本与资产依赖；不得把分镜规范复制进 Agent 设定。", Stages: []string{WorkflowSkillStageStoryboard}},
		{Key: "video", Name: "视频提示词 Agent", Summary: "组合已批准分镜和资产引用生成视频提示词。", RolePrompt: "你是视频提示词制作负责人。你负责绑定分镜与资产产物并调用已授权 Skill；不得重新推断资产核心事实。", Stages: []string{WorkflowSkillStageVideo}},
		{Key: "delivery", Name: "交付审核 Agent", Summary: "审计生成结果并形成交付报告。", RolePrompt: "你是交付审核负责人。你负责组织检查步骤、识别缺失产物并调用已授权 Skill；不得绕过审核或写入确认。", Stages: []string{WorkflowSkillStageDelivery}},
		{Key: "preproduction", Name: "前期制作 Agent", Summary: "顺序完成剧本整理与资产提取，展示 Agent 组合多个 Skill 的标准方式。", RolePrompt: "你是前期制作统筹。你负责先形成生产剧本，再把已批准剧本交给资产提取 Skill；每一步都必须保留版本、产物和审核记录。", Stages: []string{WorkflowSkillStageScript, WorkflowSkillStageArt}},
	}
	for _, seed := range seeds {
		if err := ensureAgentSeed(seed); err != nil {
			return err
		}
	}
	return nil
}

func ensureAgentSeed(seed agentSeed) error {
	refs := make([]AgentSkillRef, 0, len(seed.Stages))
	allowedSkillIDs := make([]string, 0, len(seed.Stages))
	allowedTools := []string{}
	var previousRef *AgentSkillRef
	var previousOutput ArtifactOutputSpec
	for _, stage := range seed.Stages {
		skillID := "skill-system-workflow-" + stage
		versionID := "skill-version-system-workflow-" + stage + "-" + skillInvocationSeedVersion
		skill, version, ok, err := repository.GetSkillWithVersion(versionID)
		if err != nil || !ok || skill.ID != skillID || version.Status != model.SkillVersionPublished {
			return fmt.Errorf("seed Agent %s 缺少已发布 Skill %s", seed.Key, versionID)
		}
		packageValue, err := DecodeSkillPackage(version)
		if err != nil {
			return err
		}
		ref := AgentSkillRef{
			StepKey: stage, Label: skill.Name, SkillID: skill.ID, SkillVersionID: version.ID, Required: true,
			Parameters: json.RawMessage(`{}`),
		}
		if len(packageValue.Manifest.Capabilities) > 0 {
			ref.Capability = packageValue.Manifest.Capabilities[0]
		}
		if len(packageValue.OutputContract.ArtifactOutputs) > 0 {
			ref.ExpectedOutputType = packageValue.OutputContract.ArtifactOutputs[0].ArtifactType
		}
		if previousRef != nil {
			for _, input := range packageValue.InputContract.ArtifactInputs {
				if input.ArtifactType == previousOutput.ArtifactType {
					ref.InputBindings = append(ref.InputBindings, AgentStepInputBinding{
						BindingName: input.BindingName, FromStepKey: previousRef.StepKey, FromOutputBinding: previousOutput.BindingName,
					})
					break
				}
			}
		}
		refs = append(refs, ref)
		allowedSkillIDs = append(allowedSkillIDs, skill.ID)
		allowedTools = append(allowedTools, packageValue.Manifest.RequiredTools...)
		previousRef = &refs[len(refs)-1]
		if len(packageValue.OutputContract.ArtifactOutputs) > 0 {
			previousOutput = packageValue.OutputContract.ArtifactOutputs[0]
		}
	}
	packageValue, err := NormalizeAgentPackage(AgentPackage{
		RolePrompt: seed.RolePrompt, PlannerMode: AgentPlannerConfiguredChain, DefaultSkillRefs: refs,
		SkillAccessPolicy: AgentSkillAccessPolicy{AllowedSkillIDs: allowedSkillIDs, AllowedOwnerTypes: []model.SkillOwnerType{model.SkillOwnerSystem}},
		ToolPolicy:        AgentToolPolicy{AllowedTools: allowedTools},
		ExecutionPolicy:   AgentExecutionPolicy{MaxSteps: len(refs), AllowRuntimeSkillOverride: true},
	})
	if err != nil {
		return fmt.Errorf("normalize Agent seed %s: %w", seed.Key, err)
	}
	stamp := now()
	agentID := "agent-system-" + seed.Key
	versionID := "agent-version-system-" + seed.Key + "-" + agentSeedVersion
	version := agentVersionFromPackage(versionID, agentID, agentSeedVersion, "system", stamp, packageValue)
	version.Status, version.PublishedAt = model.AgentVersionPublished, stamp
	agent, exists, err := repository.GetAgentDefinition(agentID)
	if err != nil {
		return err
	}
	if !exists {
		tags, _ := json.Marshal(seed.Stages)
		agent = model.AgentDefinition{
			ID: agentID, Name: seed.Name, Summary: seed.Summary, TagsJSON: string(tags), OwnerType: model.AgentOwnerSystem,
			Enabled: true, RecommendedVersionID: version.ID, CreatedAt: stamp, UpdatedAt: stamp,
		}
		return repository.CreateAgentAggregate(agent, version)
	}
	if _, ok, err := repository.GetAgentVersion(version.ID); err != nil {
		return err
	} else if !ok {
		if err := repository.CreateAgentVersion(version); err != nil {
			return err
		}
	}
	if agent.RecommendedVersionID == "" || strings.HasPrefix(agent.RecommendedVersionID, "agent-version-system-"+seed.Key+"-") {
		return repository.SetRecommendedAgentVersion(agent.ID, version.ID, stamp)
	}
	return nil
}
