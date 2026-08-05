package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

type SkillTrialInput struct {
	InputText      string             `json:"inputText"`
	InputArtifacts []ArtifactRefInput `json:"inputArtifacts"`
	Parameters     json.RawMessage    `json:"parameters"`
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
	packageValue, err := DecodeSkillPackage(version)
	if err != nil {
		return SkillTrialResult{}, err
	}
	var template SkillStageTemplate
	if version.SourceKind == "folder_import" {
		template, err = ResolveImportedSkillStageSnapshot(version, packageValue)
	} else {
		template, err = ResolveSkillStageTemplate(skill.StageKey)
	}
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
	bindings := make([]ResolvedArtifactBinding, len(artifacts))
	for index := range artifacts {
		bindings[index] = ResolvedArtifactBinding{BindingName: snapshots[index].BindingName, Artifact: artifacts[index], Snapshot: snapshots[index]}
	}
	executor, err := skillEvaluationExecutorFactory()
	if err != nil {
		return SkillTrialResult{}, err
	}
	if executor.Kind() == AgentRunExecutorAPI && !input.ConfirmAPICost {
		return SkillTrialResult{}, safeMessageError{message: "API 试跑会产生上游费用，必须显式确认"}
	}
	parameters := input.Parameters
	if len(parameters) == 0 {
		parameters = json.RawMessage(`{}`)
	}
	var parameterValue map[string]any
	if json.Unmarshal(parameters, &parameterValue) != nil {
		return SkillTrialResult{}, safeMessageError{message: "试跑参数必须是 JSON 对象"}
	}
	inputSnapshot := map[string]any{"inputText": inputText, "inputArtifacts": snapshots, "parameters": parameterValue}
	inputSnapshotJSON, _ := marshalInvocationCanonical(inputSnapshot)
	coreSnapshot, err := skillTrialCoreSchemaSnapshot(packageValue)
	if err != nil {
		return SkillTrialResult{}, err
	}
	promptInputs := make([]invocationPromptInput, 0, len(bindings))
	ordinals := map[string]int{}
	for _, binding := range bindings {
		promptInputs = append(promptInputs, invocationPromptInput{BindingName: binding.BindingName, Ordinal: ordinals[binding.BindingName], Artifact: binding.Artifact})
		ordinals[binding.BindingName]++
	}
	systemPrompt, userPrompt, err := buildSkillExecutionPrompts(packageValue, version.SourceKind, coreSnapshot, map[string]any{"text": inputText, "parameters": parameterValue, "inputs": promptInputs})
	if err != nil {
		return SkillTrialResult{}, err
	}
	raw, standard, diff, gates, duration, imageManifest := executeSkillTrial(executor, skill, version, packageValue, template, bindings, parameters, inputText, systemPrompt, userPrompt)
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
		ImageManifestJSON: imageManifest, ResultJSON: string(resultJSON), DiffJSON: string(diffJSON), GateJSON: string(gateJSON),
		Status: status, ErrorMessage: errorMessage, DurationMs: duration, CreatedBy: userID, CreatedAt: stamp, UpdatedAt: stamp,
	}
	summary, _ := json.Marshal(map[string]any{"evaluationId": evaluation.ID, "status": evaluation.Status, "contentHash": evaluation.ContentHash, "durationMs": evaluation.DurationMs, "standalone": true})
	if err := repository.CreateSkillEvaluationAndUpdateSummary(evaluation, string(summary), stamp); err != nil {
		return SkillTrialResult{}, err
	}
	return SkillTrialResult{Evaluation: evaluation, StageKey: template.Key, Raw: raw, Standard: standard, Diff: diff, Gates: gates.Issues}, nil
}

func skillTrialCoreSchemaSnapshot(packageValue SkillPackage) ([]byte, error) {
	outputs := make([]map[string]any, 0, len(packageValue.OutputContract.ArtifactOutputs))
	for _, spec := range packageValue.OutputContract.ArtifactOutputs {
		schema, err := ResolveArtifactSchema(spec.ArtifactType, coreArtifactSchemaVersion)
		if err != nil {
			return nil, err
		}
		outputs = append(outputs, map[string]any{"spec": spec, "schema": schema})
	}
	return marshalInvocationCanonical(map[string]any{"outputs": outputs})
}

func executeSkillTrial(executor AgentRunExecutor, skill model.SkillDefinition, version model.SkillVersion, packageValue SkillPackage, template SkillStageTemplate, bindings []ResolvedArtifactBinding, parameters json.RawMessage, inputText, systemPrompt, userPrompt string) (map[string]any, map[string]any, map[string]any, WorkflowGateReport, int64, string) {
	modelName := workflowSkillEvaluationModel(executor)
	run := model.AgentRun{Executor: executor.Kind(), ExecutionKind: packageValue.Manifest.ExecutorKind, Model: modelName, TimeoutSeconds: 600, ImageManifestJSON: `{"items":[]}`}
	if executor.Kind() == AgentRunExecutorAPI {
		resolved, err := resolveAgentRunChannelForCapability(CreateAgentRunInput{}, agentRunModelCapability(packageValue.Manifest.ExecutorKind))
		if err != nil {
			report := newWorkflowGateReport()
			report.add("execution_target", err.Error(), "")
			return map[string]any{}, map[string]any{}, map[string]any{"structureChanged": false, "contentChanged": false}, report.finish(), 0, run.ImageManifestJSON
		}
		modelName, run.Model, run.ChannelID, run.Provider, run.Protocol = resolved.ModelName, resolved.ModelName, resolved.Channel.ID, resolved.Channel.Name, resolved.Channel.Protocol
	}
	expectedImageOutputs := 0
	var requestJSON []byte
	var err error
	if packageValue.Manifest.ExecutorKind == "image_model" {
		bindings, err = skillTrialImageBindings(packageValue, bindings, inputText)
		if err == nil {
			requestJSON, run.ImageManifestJSON, expectedImageOutputs, err = buildSkillTrialImageRequest(parameters, packageValue, bindings, inputText, modelName)
		}
	} else {
		requestJSON, err = buildAgentRunChatRequest(CreateAgentRunInput{SystemPrompt: systemPrompt, UserPrompt: userPrompt}, modelName)
	}
	if err != nil {
		report := newWorkflowGateReport()
		report.add("request", err.Error(), "")
		return map[string]any{}, map[string]any{}, map[string]any{"structureChanged": false, "contentChanged": false}, report.finish(), 0, run.ImageManifestJSON
	}
	run.RequestJSON = string(requestJSON)
	started := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(run.TimeoutSeconds)*time.Second)
	defer cancel()
	call := executor.Call(ctx, run)
	duration := time.Since(started).Milliseconds()
	report := newWorkflowGateReport()
	if call.message != "" {
		report.add("execution", call.message, "")
		return map[string]any{}, map[string]any{}, map[string]any{"structureChanged": false, "contentChanged": false}, report.finish(), duration, run.ImageManifestJSON
	}
	content := workflowAgentRunContent(model.AgentRun{RawOutput: call.rawOutput, StructuredDraftJSON: call.structuredJSON})
	var raw map[string]any
	if json.Unmarshal(content, &raw) != nil {
		report.add("invalid_json", "Skill 没有返回可用的 JSON 对象", "")
		return map[string]any{}, map[string]any{}, map[string]any{"structureChanged": false, "contentChanged": false}, report.finish(), duration, run.ImageManifestJSON
	}
	declared, err := parseInvocationDeclaredOutputs(string(content), packageValue.OutputContract.ArtifactOutputs)
	if err != nil {
		report.add("declared_output", "Skill 输出数量或 binding 无效："+err.Error(), "")
		return raw, map[string]any{}, map[string]any{"structureChanged": false, "contentChanged": false}, report.finish(), duration, run.ImageManifestJSON
	}
	if expectedImageOutputs > 0 && len(declared) != expectedImageOutputs {
		report.add("image_output_count", "图片模型返回数量与试跑请求不一致", "")
	}
	standardOutputs, diffOutputs := make([]any, 0, len(declared)), make([]any, 0, len(declared))
	structureChanged, contentChanged := false, false
	for _, output := range declared {
		itemID := fmt.Sprintf("%s#%d", output.bindingName, output.ordinal)
		if output.validationError != nil {
			report.add("output_payload", output.validationError.Error(), itemID)
			continue
		}
		appendSkillSchemaIssues(output.raw, packageValue.OutputContract, &report)
		converted, itemDiff, convertErr := ConvertSkillStageOutput(template, output.payload)
		if convertErr != nil {
			report.add("fixed_adapter", "固定转换失败："+convertErr.Error(), itemID)
			continue
		}
		standardSchema, schemaErr := ResolveArtifactSchema(template.OutputType, coreArtifactSchemaVersion)
		if schemaErr != nil || ValidateArtifactPayload(standardSchema, converted) != nil {
			report.add("output_schema", "固定转换产物不符合标准 Core Schema", itemID)
			continue
		}
		var payload map[string]any
		_ = json.Unmarshal(converted, &payload)
		standardOutputs = append(standardOutputs, map[string]any{"bindingName": output.bindingName, "ordinal": output.ordinal, "payload": payload})
		itemDiff["bindingName"], itemDiff["ordinal"], itemDiff["itemId"] = output.bindingName, output.ordinal, itemID
		diffOutputs = append(diffOutputs, itemDiff)
		if changed, _ := itemDiff["structureChanged"].(bool); changed {
			structureChanged = true
		}
		if changed, _ := itemDiff["contentChanged"].(bool); changed {
			contentChanged = true
			report.add("content_fidelity", "固定转换内容保真校验失败："+workflowAdapterContentFidelitySummary(itemDiff), itemID)
		}
	}
	report = report.finish()
	standard, diff := formatSkillTrialOutputs(packageValue.OutputContract.ArtifactOutputs, standardOutputs, diffOutputs, structureChanged, contentChanged)
	return raw, standard, diff, report, duration, run.ImageManifestJSON
}

func skillTrialImageBindings(packageValue SkillPackage, bindings []ResolvedArtifactBinding, inputText string) ([]ResolvedArtifactBinding, error) {
	if len(bindings) > 0 {
		return bindings, nil
	}
	if len(packageValue.InputContract.ArtifactInputs) != 1 || packageValue.InputContract.ArtifactInputs[0].ArtifactType != "asset_brief" || strings.TrimSpace(inputText) == "" {
		return nil, safeMessageError{message: "图片 Skill 试跑需要 asset_brief Artifact 或一段资产 Brief 文本"}
	}
	spec := packageValue.InputContract.ArtifactInputs[0]
	artifact := ArtifactEnvelope{Artifact: model.Artifact{ID: "trial-input", ArtifactType: "asset_brief", SchemaVersion: coreArtifactSchemaVersion}, Payload: map[string]any{"assetId": "trial-input", "brief": strings.TrimSpace(inputText), "format": "trial"}}
	return []ResolvedArtifactBinding{{BindingName: spec.BindingName, Artifact: artifact}}, nil
}

func buildSkillTrialImageRequest(parameters json.RawMessage, packageValue SkillPackage, bindings []ResolvedArtifactBinding, inputText, modelName string) ([]byte, string, int, error) {
	count, requestJSON, err := freezeInvocationImageRequest(parameters, packageValue, bindings, modelName)
	if err != nil {
		return nil, "", 0, err
	}
	var request map[string]any
	if json.Unmarshal([]byte(requestJSON), &request) != nil {
		return nil, "", 0, errors.New("图片试跑请求无效")
	}
	if text := strings.TrimSpace(inputText); text != "" {
		request["prompt"] = strings.TrimSpace(fmt.Sprint(request["prompt"])) + "\n\n【试跑补充输入】\n" + text
	}
	encoded, err := marshalInvocationCanonical(request)
	if err != nil {
		return nil, "", 0, err
	}
	assetID := ""
	for _, binding := range bindings {
		if binding.Artifact.Artifact.ArtifactType == "asset_brief" {
			assetID, _ = binding.Artifact.Payload["assetId"].(string)
			break
		}
	}
	output := packageValue.OutputContract.ArtifactOutputs[0]
	ordinals := make([]int, count)
	for index := range ordinals {
		ordinals[index] = index
	}
	manifest, err := marshalInvocationCanonical(map[string]any{"assetId": assetID, "bindingName": output.BindingName, "ordinals": ordinals})
	return encoded, string(manifest), count, err
}

func formatSkillTrialOutputs(specs []ArtifactOutputSpec, outputs, diffs []any, structureChanged, contentChanged bool) (map[string]any, map[string]any) {
	if len(specs) == 1 && specs[0].Max == 1 && len(outputs) == 1 {
		output, _ := outputs[0].(map[string]any)
		payload, _ := output["payload"].(map[string]any)
		diff, _ := diffs[0].(map[string]any)
		delete(diff, "bindingName")
		delete(diff, "ordinal")
		return payload, diff
	}
	return map[string]any{"outputs": outputs}, map[string]any{"outputs": diffs, "structureChanged": structureChanged, "contentChanged": contentChanged}
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
