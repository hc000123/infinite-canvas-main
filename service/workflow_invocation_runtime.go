package service

import (
	"encoding/json"
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
)

func workflowInvocationInputs(userID string, detail WorkflowRunDetail, stageID string, context *WorkflowShotPromptContext) ([]ArtifactRefInput, json.RawMessage, error) {
	wanted := []struct {
		stageID      string
		artifactType string
	}{}
	switch stageID {
	case WorkflowStageAssetExtraction:
		wanted = append(wanted, struct{ stageID, artifactType string }{WorkflowStageScriptAdaptation, "production_script"})
	case WorkflowStageAssetImagePrompt:
		wanted = append(wanted, struct{ stageID, artifactType string }{WorkflowStageAssetExtraction, "asset_catalog"})
	case WorkflowStageShotBreakdown:
		wanted = append(wanted,
			struct{ stageID, artifactType string }{WorkflowStageScriptAdaptation, "production_script"},
			struct{ stageID, artifactType string }{WorkflowStageAssetExtraction, "asset_catalog"},
		)
	case WorkflowStageShotPrompt:
		wanted = append(wanted,
			struct{ stageID, artifactType string }{WorkflowStageShotBreakdown, "storyboard_package"},
			struct{ stageID, artifactType string }{WorkflowStageAssetExtraction, "asset_catalog"},
		)
	default:
		return nil, nil, safeMessageError{message: "不支持的工作流阶段"}
	}
	refs := make([]ArtifactRefInput, 0, len(wanted))
	for _, item := range wanted {
		artifact, err := workflowApprovedStandardArtifact(userID, detail, item.stageID, item.artifactType)
		if err != nil {
			return nil, nil, err
		}
		refs = append(refs, ArtifactRefInput{BindingName: item.artifactType, ArtifactID: artifact.Artifact.ID, ContentHash: artifact.Artifact.ContentHash})
	}
	parameters := map[string]any{"workflowRunId": detail.Run.ID, "stageId": stageID, "workflowVersion": detail.Run.WorkflowVersion}
	if context != nil {
		parameters["shotContext"] = context
	}
	raw, err := json.Marshal(parameters)
	return refs, raw, err
}

func workflowApprovedStandardArtifact(userID string, detail WorkflowRunDetail, stageID, artifactType string) (ArtifactEnvelope, error) {
	stage := workflowDetailStage(detail, stageID)
	if stage.ID == "" || (stage.Status != model.WorkflowStageRunStatusApproved && stage.Status != model.WorkflowStageRunStatusApplied) {
		return ArtifactEnvelope{}, safeMessageError{message: workflowDependencyMessage(stageID)}
	}
	if stage.InvocationID == "" {
		artifact, err := GetArtifact(userID, stage.OutputArtifactID)
		if err != nil || artifact.Artifact.ArtifactType != artifactType {
			return ArtifactEnvelope{}, safeMessageError{message: workflowDependencyMessage(stageID) + "，且缺少标准产物"}
		}
		if artifactType == "asset_catalog" {
			artifact, _, _, err = latestAgentAssetSlotArtifact(userID, artifact)
		}
		return artifact, err
	}
	invocation, err := GetInvocationDetail(userID, stage.InvocationID)
	if err != nil {
		return ArtifactEnvelope{}, err
	}
	for _, artifact := range invocation.OutputArtifacts {
		if artifact.Artifact.ArtifactType == artifactType {
			if artifactType == "asset_catalog" {
				artifact, _, _, err = latestAgentAssetSlotArtifact(userID, artifact)
			}
			return artifact, err
		}
	}
	return ArtifactEnvelope{}, safeMessageError{message: workflowDependencyMessage(stageID) + "，且缺少标准产物"}
}

func workflowDependencyMessage(stageID string) string {
	switch stageID {
	case WorkflowStageScriptAdaptation:
		return "请先确认生产剧本"
	case WorkflowStageAssetExtraction:
		return "请先批准资产提取阶段"
	case WorkflowStageShotBreakdown:
		return "请先批准分镜拆解阶段"
	default:
		return "请先批准上游阶段"
	}
}

func workflowInvocationOutputType(stageID string) string {
	switch stageID {
	case WorkflowStageAssetExtraction:
		return "asset_catalog"
	case WorkflowStageAssetImagePrompt:
		return "asset_brief"
	case WorkflowStageShotBreakdown:
		return "storyboard_package"
	case WorkflowStageShotPrompt:
		return "video_prompt_package"
	default:
		return ""
	}
}

func workflowInvocationStageForArtifact(detail WorkflowRunDetail, artifactType string) (model.WorkflowStageRun, error) {
	for _, stage := range detail.Stages {
		if workflowInvocationOutputType(stage.StageID) == strings.TrimSpace(artifactType) {
			return stage, nil
		}
	}
	return model.WorkflowStageRun{}, errors.New("标准 Artifact 没有对应工作流阶段")
}
