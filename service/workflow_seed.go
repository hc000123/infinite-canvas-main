package service

import (
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

const (
	systemProductionWorkflowID        = "workflow-system-standard-production"
	systemProductionWorkflowVersionID = "workflow-version-system-standard-production-1.0.0"
	systemProductionWorkflowVersion   = "1.0.0"
)

func EnsureWorkflowSeeds() error {
	if err := EnsureAgentSeeds(); err != nil {
		return err
	}
	packageValue, err := NormalizeWorkflowPackage(systemProductionWorkflowPackage())
	if err != nil {
		return err
	}
	stamp := now()
	workflow, exists, err := repository.GetWorkflowDefinition(systemProductionWorkflowID)
	if err != nil {
		return err
	}
	version := workflowVersionFromPackage(systemProductionWorkflowVersionID, systemProductionWorkflowID, systemProductionWorkflowVersion, "system", stamp, packageValue)
	version.Status, version.PublishedAt = model.WorkflowVersionPublished, stamp
	if !exists {
		workflow = model.WorkflowDefinition{
			ID: systemProductionWorkflowID, Name: "标准 AIGC 生产 Workflow",
			Summary:   "从原始文本到剧本、资产、制作 Brief、分镜、视频提示词和交付审计的标准可组合流程。",
			TagsJSON:  encodeWorkflowTags([]string{"aigc", "production", "seedance"}),
			OwnerType: model.WorkflowOwnerSystem, Enabled: true, RecommendedVersionID: version.ID,
			CreatedAt: stamp, UpdatedAt: stamp,
		}
		return repository.CreateWorkflowDefinitionAggregate(workflow, version)
	}
	if _, ok, err := repository.GetWorkflowVersion(version.ID); err != nil {
		return err
	} else if !ok {
		if err := repository.CreateWorkflowVersion(version); err != nil {
			return err
		}
	}
	if workflow.RecommendedVersionID == "" || strings.HasPrefix(workflow.RecommendedVersionID, "workflow-version-system-standard-production-") {
		return repository.SetRecommendedWorkflowVersion(workflow.ID, version.ID, stamp)
	}
	return nil
}

func systemProductionWorkflowPackage() WorkflowPackage {
	return WorkflowPackage{InputArtifactTypes: []string{"source_text"}, Nodes: []WorkflowNodeSpec{
		agentWorkflowNode("script", "剧本整理", WorkflowSkillStageScript, "production_script", []WorkflowNodeInputBinding{
			workflowRootBinding("source_text", "source_text"),
		}),
		agentWorkflowNode("art", "资产提取", WorkflowSkillStageArt, "asset_catalog", []WorkflowNodeInputBinding{
			workflowOutputBinding("production_script", "production_script", "script"),
		}),
		skillWorkflowNode("assets", "资产制作 Brief", WorkflowSkillStageAssets, "asset_brief", []WorkflowNodeInputBinding{
			workflowOutputBinding("asset_catalog", "asset_catalog", "art"),
		}),
		agentWorkflowNode("storyboard", "分镜制作", WorkflowSkillStageStoryboard, "storyboard_package", []WorkflowNodeInputBinding{
			workflowOutputBinding("production_script", "production_script", "script"),
			workflowOutputBinding("asset_catalog", "asset_catalog", "art"),
		}),
		skillWorkflowNode("video", "视频提示词", WorkflowSkillStageVideo, "video_prompt_package", []WorkflowNodeInputBinding{
			workflowOutputBinding("storyboard_package", "storyboard_package", "storyboard"),
			workflowOutputBinding("asset_catalog", "asset_catalog", "art"),
		}),
		skillWorkflowNode("delivery", "交付审计", WorkflowSkillStageDelivery, "delivery_report", []WorkflowNodeInputBinding{
			workflowOutputBinding("video_prompt_package", "video_prompt_package", "video"),
		}),
	}}
}

func agentWorkflowNode(key, name, agentKey, outputType string, inputs []WorkflowNodeInputBinding) WorkflowNodeSpec {
	return WorkflowNodeSpec{
		NodeKey: key, Name: name, ExecutorType: WorkflowExecutorAgent,
		AgentRef:      &WorkflowAgentRef{AgentID: "agent-system-" + agentKey, AgentVersionID: "agent-version-system-" + agentKey + "-" + agentSeedVersion},
		InputBindings: inputs, OutputArtifactType: outputType,
		ConfirmationPolicy: WorkflowConfirmationPolicy{RequireBeforeRun: true, RequireReview: true},
		RetryPolicy:        WorkflowRetryPolicy{MaxAttempts: 2},
	}
}

func skillWorkflowNode(key, name, stageKey, outputType string, inputs []WorkflowNodeInputBinding) WorkflowNodeSpec {
	return WorkflowNodeSpec{
		NodeKey: key, Name: name, ExecutorType: WorkflowExecutorSkill,
		SkillBinding: &WorkflowSkillBinding{
			Mode: WorkflowSkillBindingFixed, SkillID: "skill-system-workflow-" + stageKey,
			SkillVersionID: "skill-version-system-workflow-" + stageKey + "-" + skillInvocationSeedVersion,
		},
		InputBindings: inputs, OutputArtifactType: outputType,
		ConfirmationPolicy: WorkflowConfirmationPolicy{RequireBeforeRun: true, RequireReview: true},
		RetryPolicy:        WorkflowRetryPolicy{MaxAttempts: 2},
	}
}

func workflowRootBinding(name, artifactType string) WorkflowNodeInputBinding {
	return WorkflowNodeInputBinding{BindingName: name, ArtifactType: artifactType, Source: WorkflowInputSource, WorkflowInputName: name, Required: true}
}

func workflowOutputBinding(name, artifactType, nodeKey string) WorkflowNodeInputBinding {
	return WorkflowNodeInputBinding{BindingName: name, ArtifactType: artifactType, Source: WorkflowNodeSource, FromNodeKey: nodeKey, FromOutputBinding: artifactType, Required: true}
}
