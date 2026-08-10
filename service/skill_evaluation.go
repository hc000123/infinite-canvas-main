package service

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

type SkillEvaluationInput struct {
	WorkflowRunID     string `json:"workflowRunId"`
	SourceAgentRunID  string `json:"sourceAgentRunId"`
	BaselineVersionID string `json:"baselineVersionId"`
	ConfirmAPICost    bool   `json:"confirmApiCost"`
}

type SkillEvaluationResult struct {
	Evaluation model.SkillEvaluation `json:"evaluation"`
	ImageCount int                   `json:"imageCount"`
	Candidate  map[string]any        `json:"candidate"`
	Baseline   map[string]any        `json:"baseline"`
	Diff       map[string]any        `json:"diff"`
}

var skillEvaluationExecutorFactory = NewAgentRunExecutorFromConfig

func EvaluateSkill(adminID, versionID string, input SkillEvaluationInput) (SkillEvaluationResult, error) {
	skill, version, ok, err := repository.GetSkillWithVersion(versionID)
	if err != nil || !ok {
		return SkillEvaluationResult{}, safeMessageError{message: "Skill 版本不存在"}
	}
	packageValue, err := DecodeSkillPackage(version)
	if err != nil {
		return SkillEvaluationResult{}, err
	}
	stageKey := workflowStageFromSkillManifest(packageValue.Manifest)
	if stageKey == "" {
		return SkillEvaluationResult{}, safeMessageError{message: "当前试运行需要工作流样本"}
	}
	workflow, ok, err := repository.GetWorkflowRun(input.WorkflowRunID)
	if err != nil || !ok {
		return SkillEvaluationResult{}, safeMessageError{message: "评测工作流不存在"}
	}
	stageID := workflowSkillRunStage(stageKey)
	if stageID == "" {
		return evaluateDeterministicSkill(adminID, workflow, skill, version, packageValue, stageKey)
	}
	executor, err := skillEvaluationExecutorFactory()
	if err != nil {
		return SkillEvaluationResult{}, err
	}
	if executor.Kind() == AgentRunExecutorAPI && !input.ConfirmAPICost {
		return SkillEvaluationResult{}, safeMessageError{message: "API 评测会产生上游费用，必须显式确认"}
	}
	detail, err := GetWorkflowRunDetail(workflow.UserID, workflow.ID)
	if err != nil {
		return SkillEvaluationResult{}, err
	}
	inputArtifact := model.WorkflowArtifact{}
	if stageID != WorkflowStageScriptAdaptation {
		inputArtifact, err = workflowStageInputArtifact(detail, stageID)
		if err != nil {
			return SkillEvaluationResult{}, err
		}
	}
	imageManifest := `{"items":[],"degraded":true,"reason":"text-only"}`
	if strings.TrimSpace(input.SourceAgentRunID) != "" {
		source, exists, err := repository.GetAgentRun(input.SourceAgentRunID)
		if err != nil || !exists || source.WorkflowRunID != workflow.ID {
			return SkillEvaluationResult{}, safeMessageError{message: "评测图片来源任务无效"}
		}
		if strings.TrimSpace(source.ImageManifestJSON) != "" {
			imageManifest = source.ImageManifestJSON
		}
	}
	imageCount := workflowSkillManifestImageCount(imageManifest)
	if packageValue.InputContract.ImagePolicy.Required && imageCount < packageValue.InputContract.ImagePolicy.Min {
		return SkillEvaluationResult{}, safeMessageError{message: "评测图片数量不满足 Skill 契约"}
	}
	systemPrompt, userPrompt := workflowSkillEvaluationPrompts(workflow, stageID, inputArtifact)
	inputSnapshot, _ := json.Marshal(map[string]any{
		"workflowRunId": workflow.ID, "stageKey": stageKey, "script": workflow.ScriptSnapshot,
		"inputArtifactId": inputArtifact.ID, "inputArtifactHash": inputArtifact.ContentHash, "inputArtifact": inputArtifact.ContentJSON,
	})
	inputHash := workflowContentHash(append(append([]byte{}, inputSnapshot...), []byte(imageManifest)...))
	candidate, candidateDuration := callSkillEvaluation(executor, skill, version, packageValue, stageKey, systemPrompt, userPrompt, imageManifest)
	baselineVersion, baselinePackage, err := skillEvaluationBaseline(stageKey, workflow.ProjectID, input.BaselineVersionID, version.ID)
	if err != nil {
		return SkillEvaluationResult{}, err
	}
	baseline := map[string]any{}
	baselineDuration := int64(0)
	if baselineVersion.ID != "" {
		baseline, baselineDuration = callSkillEvaluation(executor, skill, baselineVersion, baselinePackage, stageKey, systemPrompt, userPrompt, imageManifest)
	}
	diff := compareWorkflowSkillEvaluationOutputs(candidate, baseline)
	status, errorMessage := "passed", ""
	if workflowEvaluationFailed(candidate) {
		status, errorMessage = "failed", workflowEvaluationMessage(candidate)
	}
	resultJSON, _ := json.Marshal(map[string]any{"contentHash": version.ContentHash, "candidate": candidate, "baseline": baseline})
	diffJSON, _ := json.Marshal(diff)
	gateJSON, _ := json.Marshal(candidate["gate"])
	stamp := now()
	evaluation := model.SkillEvaluation{
		ID: newID("skilleval"), SkillVersionID: version.ID, BaselineVersionID: baselineVersion.ID,
		ContentHash: version.ContentHash, ProjectID: workflow.ProjectID, EpisodeID: workflow.EpisodeID,
		InputHash: inputHash, InputSnapshotJSON: string(inputSnapshot), ImageManifestJSON: imageManifest,
		ResultJSON: string(resultJSON), DiffJSON: string(diffJSON), GateJSON: string(gateJSON), Status: status,
		ErrorMessage: errorMessage, DurationMs: candidateDuration + baselineDuration, CreatedBy: adminID, CreatedAt: stamp, UpdatedAt: stamp,
	}
	summary, _ := json.Marshal(map[string]any{"evaluationId": evaluation.ID, "status": evaluation.Status, "contentHash": evaluation.ContentHash, "durationMs": evaluation.DurationMs})
	if err := repository.CreateSkillEvaluationAndUpdateSummary(evaluation, string(summary), stamp); err != nil {
		return SkillEvaluationResult{}, err
	}
	return SkillEvaluationResult{Evaluation: evaluation, ImageCount: imageCount, Candidate: candidate, Baseline: baseline, Diff: diff}, nil
}

func GetSkillEvaluationResult(id string) (SkillEvaluationResult, error) {
	evaluation, ok, err := repository.GetSkillEvaluation(id)
	if err != nil || !ok {
		return SkillEvaluationResult{}, safeMessageError{message: "Skill 评测不存在"}
	}
	return decodeSkillEvaluationResult(evaluation), nil
}

func GetManagedSkillEvaluationResult(userID, id string, isAdmin bool) (SkillEvaluationResult, error) {
	evaluation, ok, err := repository.GetSkillEvaluation(id)
	if err != nil || !ok {
		return SkillEvaluationResult{}, safeMessageError{message: "Skill 评测不存在"}
	}
	if _, _, err := GetManagedSkillVersionPackage(userID, evaluation.SkillVersionID, isAdmin); err != nil {
		return SkillEvaluationResult{}, err
	}
	return decodeSkillEvaluationResult(evaluation), nil
}

func decodeSkillEvaluationResult(evaluation model.SkillEvaluation) SkillEvaluationResult {
	var result struct {
		Candidate map[string]any `json:"candidate"`
		Baseline  map[string]any `json:"baseline"`
	}
	var diff map[string]any
	_ = json.Unmarshal([]byte(evaluation.ResultJSON), &result)
	_ = json.Unmarshal([]byte(evaluation.DiffJSON), &diff)
	return SkillEvaluationResult{Evaluation: evaluation, ImageCount: workflowSkillManifestImageCount(evaluation.ImageManifestJSON), Candidate: result.Candidate, Baseline: result.Baseline, Diff: diff}
}

func workflowStageFromSkillManifest(manifest SkillManifest) string {
	for _, capability := range manifest.Capabilities {
		if strings.HasPrefix(capability, "workflow.stage.") {
			stageKey := strings.TrimPrefix(capability, "workflow.stage.")
			if workflowSkillStages[stageKey] {
				return stageKey
			}
		}
	}
	return ""
}

func callSkillEvaluation(executor AgentRunExecutor, skill model.SkillDefinition, version model.SkillVersion, packageValue SkillPackage, stageKey, systemPrompt, userPrompt, imageManifest string) (map[string]any, int64) {
	modelName := workflowSkillEvaluationModel(executor)
	run := model.AgentRun{Executor: executor.Kind(), Model: modelName, TimeoutSeconds: 600, ImageManifestJSON: imageManifest}
	if executor.Kind() == AgentRunExecutorAPI {
		resolvedChannel, err := resolveAgentRunChannel(CreateAgentRunInput{})
		if err != nil {
			return map[string]any{"status": "failed", "message": err.Error()}, 0
		}
		modelName, run.Model, run.ChannelID = resolvedChannel.ModelName, resolvedChannel.ModelName, resolvedChannel.Channel.ID
	}
	requestJSON, err := buildAgentRunChatRequest(CreateAgentRunInput{SystemPrompt: systemPrompt + SkillPackageInstructions(packageValue.Files), UserPrompt: userPrompt}, modelName)
	if err != nil {
		return map[string]any{"status": "failed", "message": err.Error()}, 0
	}
	run.RequestJSON = string(requestJSON)
	started := time.Now()
	call := executor.Call(context.Background(), run)
	duration := time.Since(started).Milliseconds()
	if call.message != "" {
		return map[string]any{"status": "failed", "message": call.message}, duration
	}
	content := workflowAgentRunContent(model.AgentRun{RawOutput: call.rawOutput, StructuredDraftJSON: call.structuredJSON})
	gate := workflowSkillEvaluationGate(stageKey, content)
	appendSkillSchemaIssues(content, packageValue.OutputContract, &gate)
	var structured any
	_ = json.Unmarshal(content, &structured)
	status := "passed"
	if !gate.Passed {
		status = "failed"
	}
	return map[string]any{"status": status, "rawOutput": call.rawOutput, "structured": structured, "gate": gate, "durationMs": duration, "skillId": skill.ID, "skillVersionId": version.ID}, duration
}

func skillEvaluationBaseline(stageKey, projectID, requestedVersionID, candidateVersionID string) (model.SkillVersion, SkillPackage, error) {
	versionID := strings.TrimSpace(requestedVersionID)
	if versionID == "" {
		binding, ok, err := repository.ResolveWorkflowStageSkillBinding(stageKey, projectID)
		if err != nil || !ok || binding.SkillVersionID == candidateVersionID {
			return model.SkillVersion{}, SkillPackage{}, err
		}
		versionID = binding.SkillVersionID
	}
	version, ok, err := repository.GetSkillVersion(versionID)
	if err != nil || !ok {
		return version, SkillPackage{}, safeMessageError{message: "基线 Skill 版本不存在"}
	}
	packageValue, err := DecodeSkillPackage(version)
	if err != nil {
		return version, packageValue, err
	}
	if workflowStageFromSkillManifest(packageValue.Manifest) != stageKey {
		return version, SkillPackage{}, safeMessageError{message: "基线 Skill 不支持当前阶段"}
	}
	return version, packageValue, nil
}

func evaluateDeterministicSkill(adminID string, workflow model.WorkflowRun, skill model.SkillDefinition, version model.SkillVersion, packageValue SkillPackage, stageKey string) (SkillEvaluationResult, error) {
	stamp := now()
	inputHash := workflowContentHash([]byte(workflow.ScriptHash + stageKey))
	result := map[string]any{"status": "passed", "contentHash": packageValue.ContentHash, "contractValid": true}
	resultJSON, _ := json.Marshal(map[string]any{"contentHash": version.ContentHash, "candidate": result})
	evaluation := model.SkillEvaluation{
		ID: newID("skilleval"), SkillVersionID: version.ID, ContentHash: version.ContentHash,
		ProjectID: workflow.ProjectID, EpisodeID: workflow.EpisodeID, InputHash: inputHash,
		ResultJSON: string(resultJSON), DiffJSON: `{"sameInput":true}`, GateJSON: `{"passed":true}`, Status: "passed",
		CreatedBy: adminID, CreatedAt: stamp, UpdatedAt: stamp,
	}
	summary, _ := json.Marshal(map[string]any{"evaluationId": evaluation.ID, "status": evaluation.Status, "contentHash": evaluation.ContentHash, "durationMs": 0})
	if err := repository.CreateSkillEvaluationAndUpdateSummary(evaluation, string(summary), stamp); err != nil {
		return SkillEvaluationResult{}, err
	}
	return SkillEvaluationResult{Evaluation: evaluation, Candidate: result, Diff: map[string]any{"sameInput": true}}, nil
}
