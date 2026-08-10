package service

import (
	"encoding/json"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

const (
	canvasOrchestratorAgentID   = "agent-system-canvas-orchestrator"
	canvasOrchestratorVersionID = "agent-version-system-canvas-orchestrator-1.1.0"
)

func EnsureCanvasOrchestratorSeed() error {
	packageValue, err := NormalizeAgentPackage(AgentPackage{
		RolePrompt:  "你是画布总控。根据用户目标和当前画布上下文，从服务端提供的已发布 Skill Catalog 中选择最少且契约兼容的步骤；不得虚构 Skill、版本、输入输出或绕过审核。简单问答直接回答，只有需要执行时才形成临时计划。",
		PlannerMode: AgentPlannerCatalog,
		SkillAccessPolicy: AgentSkillAccessPolicy{
			AllowedOwnerTypes: []model.SkillOwnerType{model.SkillOwnerSystem},
		},
		ExecutionPolicy: AgentExecutionPolicy{MaxSteps: 12, AllowRuntimeSkillOverride: true},
	})
	if err != nil {
		return err
	}
	stamp := now()
	version := agentVersionFromPackage(canvasOrchestratorVersionID, canvasOrchestratorAgentID, "1.1.0", "system", stamp, packageValue)
	version.Status, version.PublishedAt = model.AgentVersionPublished, stamp
	agent, exists, err := repository.GetAgentDefinition(canvasOrchestratorAgentID)
	if err != nil {
		return err
	}
	if !exists {
		tags, _ := json.Marshal([]string{"canvas", "orchestrator"})
		agent = model.AgentDefinition{
			ID: canvasOrchestratorAgentID, Name: "画布总控", Summary: "根据 Skill Catalog 为画布对话生成临时执行计划。",
			TagsJSON: string(tags), OwnerType: model.AgentOwnerSystem, Enabled: true,
			RecommendedVersionID: version.ID, CreatedAt: stamp, UpdatedAt: stamp,
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
	return repository.SetRecommendedAgentVersion(agent.ID, version.ID, stamp)
}
