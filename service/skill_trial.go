package service

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

type SkillTrialInput struct {
	InputText      string             `json:"inputText"`
	InputArtifacts []ArtifactRefInput `json:"inputArtifacts"`
	ConfirmAPICost bool               `json:"confirmApiCost"`
}

type SkillTrialResult struct {
	Evaluation model.SkillEvaluation `json:"evaluation"`
	StageKey   string                `json:"stageKey"`
	Raw        map[string]any        `json:"raw"`
	Standard   map[string]any        `json:"standard"`
	Diff       map[string]any        `json:"diff"`
	Gates      []WorkflowGateIssue   `json:"gates"`
}

func TrialSkill(userID, versionID string, input SkillTrialInput) (SkillTrialResult, error) {
	skill, version, ok, err := repository.GetSkillWithVersion(strings.TrimSpace(versionID))
	if err != nil || !ok {
		return SkillTrialResult{}, safeMessageError{message: "Skill 版本不存在"}
	}
	template, err := ResolveSkillStageTemplate(skill.StageKey)
	if err != nil {
		return SkillTrialResult{}, err
	}
	packageValue, err := DecodeSkillPackage(version)
	if err != nil {
		return SkillTrialResult{}, err
	}
	inputText := strings.TrimSpace(input.InputText)
	if inputText == "" && len(input.InputArtifacts) == 0 {
		return SkillTrialResult{}, safeMessageError{message: "试跑至少需要一段输入文本或一个 Artifact"}
	}
	artifacts, snapshots, err := ResolveArtifactRefs(userID, input.InputArtifacts)
	if err != nil {
		return SkillTrialResult{}, err
	}
	executor, err := skillEvaluationExecutorFactory()
	if err != nil {
		return SkillTrialResult{}, err
	}
	if executor.Kind() == AgentRunExecutorAPI && !input.ConfirmAPICost {
		return SkillTrialResult{}, safeMessageError{message: "API 试跑会产生上游费用，必须显式确认"}
	}
	inputSnapshot := map[string]any{"inputText": inputText, "inputArtifacts": snapshots}
	inputSnapshotJSON, _ := marshalInvocationCanonical(inputSnapshot)
	userPromptJSON, _ := json.Marshal(map[string]any{"text": inputText, "artifacts": artifacts})
	systemPrompt := "你正在执行一次独立 Skill 试跑。严格遵循 Skill 文件，只输出契约要求的 JSON，不要输出解释。\n\n"
	raw, standard, diff, gates, duration := executeSkillTrial(executor, skill, version, packageValue, template, systemPrompt, string(userPromptJSON))
	status, errorMessage := "passed", ""
	if !gates.Passed {
		status = "failed"
		if len(gates.Issues) > 0 {
			errorMessage = gates.Issues[0].Message
		}
	}
	resultJSON, _ := json.Marshal(map[string]any{"contentHash": version.ContentHash, "raw": raw, "standard": standard})
	diffJSON, _ := json.Marshal(diff)
	gateJSON, _ := json.Marshal(gates)
	stamp := now()
	evaluation := model.SkillEvaluation{
		ID: newID("skilleval"), SkillVersionID: version.ID, ContentHash: version.ContentHash,
		InputHash: workflowContentHash(inputSnapshotJSON), InputSnapshotJSON: string(inputSnapshotJSON),
		ImageManifestJSON: `{"items":[]}`, ResultJSON: string(resultJSON), DiffJSON: string(diffJSON), GateJSON: string(gateJSON),
		Status: status, ErrorMessage: errorMessage, DurationMs: duration, CreatedBy: userID, CreatedAt: stamp, UpdatedAt: stamp,
	}
	summary, _ := json.Marshal(map[string]any{"evaluationId": evaluation.ID, "status": evaluation.Status, "contentHash": evaluation.ContentHash, "durationMs": evaluation.DurationMs, "standalone": true})
	if err := repository.CreateSkillEvaluationAndUpdateSummary(evaluation, string(summary), stamp); err != nil {
		return SkillTrialResult{}, err
	}
	return SkillTrialResult{Evaluation: evaluation, StageKey: template.Key, Raw: raw, Standard: standard, Diff: diff, Gates: gates.Issues}, nil
}

func executeSkillTrial(executor AgentRunExecutor, skill model.SkillDefinition, version model.SkillVersion, packageValue SkillPackage, template SkillStageTemplate, systemPrompt, userPrompt string) (map[string]any, map[string]any, map[string]any, WorkflowGateReport, int64) {
	modelName := workflowSkillEvaluationModel(executor)
	run := model.AgentRun{Executor: executor.Kind(), ExecutionKind: packageValue.Manifest.ExecutorKind, Model: modelName, TimeoutSeconds: 600, ImageManifestJSON: `{"items":[]}`}
	if executor.Kind() == AgentRunExecutorAPI {
		resolved, err := resolveAgentRunChannel(CreateAgentRunInput{})
		if err != nil {
			report := newWorkflowGateReport()
			report.add("execution_target", err.Error(), "")
			return map[string]any{}, map[string]any{}, map[string]any{"structureChanged": false, "contentChanged": false}, report.finish(), 0
		}
		modelName, run.Model, run.ChannelID = resolved.ModelName, resolved.ModelName, resolved.Channel.ID
	}
	requestJSON, err := buildAgentRunChatRequest(CreateAgentRunInput{SystemPrompt: systemPrompt + SkillPackageInstructions(packageValue.Files), UserPrompt: userPrompt}, modelName)
	if err != nil {
		report := newWorkflowGateReport()
		report.add("request", err.Error(), "")
		return map[string]any{}, map[string]any{}, map[string]any{"structureChanged": false, "contentChanged": false}, report.finish(), 0
	}
	run.RequestJSON = string(requestJSON)
	started := time.Now()
	call := executor.Call(context.Background(), run)
	duration := time.Since(started).Milliseconds()
	report := newWorkflowGateReport()
	if call.message != "" {
		report.add("execution", call.message, "")
		return map[string]any{}, map[string]any{}, map[string]any{"structureChanged": false, "contentChanged": false}, report.finish(), duration
	}
	content := workflowAgentRunContent(model.AgentRun{RawOutput: call.rawOutput, StructuredDraftJSON: call.structuredJSON})
	var raw map[string]any
	if json.Unmarshal(content, &raw) != nil {
		report.add("invalid_json", "Skill 没有返回可用的 JSON 对象", "")
		return map[string]any{}, map[string]any{}, map[string]any{"structureChanged": false, "contentChanged": false}, report.finish(), duration
	}
	converted, diff, err := ConvertSkillStageOutput(template, raw)
	if err != nil {
		report.add("fixed_adapter", "固定转换失败："+err.Error(), "")
		return raw, map[string]any{}, map[string]any{"structureChanged": false, "contentChanged": false}, report.finish(), duration
	}
	appendSkillSchemaIssues(converted, packageValue.OutputContract, &report)
	report = report.finish()
	var standard map[string]any
	_ = json.Unmarshal(converted, &standard)
	return raw, standard, diff, report, duration
}

func GetSkillTrialResult(id string) (SkillTrialResult, error) {
	evaluation, ok, err := repository.GetSkillEvaluation(strings.TrimSpace(id))
	if err != nil || !ok {
		return SkillTrialResult{}, safeMessageError{message: "Skill 试跑不存在"}
	}
	var stored struct {
		Raw      map[string]any `json:"raw"`
		Standard map[string]any `json:"standard"`
	}
	var diff map[string]any
	var gates WorkflowGateReport
	_ = json.Unmarshal([]byte(evaluation.ResultJSON), &stored)
	_ = json.Unmarshal([]byte(evaluation.DiffJSON), &diff)
	_ = json.Unmarshal([]byte(evaluation.GateJSON), &gates)
	skill, _, found, _ := repository.GetSkillWithVersion(evaluation.SkillVersionID)
	stageKey := ""
	if found {
		stageKey = skill.StageKey
	}
	return SkillTrialResult{Evaluation: evaluation, StageKey: stageKey, Raw: stored.Raw, Standard: stored.Standard, Diff: diff, Gates: gates.Issues}, nil
}

func GetManagedSkillTrialResult(userID, id string, isAdmin bool) (SkillTrialResult, error) {
	evaluation, ok, err := repository.GetSkillEvaluation(strings.TrimSpace(id))
	if err != nil || !ok {
		return SkillTrialResult{}, safeMessageError{message: "Skill 试跑不存在"}
	}
	if _, _, err := GetManagedSkillVersionPackage(userID, evaluation.SkillVersionID, isAdmin); err != nil {
		return SkillTrialResult{}, err
	}
	return GetSkillTrialResult(evaluation.ID)
}
