package service

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

type WorkflowSkillEvaluationInput struct {
	WorkflowRunID     string `json:"workflowRunId"`
	SourceAgentRunID  string `json:"sourceAgentRunId"`
	BaselineVersionID string `json:"baselineVersionId"`
	ConfirmAPICost    bool   `json:"confirmApiCost"`
}

type WorkflowSkillEvaluationResult struct {
	Evaluation model.WorkflowSkillEvaluation `json:"evaluation"`
	ImageCount int                           `json:"imageCount"`
	Candidate  map[string]any                `json:"candidate"`
	Baseline   map[string]any                `json:"baseline"`
	Diff       map[string]any                `json:"diff"`
}

var workflowSkillEvaluationExecutorFactory = NewAgentRunExecutorFromConfig

func EvaluateWorkflowSkill(adminID string, versionID string, input WorkflowSkillEvaluationInput) (WorkflowSkillEvaluationResult, error) {
	skill, version, ok, err := repository.GetWorkflowSkillWithVersion(versionID)
	if err != nil || !ok {
		return WorkflowSkillEvaluationResult{}, safeMessageError{message: "Skill 版本不存在"}
	}
	candidatePackage, err := DecodeWorkflowSkillPackage(version)
	if err != nil {
		return WorkflowSkillEvaluationResult{}, err
	}
	workflow, ok, err := repository.GetWorkflowRun(input.WorkflowRunID)
	if err != nil || !ok {
		return WorkflowSkillEvaluationResult{}, safeMessageError{message: "评测工作流不存在"}
	}
	stageID := workflowSkillRunStage(skill.StageKey)
	if stageID == "" {
		return evaluateDeterministicWorkflowSkill(adminID, workflow, skill, version, candidatePackage)
	}
	executor, err := workflowSkillEvaluationExecutorFactory()
	if err != nil {
		return WorkflowSkillEvaluationResult{}, err
	}
	if executor.Kind() == AgentRunExecutorAPI && !input.ConfirmAPICost {
		return WorkflowSkillEvaluationResult{}, safeMessageError{message: "API 评测会产生上游费用，必须显式确认"}
	}
	detail, err := GetWorkflowRunDetail(workflow.UserID, workflow.ID)
	if err != nil {
		return WorkflowSkillEvaluationResult{}, err
	}
	inputArtifact := model.WorkflowArtifact{}
	if stageID != WorkflowStageScriptAdaptation {
		inputArtifact, err = workflowStageInputArtifact(detail, stageID)
		if err != nil {
			return WorkflowSkillEvaluationResult{}, err
		}
	}
	imageManifest := `{"items":[],"degraded":true,"reason":"text-only"}`
	if strings.TrimSpace(input.SourceAgentRunID) != "" {
		source, exists, err := repository.GetAgentRun(input.SourceAgentRunID)
		if err != nil || !exists || source.WorkflowRunID != workflow.ID {
			return WorkflowSkillEvaluationResult{}, safeMessageError{message: "评测图片来源任务无效"}
		}
		if strings.TrimSpace(source.ImageManifestJSON) != "" {
			imageManifest = source.ImageManifestJSON
		}
	}
	imageCount := workflowSkillManifestImageCount(imageManifest)
	if candidatePackage.Contract.ImagePolicy.Required && imageCount < candidatePackage.Contract.ImagePolicy.Min {
		return WorkflowSkillEvaluationResult{}, safeMessageError{message: "评测图片数量不满足 Skill 契约"}
	}
	systemPrompt, userPrompt := workflowSkillEvaluationPrompts(workflow, stageID, inputArtifact)
	inputSnapshot, _ := json.Marshal(map[string]any{
		"workflowRunId": workflow.ID, "stageKey": skill.StageKey, "script": workflow.ScriptSnapshot,
		"inputArtifactId": inputArtifact.ID, "inputArtifactHash": inputArtifact.ContentHash, "inputArtifact": inputArtifact.ContentJSON,
	})
	inputHash := workflowContentHash(append(append([]byte{}, inputSnapshot...), []byte(imageManifest)...))
	candidate, candidateDuration := callWorkflowSkillEvaluation(executor, skill, version, candidatePackage, systemPrompt, userPrompt, imageManifest)
	baselineVersion, baselinePackage, err := workflowSkillEvaluationBaseline(skill.StageKey, workflow.ProjectID, input.BaselineVersionID, version.ID)
	if err != nil {
		return WorkflowSkillEvaluationResult{}, err
	}
	baseline := map[string]any{}
	baselineDuration := int64(0)
	if baselineVersion.ID != "" {
		baseline, baselineDuration = callWorkflowSkillEvaluation(executor, skill, baselineVersion, baselinePackage, systemPrompt, userPrompt, imageManifest)
	}
	diff := compareWorkflowSkillEvaluationOutputs(candidate, baseline)
	status := "passed"
	errorMessage := ""
	if workflowEvaluationFailed(candidate) {
		status = "failed"
		errorMessage = workflowEvaluationMessage(candidate)
	}
	resultJSON, _ := json.Marshal(map[string]any{"contentHash": version.ContentHash, "candidate": candidate, "baseline": baseline})
	diffJSON, _ := json.Marshal(diff)
	gateJSON, _ := json.Marshal(candidate["gate"])
	stamp := now()
	evaluation := model.WorkflowSkillEvaluation{
		ID: newID("skilleval"), SkillVersionID: version.ID, BaselineVersionID: baselineVersion.ID,
		ContentHash: version.ContentHash, ProjectID: workflow.ProjectID, EpisodeID: workflow.EpisodeID,
		InputHash: inputHash, InputSnapshotJSON: string(inputSnapshot), ImageManifestJSON: imageManifest,
		ResultJSON: string(resultJSON), DiffJSON: string(diffJSON), GateJSON: string(gateJSON), Status: status,
		ErrorMessage: errorMessage, DurationMs: candidateDuration + baselineDuration, CreatedBy: adminID, CreatedAt: stamp, UpdatedAt: stamp,
	}
	if err := repository.CreateWorkflowSkillEvaluation(evaluation); err != nil {
		return WorkflowSkillEvaluationResult{}, err
	}
	return WorkflowSkillEvaluationResult{Evaluation: evaluation, ImageCount: imageCount, Candidate: candidate, Baseline: baseline, Diff: diff}, nil
}

func GetWorkflowSkillEvaluationResult(id string) (WorkflowSkillEvaluationResult, error) {
	evaluation, ok, err := repository.GetWorkflowSkillEvaluation(id)
	if err != nil || !ok {
		return WorkflowSkillEvaluationResult{}, safeMessageError{message: "Skill 评测不存在"}
	}
	var result struct {
		Candidate map[string]any `json:"candidate"`
		Baseline  map[string]any `json:"baseline"`
	}
	var diff map[string]any
	_ = json.Unmarshal([]byte(evaluation.ResultJSON), &result)
	_ = json.Unmarshal([]byte(evaluation.DiffJSON), &diff)
	return WorkflowSkillEvaluationResult{Evaluation: evaluation, ImageCount: workflowSkillManifestImageCount(evaluation.ImageManifestJSON), Candidate: result.Candidate, Baseline: result.Baseline, Diff: diff}, nil
}

func callWorkflowSkillEvaluation(executor AgentRunExecutor, skill model.WorkflowSkill, version model.WorkflowSkillVersion, packageValue WorkflowSkillPackage, systemPrompt string, userPrompt string, imageManifest string) (map[string]any, int64) {
	resolved := ResolvedWorkflowSkill{Skill: skill, Version: version, Package: packageValue}
	modelName := workflowSkillEvaluationModel(executor)
	run := model.AgentRun{Executor: executor.Kind(), Model: modelName, TimeoutSeconds: 600, ImageManifestJSON: imageManifest}
	if executor.Kind() == AgentRunExecutorAPI {
		resolvedChannel, err := resolveAgentRunChannel(CreateAgentRunInput{})
		if err != nil {
			return map[string]any{"status": "failed", "message": err.Error()}, 0
		}
		modelName, run.Model, run.ChannelID = resolvedChannel.ModelName, resolvedChannel.ModelName, resolvedChannel.Channel.ID
	}
	requestJSON, err := buildAgentRunChatRequest(CreateAgentRunInput{SystemPrompt: systemPrompt + workflowSkillInstructions(resolved), UserPrompt: userPrompt}, modelName)
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
	gate := workflowSkillEvaluationGate(skill.StageKey, content)
	var structured any
	_ = json.Unmarshal(content, &structured)
	status := "passed"
	if !gate.Passed {
		status = "failed"
	}
	return map[string]any{"status": status, "rawOutput": call.rawOutput, "structured": structured, "gate": gate, "durationMs": duration}, duration
}

func workflowSkillEvaluationBaseline(stageKey string, projectID string, requestedVersionID string, candidateVersionID string) (model.WorkflowSkillVersion, WorkflowSkillPackage, error) {
	versionID := strings.TrimSpace(requestedVersionID)
	if versionID == "" {
		binding, ok, err := repository.ResolveWorkflowStageSkillBinding(stageKey, projectID)
		if err != nil || !ok || binding.SkillVersionID == candidateVersionID {
			return model.WorkflowSkillVersion{}, WorkflowSkillPackage{}, err
		}
		versionID = binding.SkillVersionID
	}
	version, ok, err := repository.GetWorkflowSkillVersion(versionID)
	if err != nil || !ok {
		return version, WorkflowSkillPackage{}, safeMessageError{message: "基线 Skill 版本不存在"}
	}
	packageValue, err := DecodeWorkflowSkillPackage(version)
	return version, packageValue, err
}

func compareWorkflowSkillEvaluationOutputs(candidate map[string]any, baseline map[string]any) map[string]any {
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
		return ValidateArtDesignArtifact(content)
	case WorkflowSkillStageAssets:
		return ValidateAssetGenerationArtifact(content)
	default:
		return ValidateStoryboardArtifact(content)
	}
}

func workflowSkillEvaluationPrompts(run model.WorkflowRun, stageID string, artifact model.WorkflowArtifact) (string, string) {
	if stageID == WorkflowStageScriptAdaptation {
		return "只输出 JSON，包含 productionScript。不得改变原始剧情事实。", "请把以下剧本整理成生产剧本：\n" + run.ScriptSnapshot
	}
	return workflowStagePrompts(run, stageID, artifact)
}

func workflowSkillRunStage(stageKey string) string {
	switch stageKey {
	case WorkflowSkillStageScript:
		return WorkflowStageScriptAdaptation
	case WorkflowSkillStageArt:
		return WorkflowStageArtDesign
	case WorkflowSkillStageAssets:
		return WorkflowStageAssetGeneration
	case WorkflowSkillStageStoryboard:
		return WorkflowStageSeedanceStoryboard
	default:
		return ""
	}
}

func workflowSkillEvaluationModel(executor AgentRunExecutor) string {
	if executor.Kind() == AgentRunExecutorCodexCLI {
		return codexAgentRunModel()
	}
	return "default"
}

func workflowSkillManifestImageCount(manifestJSON string) int {
	var manifest struct {
		Items []json.RawMessage `json:"items"`
	}
	_ = json.Unmarshal([]byte(manifestJSON), &manifest)
	return len(manifest.Items)
}

func evaluateDeterministicWorkflowSkill(adminID string, workflow model.WorkflowRun, skill model.WorkflowSkill, version model.WorkflowSkillVersion, packageValue WorkflowSkillPackage) (WorkflowSkillEvaluationResult, error) {
	stamp := now()
	inputHash := workflowContentHash([]byte(workflow.ScriptHash + skill.StageKey))
	result := map[string]any{"status": "passed", "contentHash": packageValue.ContentHash, "contractValid": true}
	resultJSON, _ := json.Marshal(map[string]any{"contentHash": version.ContentHash, "candidate": result})
	evaluation := model.WorkflowSkillEvaluation{
		ID: newID("skilleval"), SkillVersionID: version.ID, ContentHash: version.ContentHash,
		ProjectID: workflow.ProjectID, EpisodeID: workflow.EpisodeID, InputHash: inputHash,
		ResultJSON: string(resultJSON), DiffJSON: `{"sameInput":true}`, GateJSON: `{"passed":true}`, Status: "passed",
		CreatedBy: adminID, CreatedAt: stamp, UpdatedAt: stamp,
	}
	if err := repository.CreateWorkflowSkillEvaluation(evaluation); err != nil {
		return WorkflowSkillEvaluationResult{}, err
	}
	return WorkflowSkillEvaluationResult{Evaluation: evaluation, Candidate: result, Diff: map[string]any{"sameInput": true}}, nil
}
