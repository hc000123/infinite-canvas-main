package service

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func EnsureWorkflowRun(userID string, input EnsureWorkflowRunInput) (WorkflowRunDetail, error) {
	userID = strings.TrimSpace(userID)
	input.ProjectID = strings.TrimSpace(input.ProjectID)
	input.EpisodeID = strings.TrimSpace(input.EpisodeID)
	input.ScriptSnapshot = strings.TrimSpace(input.ScriptSnapshot)
	if userID == "" || input.ProjectID == "" || input.EpisodeID == "" {
		return WorkflowRunDetail{}, safeMessageError{message: "缺少用户、项目或分集信息"}
	}
	if len(input.ScriptSnapshot) > maxWorkflowScriptBytes {
		return WorkflowRunDetail{}, safeMessageError{message: "剧本内容过长，请按分集拆分后再创建工作流"}
	}
	workflowID := strings.TrimSpace(input.WorkflowID)
	if workflowID == "" {
		workflowID = VideoWorkflowID
	}
	workflowVersion := strings.TrimSpace(input.WorkflowVersion)
	if workflowVersion == "" {
		workflowVersion = VideoWorkflowVersion
	}
	scriptHash := workflowContentHash([]byte(input.ScriptSnapshot))
	if existing, ok, err := repository.FindWorkflowRunByScope(userID, input.ProjectID, input.EpisodeID, workflowID, workflowVersion, scriptHash); err != nil {
		return WorkflowRunDetail{}, err
	} else if ok {
		return GetWorkflowRunDetail(userID, existing.ID)
	}

	stamp := now()
	run := model.WorkflowRun{
		ID:              newID("workflow"),
		UserID:          userID,
		ProjectID:       input.ProjectID,
		EpisodeID:       input.EpisodeID,
		WorkflowID:      workflowID,
		WorkflowVersion: workflowVersion,
		ScriptHash:      scriptHash,
		ScriptSnapshot:  input.ScriptSnapshot,
		CurrentStageID:  WorkflowStageScriptAdaptation,
		Status:          model.WorkflowRunStatusActive,
		CreatedAt:       stamp,
		UpdatedAt:       stamp,
	}
	confirmed := input.ScriptConfirmed && input.ScriptSnapshot != ""
	scriptStatus := model.WorkflowStageRunStatusBlocked
	assetExtractionStatus := model.WorkflowStageRunStatusBlocked
	shotBreakdownStatus := model.WorkflowStageRunStatusBlocked
	if confirmed {
		scriptStatus = model.WorkflowStageRunStatusApproved
		assetExtractionStatus = model.WorkflowStageRunStatusReady
		shotBreakdownStatus = model.WorkflowStageRunStatusReady
		run.CurrentStageID = WorkflowStageAssetExtraction
	}
	stages := []model.WorkflowStageRun{
		workflowInitialStage(run, WorkflowStageScriptAdaptation, scriptStatus, stamp),
		workflowInitialStage(run, WorkflowStageAssetExtraction, assetExtractionStatus, stamp),
		workflowInitialStage(run, WorkflowStageAssetImagePrompt, model.WorkflowStageRunStatusBlocked, stamp),
		workflowInitialStage(run, WorkflowStageShotBreakdown, shotBreakdownStatus, stamp),
		workflowInitialStage(run, WorkflowStageShotPrompt, model.WorkflowStageRunStatusBlocked, stamp),
	}
	artifacts := []model.WorkflowArtifact{}
	gates := []model.WorkflowQualityGateResult{}
	events := []model.WorkflowEvent{workflowEvent(run, model.WorkflowStageRun{}, "workflow.created", "info", map[string]any{"scriptConfirmed": confirmed}, stamp)}
	if confirmed {
		content, _ := json.Marshal(map[string]any{"productionScript": input.ScriptSnapshot})
		artifact := workflowArtifact(run, stages[0], model.AgentRun{}, "script", 1, content, stamp)
		report := ValidateScriptArtifact(content)
		gate := workflowGateResult(run, stages[0], artifact, report, stamp)
		stages[0].OutputArtifactID = artifact.ID
		stages[0].ReviewDecision = "approved"
		stages[0].ReviewedArtifactHash = artifact.ContentHash
		stages[0].ReviewedAt = stamp
		artifacts = append(artifacts, artifact)
		gates = append(gates, gate)
		events = append(events, workflowEvent(run, stages[0], "stage.approved", "info", map[string]any{"artifactHash": artifact.ContentHash, "system": true}, stamp))
	}
	if err := repository.CreateWorkflowRunAggregate(run, stages, artifacts, gates, events); err != nil {
		if existing, ok, lookupErr := repository.FindWorkflowRunByScope(userID, input.ProjectID, input.EpisodeID, workflowID, workflowVersion, scriptHash); lookupErr == nil && ok {
			return GetWorkflowRunDetail(userID, existing.ID)
		}
		return WorkflowRunDetail{}, err
	}
	return GetWorkflowRunDetail(userID, run.ID)
}

func GetWorkflowRunDetail(userID string, id string) (WorkflowRunDetail, error) {
	run, ok, err := repository.GetUserWorkflowRun(userID, id)
	if err != nil {
		return WorkflowRunDetail{}, err
	}
	if !ok {
		return WorkflowRunDetail{}, safeMessageError{message: "工作流不存在"}
	}
	allStages, err := repository.ListWorkflowStageRuns(userID, run.ID)
	if err != nil {
		return WorkflowRunDetail{}, err
	}
	latest := map[string]model.WorkflowStageRun{}
	for _, stage := range allStages {
		if _, exists := latest[stage.StageID]; !exists {
			latest[stage.StageID] = stage
		}
	}
	stages := make([]model.WorkflowStageRun, 0, 5)
	for _, stageID := range []string{WorkflowStageScriptAdaptation, WorkflowStageAssetExtraction, WorkflowStageAssetImagePrompt, WorkflowStageShotBreakdown, WorkflowStageShotPrompt} {
		if stage, exists := latest[stageID]; exists {
			stages = append(stages, stage)
		}
	}
	artifacts, err := repository.ListWorkflowArtifacts(userID, run.ID)
	if err != nil {
		return WorkflowRunDetail{}, err
	}
	gates, err := repository.ListWorkflowQualityGateResults(userID, run.ID)
	if err != nil {
		return WorkflowRunDetail{}, err
	}
	agentRuns, _, err := repository.ListAgentRuns(userID, model.AgentRunQuery{WorkflowRunID: run.ID, Page: 1, PageSize: model.MaxPageSize})
	return WorkflowRunDetail{Run: run, Stages: stages, Artifacts: artifacts, Gates: gates, AgentRuns: agentRuns}, err
}

func StartWorkflowStage(userID string, workflowRunID string, stageID string, idempotencyKey string) (model.WorkflowStageRun, error) {
	return StartWorkflowStageWithInput(userID, workflowRunID, stageID, WorkflowStageStartInput{IdempotencyKey: idempotencyKey})
}

func StartWorkflowStageWithMedia(userID string, workflowRunID string, stageID string, idempotencyKey string, mediaBatchID string) (model.WorkflowStageRun, error) {
	return StartWorkflowStageWithInput(userID, workflowRunID, stageID, WorkflowStageStartInput{IdempotencyKey: idempotencyKey, MediaBatchID: mediaBatchID})
}

func StartWorkflowStageWithInput(userID string, workflowRunID string, stageID string, input WorkflowStageStartInput) (model.WorkflowStageRun, error) {
	return startWorkflowStage(userID, workflowRunID, stageID, input, nil)
}

func startWorkflowStage(userID string, workflowRunID string, stageID string, input WorkflowStageStartInput, frozenRun *model.AgentRun) (model.WorkflowStageRun, error) {
	detail, err := GetWorkflowRunDetail(userID, workflowRunID)
	if err != nil {
		return model.WorkflowStageRun{}, err
	}
	stageID = strings.TrimSpace(stageID)
	current := workflowDetailStage(detail, stageID)
	if current.ID == "" {
		return model.WorkflowStageRun{}, safeMessageError{message: "工作流阶段不存在"}
	}
	if stageID == WorkflowStageScriptAdaptation {
		if current.Status == model.WorkflowStageRunStatusBlocked {
			return current, safeMessageError{message: "请先在分集页确认生产剧本"}
		}
		return current, nil
	}
	if stageID != WorkflowStageAssetExtraction && stageID != WorkflowStageAssetImagePrompt && stageID != WorkflowStageShotBreakdown && stageID != WorkflowStageShotPrompt {
		return model.WorkflowStageRun{}, safeMessageError{message: "不支持的工作流阶段"}
	}
	if workflowStageBusyOrReviewable(current.Status) && !(stageID == WorkflowStageShotPrompt && (current.Status == model.WorkflowStageRunStatusApproved || current.Status == model.WorkflowStageRunStatusApplied)) {
		return current, nil
	}
	var context *WorkflowShotPromptContext
	if frozenRun == nil || len(input.Context) > 0 {
		context, err = validateWorkflowStageContext(stageID, input.Context)
		if err != nil {
			return current, err
		}
	}
	inputArtifact, err := workflowStageInputArtifact(detail, stageID)
	if err != nil {
		return current, err
	}
	systemPrompt, userPrompt := workflowStagePrompts(detail.Run, stageID, inputArtifact, context)
	executorKind := ""
	imageManifestJSON := `{"items":[],"degraded":true,"reason":"text-only"}`
	sourceSnapshot := map[string]any{}
	skillID, skillVersionID, skillVersion, skillContentHash, skillSnapshotJSON := "", "", "", "", ""
	if frozenRun != nil && strings.TrimSpace(frozenRun.SkillSnapshotJSON) != "" {
		instructions, err := workflowSkillInstructionsFromSnapshot(frozenRun.SkillSnapshotJSON)
		if err != nil {
			return current, err
		}
		if frozenSystemPrompt, frozenUserPrompt, ok := workflowPromptsFromFrozenRun(*frozenRun); ok {
			systemPrompt, userPrompt = frozenSystemPrompt, frozenUserPrompt
		} else {
			systemPrompt += instructions
		}
		skillID, skillVersionID = frozenRun.SkillID, frozenRun.SkillVersionID
		skillVersion, skillContentHash = frozenRun.SkillVersion, frozenRun.SkillContentHash
		skillSnapshotJSON = frozenRun.SkillSnapshotJSON
		executorKind = frozenRun.Executor
		imageManifestJSON = frozenRun.ImageManifestJSON
		sourceSnapshot = workflowSourceSnapshotFromRequest(frozenRun.RequestJSON)
	} else {
		if err := EnsureWorkflowSkillSeeds(); err != nil {
			return current, err
		}
		resolvedSkill, err := ResolveWorkflowSkillForStage(stageID, detail.Run.ProjectID, input.SkillVersionID)
		if err != nil {
			return current, err
		}
		systemPrompt += workflowSkillInstructions(resolvedSkill)
		skillID, skillVersionID = resolvedSkill.Skill.ID, resolvedSkill.Version.ID
		skillVersion, skillContentHash = resolvedSkill.Version.Version, resolvedSkill.Version.ContentHash
		skillSnapshotJSON = workflowSkillSnapshotJSON(resolvedSkill)
		if resolvedSkill.Package.Contract.ImagePolicy.Required && strings.TrimSpace(input.MediaBatchID) == "" {
			return current, safeMessageError{message: "当前 Skill 要求上传参考图片"}
		}
	}
	if context != nil {
		sourceSnapshot = map[string]any{"shotId": context.ShotID, "promptInputHash": context.PromptInputHash}
	}
	agentRun, err := CreateUserAgentRun(userID, CreateAgentRunInput{
		Executor:          executorKind,
		IdempotencyKey:    strings.TrimSpace(input.IdempotencyKey),
		ProjectID:         detail.Run.ProjectID,
		EpisodeID:         detail.Run.EpisodeID,
		WorkflowRunID:     detail.Run.ID,
		StageID:           stageID,
		AgentKind:         workflowStageAgentKind(stageID),
		SkillID:           skillID,
		SkillVersionID:    skillVersionID,
		SkillVersion:      skillVersion,
		SkillContentHash:  skillContentHash,
		SkillSnapshotJSON: skillSnapshotJSON,
		ImageManifestJSON: imageManifestJSON,
		MediaBatchID:      strings.TrimSpace(input.MediaBatchID),
		WritePolicy:       "confirm_before_write",
		SystemPrompt:      systemPrompt,
		UserPrompt:        userPrompt,
		SourceSnapshot:    sourceSnapshot,
	})
	if err != nil {
		return current, err
	}
	if existing, ok, err := repository.GetWorkflowStageRunByAgentRunID(agentRun.ID); err != nil {
		return current, err
	} else if ok {
		return existing, nil
	}
	stamp := now()
	stage := model.WorkflowStageRun{
		ID:               newID("workflowstage"),
		UserID:           detail.Run.UserID,
		WorkflowRunID:    detail.Run.ID,
		StageID:          stageID,
		AgentRunID:       agentRun.ID,
		Attempt:          current.Attempt + 1,
		Status:           model.WorkflowStageRunStatusQueued,
		InputArtifactID:  inputArtifact.ID,
		EstimatedCredits: agentRun.EstimatedCredits,
		ProgressTotal:    1,
		CreatedAt:        stamp,
		UpdatedAt:        stamp,
	}
	event := workflowEvent(detail.Run, stage, "stage.queued", "info", map[string]any{
		"agentRunId": agentRun.ID, "attempt": stage.Attempt,
		"skillId": agentRun.SkillID, "skillVersion": agentRun.SkillVersion, "skillContentHash": agentRun.SkillContentHash,
	}, stamp)
	if err := repository.CreateWorkflowStageWithEvent(stage, event); err != nil {
		return stage, err
	}
	detail.Run.CurrentStageID = stageID
	detail.Run.UpdatedAt = stamp
	_, _ = repository.SaveWorkflowRun(detail.Run)
	return stage, nil
}

func CompleteWorkflowStageAgentRun(run model.AgentRun) error {
	if strings.TrimSpace(run.WorkflowRunID) == "" || strings.TrimSpace(run.StageID) == "" {
		return nil
	}
	stage, ok, err := repository.GetWorkflowStageRunByAgentRunID(run.ID)
	if err != nil || !ok {
		return err
	}
	if stage.OutputArtifactID != "" {
		return nil
	}
	workflowRun, ok, err := repository.GetUserWorkflowRun(run.UserID, run.WorkflowRunID)
	if err != nil || !ok {
		return err
	}
	content := normalizeWorkflowArtifactContent(stage.StageID, workflowAgentRunContent(run))
	stamp := now()
	artifact := workflowArtifact(workflowRun, stage, run, stage.StageID, stage.Attempt, content, stamp)
	var report WorkflowGateReport
	switch stage.StageID {
	case WorkflowStageAssetExtraction:
		report = ValidateAssetExtractionArtifact(content)
	case WorkflowStageAssetImagePrompt:
		report = ValidateAssetImagePromptArtifact(content)
	case WorkflowStageShotBreakdown:
		report = ValidateShotBreakdownArtifact(content)
	case WorkflowStageShotPrompt:
		report = ValidateShotPromptArtifact(content)
		validateWorkflowShotPromptInputIdentity(content, run.RequestJSON, &report)
	default:
		report = ValidateScriptArtifact(content)
	}
	validateWorkflowReferenceEvidence(content, run.ImageManifestJSON, &report)
	if stage.StageID == WorkflowStageAssetImagePrompt && stage.InputArtifactID != "" {
		if inputArtifact, ok, err := repository.GetUserWorkflowArtifact(run.UserID, stage.InputArtifactID); err != nil {
			return err
		} else if ok {
			validateWorkflowAssetIdentity([]byte(inputArtifact.ContentJSON), content, &report)
		}
	}
	gate := workflowGateResult(workflowRun, stage, artifact, report, stamp)
	stage.OutputArtifactID = artifact.ID
	stage.Status = model.WorkflowStageRunStatusNeedsReview
	stage.ProgressCurrent = 1
	stage.FinishedAt = stamp
	stage.UpdatedAt = stamp
	event := workflowEvent(workflowRun, stage, "stage.needs_review", "info", map[string]any{"artifactId": artifact.ID, "artifactHash": artifact.ContentHash, "gatePassed": report.Passed}, stamp)
	return repository.CompleteWorkflowStage(stage, artifact, gate, event)
}

func SyncWorkflowStageFromAgentRun(run model.AgentRun) error {
	if run.WorkflowRunID == "" || run.StageID == "" {
		return nil
	}
	stage, ok, err := repository.GetWorkflowStageRunByAgentRunID(run.ID)
	if err != nil || !ok {
		return err
	}
	status := stage.Status
	switch run.Status {
	case model.AgentRunStatusQueued:
		status = model.WorkflowStageRunStatusQueued
	case model.AgentRunStatusRunning:
		status = model.WorkflowStageRunStatusRunning
	case model.AgentRunStatusCancelRequested:
		status = model.WorkflowStageRunStatusCancelRequested
	case model.AgentRunStatusCancelled:
		status = model.WorkflowStageRunStatusCancelled
	case model.AgentRunStatusFailed:
		status = model.WorkflowStageRunStatusFailed
	case model.AgentRunStatusNeedsReview:
		return CompleteWorkflowStageAgentRun(run)
	}
	if status == stage.Status && stage.ErrorMessage == run.ErrorMessage {
		return nil
	}
	workflowRun, ok, err := repository.GetUserWorkflowRun(run.UserID, run.WorkflowRunID)
	if err != nil || !ok {
		return err
	}
	stage.Status = status
	stage.ErrorMessage = run.ErrorMessage
	stage.UpdatedAt = now()
	if status == model.WorkflowStageRunStatusFailed || status == model.WorkflowStageRunStatusCancelled {
		stage.FinishedAt = stage.UpdatedAt
	}
	event := workflowEvent(workflowRun, stage, "stage."+string(status), "info", map[string]any{"agentRunId": run.ID, "attempt": run.Attempt}, stage.UpdatedAt)
	return repository.SaveWorkflowStageTransition(stage, event)
}

func ReviewWorkflowStage(userID string, stageRunID string, input WorkflowReviewInput) (model.WorkflowStageRun, error) {
	stage, ok, err := repository.GetUserWorkflowStageRun(userID, stageRunID)
	if err != nil {
		return stage, err
	}
	if !ok || stage.OutputArtifactID == "" {
		return stage, safeMessageError{message: "待审核阶段不存在"}
	}
	artifact, ok, err := repository.GetUserWorkflowArtifact(userID, stage.OutputArtifactID)
	if err != nil || !ok {
		return stage, safeMessageError{message: "待审核产物不存在"}
	}
	if strings.TrimSpace(input.ArtifactHash) == "" || strings.TrimSpace(input.ArtifactHash) != artifact.ContentHash {
		return stage, safeMessageError{message: "产物已变化，请重新打开后审核"}
	}
	decision := strings.TrimSpace(input.Decision)
	if decision != "approved" && decision != "rejected" {
		return stage, safeMessageError{message: "审核决定必须是 approved 或 rejected"}
	}
	if decision == "approved" {
		gate, ok, err := repository.GetWorkflowQualityGateForArtifact(userID, artifact.ID)
		if err != nil {
			return stage, err
		}
		if !ok || !gate.Passed {
			return stage, safeMessageError{message: "质量门未通过，不能批准当前产物"}
		}
		stage.Status = model.WorkflowStageRunStatusApproved
	} else {
		stage.Status = model.WorkflowStageRunStatusRejected
	}
	stamp := now()
	stage.ReviewDecision = decision
	stage.ReviewedArtifactHash = artifact.ContentHash
	stage.ReviewComment = strings.TrimSpace(input.Comment)
	stage.ReviewedAt = stamp
	stage.UpdatedAt = stamp
	workflowRun, _, err := repository.GetUserWorkflowRun(userID, stage.WorkflowRunID)
	if err != nil {
		return stage, err
	}
	event := workflowEvent(workflowRun, stage, "stage."+decision, "info", map[string]any{"artifactHash": artifact.ContentHash}, stamp)
	if err := repository.SaveWorkflowStageTransition(stage, event); err != nil {
		return stage, err
	}
	return stage, nil
}

func ApplyWorkflowStage(userID string, stageRunID string, input WorkflowApplyInput) (model.WorkflowStageRun, error) {
	stage, ok, err := repository.GetUserWorkflowStageRun(userID, stageRunID)
	if err != nil {
		return stage, err
	}
	if !ok || (stage.Status != model.WorkflowStageRunStatusApproved && stage.Status != model.WorkflowStageRunStatusApplied) {
		return stage, safeMessageError{message: "阶段尚未批准，不能应用到本地数据"}
	}
	artifact, ok, err := repository.GetUserWorkflowArtifact(userID, stage.OutputArtifactID)
	if err != nil || !ok {
		return stage, safeMessageError{message: "已批准产物不存在"}
	}
	if artifact.ContentHash != strings.TrimSpace(input.ArtifactHash) || stage.ReviewedArtifactHash != artifact.ContentHash {
		return stage, safeMessageError{message: "产物已变化，请重新审核后应用"}
	}
	if len(input.TargetIDs) > 5000 || len(input.Errors) > 100 {
		return stage, safeMessageError{message: "应用回执内容过多"}
	}
	receipt, _ := json.Marshal(input)
	stamp := now()
	stage.Status = model.WorkflowStageRunStatusApplied
	stage.ApplyReceiptJSON = string(receipt)
	stage.AppliedAt = stamp
	stage.UpdatedAt = stamp
	workflowRun, _, err := repository.GetUserWorkflowRun(userID, stage.WorkflowRunID)
	if err != nil {
		return stage, err
	}
	event := workflowEvent(workflowRun, stage, "stage.applied", "info", map[string]any{"target": input.Target, "appliedCount": input.AppliedCount, "skippedCount": input.SkippedCount}, stamp)
	if err := repository.SaveWorkflowStageTransition(stage, event); err != nil {
		return stage, err
	}
	return stage, nil
}

func workflowInitialStage(run model.WorkflowRun, stageID string, status model.WorkflowStageRunStatus, stamp string) model.WorkflowStageRun {
	return model.WorkflowStageRun{ID: newID("workflowstage"), UserID: run.UserID, WorkflowRunID: run.ID, StageID: stageID, Attempt: 0, Status: status, ProgressTotal: 1, CreatedAt: stamp, UpdatedAt: stamp}
}

func workflowArtifact(run model.WorkflowRun, stage model.WorkflowStageRun, agentRun model.AgentRun, kind string, version int, content []byte, stamp string) model.WorkflowArtifact {
	return model.WorkflowArtifact{ID: newID("artifact"), UserID: run.UserID, WorkflowRunID: run.ID, StageRunID: stage.ID, AgentRunID: agentRun.ID, Kind: kind, Version: version, SchemaVersion: workflowArtifactSchemaVersion, TemplateVersion: run.WorkflowVersion, ContentJSON: string(content), ContentHash: workflowContentHash(content), CreatedAt: stamp}
}

func workflowGateResult(run model.WorkflowRun, stage model.WorkflowStageRun, artifact model.WorkflowArtifact, report WorkflowGateReport, stamp string) model.WorkflowQualityGateResult {
	issues, _ := json.Marshal(report.Issues)
	return model.WorkflowQualityGateResult{ID: newID("workflowgate"), UserID: run.UserID, WorkflowRunID: run.ID, StageRunID: stage.ID, ArtifactID: artifact.ID, ArtifactHash: artifact.ContentHash, ValidatorVersion: report.Version, Passed: report.Passed, IssuesJSON: string(issues), CreatedAt: stamp}
}

func workflowEvent(run model.WorkflowRun, stage model.WorkflowStageRun, eventType string, level string, data any, stamp string) model.WorkflowEvent {
	value, _ := json.Marshal(data)
	return model.WorkflowEvent{UserID: run.UserID, WorkflowRunID: run.ID, StageRunID: stage.ID, AgentRunID: stage.AgentRunID, Type: eventType, Level: level, DataJSON: string(value), CreatedAt: stamp}
}

func workflowStageInputArtifact(detail WorkflowRunDetail, stageID string) (model.WorkflowArtifact, error) {
	dependency := WorkflowStageScriptAdaptation
	message := "请先确认生产剧本"
	if stageID == WorkflowStageAssetImagePrompt {
		dependency = WorkflowStageAssetExtraction
		message = "请先批准资产提取阶段"
	} else if stageID == WorkflowStageShotBreakdown {
		dependency = WorkflowStageScriptAdaptation
		message = "请先确认生产剧本"
	} else if stageID == WorkflowStageShotPrompt {
		dependency = WorkflowStageShotBreakdown
		message = "请先批准分镜拆解阶段"
	}
	stage := workflowDetailStage(detail, dependency)
	if stage.Status != model.WorkflowStageRunStatusApproved && stage.Status != model.WorkflowStageRunStatusApplied {
		return model.WorkflowArtifact{}, safeMessageError{message: message}
	}
	for index := len(detail.Artifacts) - 1; index >= 0; index-- {
		if detail.Artifacts[index].ID == stage.OutputArtifactID {
			return detail.Artifacts[index], nil
		}
	}
	return model.WorkflowArtifact{}, safeMessageError{message: message + "，且缺少已批准产物"}
}

func workflowStagePrompts(run model.WorkflowRun, stageID string, input model.WorkflowArtifact, context *WorkflowShotPromptContext) (string, string) {
	switch stageID {
	case WorkflowStageAssetExtraction:
		return "你是影视资产提取师。只从剧本提取需要保持一致的角色、场景、道具和角色外观马甲，不生成生图提示词。只输出 JSON：items[].logicalAssetId/kind/name/scriptEvidence/description；服装、发型、妆容、年龄阶段和受伤状态统一使用 kind=costume，并额外输出 parentLogicalAssetId/variantType/variantName。logicalAssetId 必须严格匹配 ^(CHAR|SCENE|PROP|COSTUME)-\\d{3}$；parentLogicalAssetId 必须指向当前 items 中的 CHAR-xxx；variantType 只能是 costume/hair/makeup/age/injury/other。证据不足不得猜测。", fmt.Sprintf("工作流版本：%s\n已确认生产剧本：\n%s", run.WorkflowVersion, run.ScriptSnapshot)
	case WorkflowStageAssetImagePrompt:
		return "你是影视资产生图提示词设计师。逐项保留上游 logicalAssetId/kind/name/scriptEvidence/description，以及角色马甲的 parentLogicalAssetId/variantType/variantName，新增可直接交给图片模型的 imagePrompt 和 status=ready；不得新增、遗漏、合并或重编号资产。", fmt.Sprintf("工作流版本：%s\n生产剧本：\n%s\n\n已批准资产提取：\n%s", run.WorkflowVersion, run.ScriptSnapshot, input.ContentJSON)
	case WorkflowStageShotBreakdown:
		return "你是影视导演与分镜拆解师。只从已确认原剧本输出可供用户修改确认的结构化分镜，不等待资产图，不生成最终视频提示词。JSON 必须包含 shots[].shotId/sceneKey/sourceScript/shotDraft；shotId 使用 shot-001 格式，sceneKey 使用 scene-001 格式；sourceScript 必须逐字对应原剧本片段；shotDraft 必须完整包含 shotSize/camera/movement/action/performance/dialogue/durationSeconds/continuityMode，durationSeconds 为 4–15 数字，continuityMode 只能是 continuous 或 cut。", fmt.Sprintf("工作流版本：%s\n已确认生产剧本：\n%s", run.WorkflowVersion, run.ScriptSnapshot)
	default:
		contextJSON, _ := json.Marshal(context)
		return "你是单镜头多模态视频提示词导演。只处理当前已确认镜头，结合原剧本、结构化分镜和实际参考图片的画面理解生成最终提示词。只输出 JSON：shotId、prompt、promptInputHash、referenceEvidence；promptInputHash 必须原样回写输入上下文中的同名字段。prompt 必须包含“场景：”“声音：”“画面内容：”“限制：”和连续时间段，禁止只写电影感摘要；参考图必须逐图记录 imageRef/observations/appliedTo。若引用上一镜尾帧，只把它作为剧情连续性参考，本镜从该画面之后继续发展；保持场景、角色身份、服装、光线、材质与画风一致，不要求第一帧复刻参考图，不重新诠释视觉设定。", fmt.Sprintf("工作流版本：%s\n生产剧本：\n%s\n\n已批准分镜拆解：\n%s\n\n当前已确认镜头上下文：\n%s", run.WorkflowVersion, run.ScriptSnapshot, input.ContentJSON, contextJSON)
	}
}

func workflowStageAgentKind(stageID string) string {
	if stageID == WorkflowStageAssetExtraction {
		return "asset_extractor"
	}
	if stageID == WorkflowStageAssetImagePrompt {
		return "asset_prompt_designer"
	}
	if stageID == WorkflowStageShotBreakdown {
		return "shot_breakdown_director"
	}
	return "shot_prompt_director"
}

func validateWorkflowStageContext(stageID string, raw json.RawMessage) (*WorkflowShotPromptContext, error) {
	if stageID != WorkflowStageShotPrompt {
		if len(strings.TrimSpace(string(raw))) > 0 && string(raw) != "null" {
			return nil, safeMessageError{message: "该阶段不接受镜头上下文"}
		}
		return nil, nil
	}
	if len(raw) == 0 || len(raw) > maxWorkflowStageContextBytes {
		return nil, safeMessageError{message: "缺少有效的已确认镜头上下文"}
	}
	var context WorkflowShotPromptContext
	if json.Unmarshal(raw, &context) != nil || strings.TrimSpace(context.ShotID) == "" || strings.TrimSpace(context.SourceScript) == "" || len(context.ShotDraft) == 0 || strings.TrimSpace(context.PromptInputHash) == "" {
		return nil, safeMessageError{message: "镜头上下文缺少 shotId、sourceScript、shotDraft 或 promptInputHash"}
	}
	if len(context.References) > 9 {
		return nil, safeMessageError{message: "镜头上下文参考图片过多"}
	}
	allowedRoles := map[string]bool{"character": true, "character_variant": true, "scene": true, "prop": true, "blocking": true, "continuity_reference": true}
	for _, reference := range context.References {
		if !allowedRoles[strings.TrimSpace(reference.Role)] || strings.TrimSpace(reference.Label) == "" || strings.TrimSpace(reference.LibraryAssetID) == "" || strings.TrimSpace(reference.Version) == "" {
			return nil, safeMessageError{message: "参考图缺少有效的类型、名称、素材或版本定义"}
		}
		if reference.Role != "blocking" && reference.Role != "continuity_reference" && strings.TrimSpace(reference.LogicalAssetID) == "" {
			return nil, safeMessageError{message: "角色、场景或道具参考图必须绑定资产编号"}
		}
	}
	return &context, nil
}

func workflowPromptsFromFrozenRun(run model.AgentRun) (string, string, bool) {
	var request struct {
		Messages []AgentRunMessage `json:"messages"`
	}
	if json.Unmarshal([]byte(run.RequestJSON), &request) != nil {
		return "", "", false
	}
	systemPrompt, userPrompt := "", ""
	for _, message := range request.Messages {
		if message.Role == "system" && systemPrompt == "" {
			systemPrompt = message.Content
		}
		if message.Role == "user" {
			userPrompt = message.Content
		}
	}
	return systemPrompt, userPrompt, systemPrompt != "" && userPrompt != ""
}

func workflowSourceSnapshotFromRequest(requestJSON string) map[string]any {
	var request struct {
		Metadata struct {
			SourceSnapshot map[string]any `json:"sourceSnapshot"`
		} `json:"metadata"`
	}
	if json.Unmarshal([]byte(requestJSON), &request) != nil || len(request.Metadata.SourceSnapshot) == 0 {
		return map[string]any{}
	}
	return request.Metadata.SourceSnapshot
}

func validateWorkflowShotPromptInputIdentity(content []byte, requestJSON string, report *WorkflowGateReport) {
	snapshot := workflowSourceSnapshotFromRequest(requestJSON)
	expected := workflowString(snapshot, "promptInputHash")
	if expected == "" {
		return
	}
	var payload map[string]any
	if json.Unmarshal(content, &payload) != nil {
		return
	}
	if workflowString(payload, "promptInputHash") != expected {
		report.add("prompt_input_hash_mismatch", "提示词产物与当前分镜、资产图版本不一致", workflowString(payload, "shotId"))
	}
	if expectedShotID := workflowString(snapshot, "shotId"); expectedShotID != "" && workflowString(payload, "shotId") != expectedShotID {
		report.add("shot_id_mismatch", "提示词产物不属于当前镜头", workflowString(payload, "shotId"))
	}
	*report = report.finish()
}

func validateWorkflowAssetIdentity(input []byte, output []byte, report *WorkflowGateReport) {
	inputIDs := workflowArtifactIDs(input, "items", "logicalAssetId")
	outputIDs := workflowArtifactIDs(output, "items", "logicalAssetId")
	for id := range inputIDs {
		if !outputIDs[id] {
			report.add("missing_upstream_asset", "生图提示词产物遗漏上游资产", id)
		}
	}
	for id := range outputIDs {
		if !inputIDs[id] {
			report.add("unexpected_asset_id", "生图提示词产物新增或重编了资产 ID", id)
		}
	}
	inputItems := workflowArtifactItemsByID(input)
	outputItems := workflowArtifactItemsByID(output)
	for id, inputItem := range inputItems {
		outputItem, ok := outputItems[id]
		if !ok {
			continue
		}
		for _, field := range []string{"parentLogicalAssetId", "variantType", "variantName"} {
			if workflowString(inputItem, field) != workflowString(outputItem, field) {
				report.add("changed_asset_relationship", "生图提示词产物改变了角色马甲关系", id)
				break
			}
		}
	}
	*report = report.finish()
}

func workflowArtifactItemsByID(content []byte) map[string]map[string]any {
	var payload map[string]any
	if json.Unmarshal(content, &payload) != nil {
		return map[string]map[string]any{}
	}
	result := map[string]map[string]any{}
	for _, item := range workflowItems(payload, "items") {
		if id := workflowString(item, "logicalAssetId"); id != "" {
			result[id] = item
		}
	}
	return result
}

func workflowArtifactIDs(content []byte, collectionKey string, idKey string) map[string]bool {
	var payload map[string]any
	if json.Unmarshal(content, &payload) != nil {
		return map[string]bool{}
	}
	result := map[string]bool{}
	for _, item := range workflowItems(payload, collectionKey) {
		if id := workflowString(item, idKey); id != "" {
			result[id] = true
		}
	}
	return result
}

func workflowDetailStage(detail WorkflowRunDetail, stageID string) model.WorkflowStageRun {
	for _, stage := range detail.Stages {
		if stage.StageID == stageID {
			return stage
		}
	}
	return model.WorkflowStageRun{}
}

func workflowStageBusyOrReviewable(status model.WorkflowStageRunStatus) bool {
	switch status {
	case model.WorkflowStageRunStatusQueued, model.WorkflowStageRunStatusRunning, model.WorkflowStageRunStatusCancelRequested, model.WorkflowStageRunStatusNeedsReview, model.WorkflowStageRunStatusApproved, model.WorkflowStageRunStatusApplied:
		return true
	default:
		return false
	}
}

func workflowAgentRunContent(run model.AgentRun) []byte {
	value := strings.TrimSpace(run.StructuredDraftJSON)
	if value == "" {
		value = extractJSONDraft(run.RawOutput)
	}
	if json.Valid([]byte(value)) {
		var payload any
		if json.Unmarshal([]byte(value), &payload) == nil {
			if normalized, err := json.Marshal(payload); err == nil {
				return normalized
			}
		}
	}
	fallback, _ := json.Marshal(map[string]string{"rawText": strings.TrimSpace(run.RawOutput)})
	return fallback
}

var workflowAssetIDPattern = regexp.MustCompile(`(?i)^(CHAR|SCENE|PROP|COSTUME)[\s_-]?(\d{1,3})$`)

func normalizeWorkflowArtifactContent(stageID string, content []byte) []byte {
	if stageID != WorkflowStageAssetExtraction && stageID != WorkflowStageAssetImagePrompt {
		return content
	}
	var payload map[string]any
	if json.Unmarshal(content, &payload) != nil {
		return content
	}
	items, ok := payload["items"].([]any)
	if !ok {
		return content
	}
	changed := false
	for _, value := range items {
		item, ok := value.(map[string]any)
		if !ok {
			continue
		}
		matches := workflowAssetIDPattern.FindStringSubmatch(strings.TrimSpace(fmt.Sprint(item["logicalAssetId"])))
		if len(matches) != 3 {
			continue
		}
		number, _ := strconv.Atoi(matches[2])
		prefix := strings.ToUpper(matches[1])
		item["logicalAssetId"] = fmt.Sprintf("%s-%03d", prefix, number)
		item["kind"] = map[string]string{"CHAR": "character", "SCENE": "scene", "PROP": "prop", "COSTUME": "costume"}[prefix]
		changed = true
	}
	if !changed {
		return content
	}
	normalized, err := json.Marshal(payload)
	if err != nil {
		return content
	}
	return normalized
}

func workflowContentHash(content []byte) string {
	digest := sha256.Sum256(content)
	return hex.EncodeToString(digest[:])
}
