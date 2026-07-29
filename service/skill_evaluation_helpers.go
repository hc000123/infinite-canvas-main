package service

import (
	"encoding/json"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
)

func compareWorkflowSkillEvaluationOutputs(candidate, baseline map[string]any) map[string]any {
	candidateStructured, _ := candidate["structured"].(map[string]any)
	baselineStructured, _ := baseline["structured"].(map[string]any)
	added, removed := []string{}, []string{}
	for key := range candidateStructured {
		if _, ok := baselineStructured[key]; !ok {
			added = append(added, key)
		}
	}
	for key := range baselineStructured {
		if _, ok := candidateStructured[key]; !ok {
			removed = append(removed, key)
		}
	}
	return map[string]any{
		"sameInput": true, "addedFields": added, "removedFields": removed,
		"candidateItems": workflowEvaluationItemCount(candidateStructured), "baselineItems": workflowEvaluationItemCount(baselineStructured),
		"candidateStatus": candidate["status"], "baselineStatus": baseline["status"],
	}
}

func workflowEvaluationItemCount(value map[string]any) int {
	count := 0
	for _, key := range []string{"items", "characters", "scenes", "props", "shots", "packages", "videoPrompts"} {
		if items, ok := value[key].([]any); ok {
			count += len(items)
		}
	}
	return count
}

func workflowEvaluationFailed(result map[string]any) bool { return result["status"] != "passed" }

func workflowEvaluationMessage(result map[string]any) string {
	message, _ := result["message"].(string)
	if strings.TrimSpace(message) == "" {
		return "Skill 评测未通过质量门"
	}
	return message
}

func workflowSkillEvaluationGate(stageKey string, content []byte) WorkflowGateReport {
	switch stageKey {
	case WorkflowSkillStageScript:
		return ValidateScriptArtifact(content)
	case WorkflowSkillStageArt:
		return ValidateAssetExtractionArtifact(content)
	case WorkflowSkillStageAssets:
		return ValidateAssetImagePromptArtifact(content)
	case WorkflowSkillStageStoryboard:
		return ValidateShotBreakdownArtifact(content)
	default:
		return ValidateShotPromptArtifact(content)
	}
}

func workflowSkillEvaluationPrompts(run model.WorkflowRun, stageID string, artifact model.WorkflowArtifact) (string, string) {
	if stageID == WorkflowStageScriptAdaptation {
		return "只输出 JSON，包含 productionScript。不得改变原始剧情事实。", "请把以下剧本整理成生产剧本：\n" + run.ScriptSnapshot
	}
	return workflowStagePrompts(run, stageID, artifact, nil)
}

func workflowSkillRunStage(stageKey string) string {
	switch stageKey {
	case WorkflowSkillStageScript:
		return WorkflowStageScriptAdaptation
	case WorkflowSkillStageArt:
		return WorkflowStageAssetExtraction
	case WorkflowSkillStageAssets:
		return WorkflowStageAssetImagePrompt
	case WorkflowSkillStageStoryboard:
		return WorkflowStageShotBreakdown
	case WorkflowSkillStageVideo:
		return WorkflowStageShotPrompt
	default:
		return ""
	}
}

func workflowSkillEvaluationModel(executor AgentRunExecutor) string {
	return "default"
}

func workflowSkillManifestImageCount(manifestJSON string) int {
	var manifest struct {
		Items []json.RawMessage `json:"items"`
	}
	_ = json.Unmarshal([]byte(manifestJSON), &manifest)
	return len(manifest.Items)
}
