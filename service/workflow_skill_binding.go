package service

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

const (
	WorkflowSkillStageScript     = "script"
	WorkflowSkillStageArt        = "art"
	WorkflowSkillStageAssets     = "assets"
	WorkflowSkillStageStoryboard = "storyboard"
	WorkflowSkillStageVideo      = "video"
	WorkflowSkillStageDelivery   = "delivery"
)

var workflowSkillStages = map[string]bool{
	WorkflowSkillStageScript: true, WorkflowSkillStageArt: true, WorkflowSkillStageAssets: true,
	WorkflowSkillStageStoryboard: true, WorkflowSkillStageVideo: true, WorkflowSkillStageDelivery: true,
}

type WorkflowSkillOption struct {
	StageID        string `json:"stageId"`
	SkillID        string `json:"skillId"`
	SkillName      string `json:"skillName"`
	Description    string `json:"description"`
	SkillVersionID string `json:"skillVersionId"`
	Version        string `json:"version"`
	IsDefault      bool   `json:"isDefault"`
}

type WorkflowStageSkillBindingInput struct {
	Scope          string `json:"scope"`
	ScopeID        string `json:"scopeId"`
	SkillVersionID string `json:"skillVersionId"`
}

func ResolveWorkflowStageSkill(stageKey, projectID, exactVersionID string) (ResolvedSkill, error) {
	stageKey = strings.TrimSpace(stageKey)
	if !workflowSkillStages[stageKey] {
		return ResolvedSkill{}, safeMessageError{message: "未知工作流阶段"}
	}
	if strings.TrimSpace(exactVersionID) != "" {
		resolved, err := ResolveExactSkillVersion(exactVersionID)
		if err != nil {
			return resolved, err
		}
		return requireWorkflowStageCapability(resolved, stageKey)
	}
	binding, ok, err := repository.ResolveWorkflowStageSkillBinding(stageKey, projectID)
	if err != nil {
		return ResolvedSkill{}, err
	}
	if !ok {
		return ResolvedSkill{}, safeMessageError{message: "工作流阶段尚未绑定 Skill"}
	}
	resolved, err := ResolveExactSkillVersion(binding.SkillVersionID)
	if err != nil {
		return resolved, err
	}
	return requireWorkflowStageCapability(resolved, stageKey)
}

func ResolveWorkflowStageSkillForRun(stageID, projectID, exactVersionID string) (ResolvedSkill, error) {
	return ResolveWorkflowStageSkill(workflowSkillStageForRun(stageID), projectID, exactVersionID)
}

func workflowSkillStageForRun(stageID string) string {
	switch stageID {
	case WorkflowStageScriptAdaptation:
		return WorkflowSkillStageScript
	case WorkflowStageAssetExtraction:
		return WorkflowSkillStageArt
	case WorkflowStageAssetImagePrompt:
		return WorkflowSkillStageAssets
	case WorkflowStageShotBreakdown:
		return WorkflowSkillStageStoryboard
	case WorkflowStageShotPrompt:
		return WorkflowSkillStageVideo
	default:
		return strings.TrimSpace(stageID)
	}
}

func ListWorkflowStageSkillOptions(stageID, projectID string) ([]WorkflowSkillOption, error) {
	stageKey := workflowSkillStageForRun(stageID)
	resolved, err := ResolveWorkflowStageSkill(stageKey, projectID, "")
	if err != nil {
		return nil, err
	}
	items, err := ListSkillOptions(projectID, SkillOptionFilter{Capability: "workflow.stage." + stageKey})
	if err != nil {
		return nil, err
	}
	options := make([]WorkflowSkillOption, 0, len(items))
	for _, item := range items {
		options = append(options, WorkflowSkillOption{
			StageID: stageID, SkillID: item.SkillID, SkillName: item.SkillName, Description: item.Summary,
			SkillVersionID: item.SkillVersionID, Version: item.Version, IsDefault: item.SkillVersionID == resolved.Version.ID,
		})
	}
	return options, nil
}

func requireWorkflowStageCapability(resolved ResolvedSkill, stageKey string) (ResolvedSkill, error) {
	if !slices.Contains(resolved.Package.Manifest.Capabilities, "workflow.stage."+stageKey) {
		return ResolvedSkill{}, safeMessageError{message: "Skill 不支持当前工作流阶段"}
	}
	return resolved, nil
}

func UpdateWorkflowStageSkillBinding(adminID, stageKey string, input WorkflowStageSkillBindingInput) (ResolvedSkill, error) {
	resolved, err := ResolveExactSkillVersion(input.SkillVersionID)
	if err != nil {
		return resolved, err
	}
	if _, err := requireWorkflowStageCapability(resolved, stageKey); err != nil {
		return ResolvedSkill{}, err
	}
	scope, scopeID := strings.TrimSpace(input.Scope), strings.TrimSpace(input.ScopeID)
	if scope == model.WorkflowStageSkillScopeGlobal {
		scopeID = ""
		passed, err := repository.HasSkillProjectCanary(resolved.Version.ID, resolved.Version.ContentHash)
		if err != nil {
			return ResolvedSkill{}, err
		}
		if !passed {
			return ResolvedSkill{}, safeMessageError{message: "全局绑定前必须完成项目灰度评测"}
		}
	} else if scope != model.WorkflowStageSkillScopeProject || scopeID == "" {
		return ResolvedSkill{}, safeMessageError{message: "Skill 绑定范围无效"}
	}
	stamp := now()
	binding := model.WorkflowStageSkillBinding{ID: newID("skillbinding"), StageKey: stageKey, Scope: scope, ScopeID: scopeID, SkillVersionID: resolved.Version.ID, CreatedAt: stamp, UpdatedAt: stamp}
	detail, _ := json.Marshal(map[string]string{"stageKey": stageKey, "bindingId": binding.ID})
	audit := model.SkillAuditLog{ID: newID("skillaudit"), AdminID: strings.TrimSpace(adminID), Action: "bind_workflow_" + scope, Scope: scope, ScopeID: scopeID, SkillVersionID: resolved.Version.ID, DetailJSON: string(detail), CreatedAt: stamp}
	if err := repository.UpsertWorkflowStageSkillBindingWithSkillAudit(binding, audit); err != nil {
		return ResolvedSkill{}, err
	}
	return resolved, nil
}

func ListWorkflowStageSkillBindings(stageKey string) ([]model.WorkflowStageSkillBinding, error) {
	stageKey = strings.TrimSpace(stageKey)
	if !workflowSkillStages[stageKey] {
		return nil, safeMessageError{message: "未知工作流阶段"}
	}
	return repository.ListWorkflowStageSkillBindings(stageKey)
}

func buildSkillSnapshotJSON(resolved ResolvedSkill) string {
	payload, _ := json.Marshal(map[string]any{
		"skillId": resolved.Skill.ID, "name": resolved.Skill.Name, "ownerType": resolved.Skill.OwnerType,
		"versionId": resolved.Version.ID, "version": resolved.Version.Version, "contentHash": resolved.Version.ContentHash,
		"manifest": resolved.Package.Manifest, "files": resolved.Package.Files, "inputContract": resolved.Package.InputContract,
		"outputContract": resolved.Package.OutputContract, "qualityGateProfile": resolved.Package.QualityGateProfile,
	})
	return string(payload)
}

func skillInstructions(resolved ResolvedSkill) string {
	return fmt.Sprintf("\n\n【当前阶段 Skill %s@%s，内容哈希 %s】\n%s", resolved.Skill.Name, resolved.Version.Version, resolved.Version.ContentHash, SkillPackageInstructions(resolved.Package.Files))
}

func skillInstructionsFromSnapshot(snapshotJSON string) (string, error) {
	var snapshot struct {
		Name        string            `json:"name"`
		Version     string            `json:"version"`
		ContentHash string            `json:"contentHash"`
		Files       map[string]string `json:"files"`
	}
	if json.Unmarshal([]byte(snapshotJSON), &snapshot) != nil || strings.TrimSpace(snapshot.Files["SKILL.md"]) == "" {
		return "", safeMessageError{message: "原任务 Skill 快照损坏"}
	}
	return fmt.Sprintf("\n\n【当前阶段 Skill %s@%s，内容哈希 %s】\n%s", snapshot.Name, snapshot.Version, snapshot.ContentHash, SkillPackageInstructions(snapshot.Files)), nil
}

func skillOutputContractFromSnapshot(snapshotJSON string) (SkillOutputContract, error) {
	var snapshot struct {
		OutputContract SkillOutputContract `json:"outputContract"`
	}
	if json.Unmarshal([]byte(snapshotJSON), &snapshot) != nil {
		return SkillOutputContract{}, safeMessageError{message: "原任务 Skill 快照损坏"}
	}
	contract, err := normalizeSkillOutputContract(snapshot.OutputContract)
	return contract, err
}

func validateSkillRuntimeInput(userID string, detail WorkflowRunDetail, stageID string, inputArtifact model.WorkflowArtifact, input WorkflowStageStartInput, contract SkillInputContract) error {
	for _, name := range contract.RequiredInputs {
		switch name {
		case "workflow":
			if strings.TrimSpace(detail.Run.ID) == "" {
				return safeMessageError{message: "当前 Skill 缺少工作流输入"}
			}
		case "script":
			if strings.TrimSpace(detail.Run.ScriptSnapshot) == "" {
				return safeMessageError{message: "当前 Skill 缺少剧本输入"}
			}
		case "upstreamArtifact":
			if strings.TrimSpace(inputArtifact.ID) == "" || strings.TrimSpace(inputArtifact.ContentJSON) == "" {
				return safeMessageError{message: "当前 Skill 缺少上游产物"}
			}
		case "shotContext":
			context := strings.TrimSpace(string(input.Context))
			if context == "" || context == "null" {
				return safeMessageError{message: "当前 Skill 缺少镜头上下文"}
			}
		case "referenceImages":
			if strings.TrimSpace(input.MediaBatchID) == "" {
				return safeMessageError{message: "当前 Skill 缺少参考图片输入"}
			}
		}
	}
	batchID := strings.TrimSpace(input.MediaBatchID)
	if batchID == "" {
		if contract.ImagePolicy.Required || contract.ImagePolicy.Min > 0 {
			minimum := max(contract.ImagePolicy.Min, 1)
			return safeMessageError{message: fmt.Sprintf("当前 Skill 至少需要 %d 张参考图片", minimum)}
		}
		if contract.ImagePolicy.Max > 0 && !contract.ImagePolicy.AllowTextFallback {
			return safeMessageError{message: "当前 Skill 不允许无图降级"}
		}
		return nil
	}
	batch, err := GetUserWorkflowMediaBatch(userID, batchID)
	if err != nil {
		return err
	}
	if batch.Batch.WorkflowRunID != detail.Run.ID || batch.Batch.StageID != stageID || batch.Batch.Status != model.WorkflowMediaBatchOpen {
		return safeMessageError{message: "参考图片批次与当前工作流阶段不匹配"}
	}
	count := len(batch.Items)
	if count < contract.ImagePolicy.Min {
		return safeMessageError{message: fmt.Sprintf("当前 Skill 至少需要 %d 张参考图片", contract.ImagePolicy.Min)}
	}
	if count > contract.ImagePolicy.Max {
		return safeMessageError{message: fmt.Sprintf("当前 Skill 最多允许 %d 张参考图片", contract.ImagePolicy.Max)}
	}
	allowedTypes := map[string]bool{}
	for _, mimeType := range contract.ImagePolicy.AllowedTypes {
		allowedTypes[mimeType] = true
	}
	for _, item := range batch.Items {
		if !allowedTypes[item.MIME] {
			return safeMessageError{message: "参考图片包含当前 Skill 不允许的格式"}
		}
	}
	return nil
}
