package service

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
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
	artStatus := model.WorkflowStageRunStatusBlocked
	if confirmed {
		scriptStatus = model.WorkflowStageRunStatusApproved
		artStatus = model.WorkflowStageRunStatusReady
		run.CurrentStageID = WorkflowStageArtDesign
	}
	stages := []model.WorkflowStageRun{
		workflowInitialStage(run, WorkflowStageScriptAdaptation, scriptStatus, stamp),
		workflowInitialStage(run, WorkflowStageArtDesign, artStatus, stamp),
		workflowInitialStage(run, WorkflowStageSeedanceStoryboard, model.WorkflowStageRunStatusBlocked, stamp),
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
	stages := make([]model.WorkflowStageRun, 0, 3)
	for _, stageID := range []string{WorkflowStageScriptAdaptation, WorkflowStageArtDesign, WorkflowStageSeedanceStoryboard} {
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
	return startWorkflowStage(userID, workflowRunID, stageID, idempotencyKey, "", nil)
}

func StartWorkflowStageWithMedia(userID string, workflowRunID string, stageID string, idempotencyKey string, mediaBatchID string) (model.WorkflowStageRun, error) {
	return startWorkflowStage(userID, workflowRunID, stageID, idempotencyKey, mediaBatchID, nil)
}

func startWorkflowStage(userID string, workflowRunID string, stageID string, idempotencyKey string, mediaBatchID string, frozenRun *model.AgentRun) (model.WorkflowStageRun, error) {
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
	if stageID != WorkflowStageArtDesign && stageID != WorkflowStageSeedanceStoryboard {
		return model.WorkflowStageRun{}, safeMessageError{message: "不支持的工作流阶段"}
	}
	if workflowStageBusyOrReviewable(current.Status) {
		return current, nil
	}
	inputArtifact, err := workflowStageInputArtifact(detail, stageID)
	if err != nil {
		return current, err
	}
	systemPrompt, userPrompt := workflowStagePrompts(detail.Run, stageID, inputArtifact)
	executorKind := ""
	imageManifestJSON := `{"items":[],"degraded":true,"reason":"text-only"}`
	skillID, skillVersionID, skillVersion, skillContentHash, skillSnapshotJSON := "", "", "", "", ""
	if frozenRun != nil && strings.TrimSpace(frozenRun.SkillSnapshotJSON) != "" {
		instructions, err := workflowSkillInstructionsFromSnapshot(frozenRun.SkillSnapshotJSON)
		if err != nil {
			return current, err
		}
		systemPrompt += instructions
		skillID, skillVersionID = frozenRun.SkillID, frozenRun.SkillVersionID
		skillVersion, skillContentHash = frozenRun.SkillVersion, frozenRun.SkillContentHash
		skillSnapshotJSON = frozenRun.SkillSnapshotJSON
		executorKind = frozenRun.Executor
		imageManifestJSON = frozenRun.ImageManifestJSON
	} else {
		if err := EnsureWorkflowSkillSeeds(); err != nil {
			return current, err
		}
		resolvedSkill, err := ResolvePublishedWorkflowSkill(workflowSkillStageForRun(stageID), detail.Run.ProjectID)
		if err != nil {
			return current, err
		}
		systemPrompt += workflowSkillInstructions(resolvedSkill)
		skillID, skillVersionID = resolvedSkill.Skill.ID, resolvedSkill.Version.ID
		skillVersion, skillContentHash = resolvedSkill.Version.Version, resolvedSkill.Version.ContentHash
		skillSnapshotJSON = workflowSkillSnapshotJSON(resolvedSkill)
		if resolvedSkill.Package.Contract.ImagePolicy.Required && strings.TrimSpace(mediaBatchID) == "" {
			return current, safeMessageError{message: "当前 Skill 要求上传参考图片"}
		}
	}
	agentRun, err := CreateUserAgentRun(userID, CreateAgentRunInput{
		Executor:          executorKind,
		IdempotencyKey:    strings.TrimSpace(idempotencyKey),
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
		MediaBatchID:      strings.TrimSpace(mediaBatchID),
		WritePolicy:       "confirm_before_write",
		SystemPrompt:      systemPrompt,
		UserPrompt:        userPrompt,
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
	content := workflowAgentRunContent(run)
	stamp := now()
	artifact := workflowArtifact(workflowRun, stage, run, stage.StageID, stage.Attempt, content, stamp)
	var report WorkflowGateReport
	switch stage.StageID {
	case WorkflowStageArtDesign:
		report = ValidateArtDesignArtifact(content)
	case WorkflowStageSeedanceStoryboard:
		report = ValidateStoryboardArtifact(content)
	default:
		report = ValidateScriptArtifact(content)
	}
	validateWorkflowReferenceEvidence(content, run.ImageManifestJSON, &report)
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
	if stageID == WorkflowStageSeedanceStoryboard {
		dependency = WorkflowStageArtDesign
		message = "请先批准美术设计阶段"
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

func workflowStagePrompts(run model.WorkflowRun, stageID string, input model.WorkflowArtifact) (string, string) {
	if stageID == WorkflowStageArtDesign {
		return "你是影视导演与美术设定师。只输出 JSON，包含 directorSummary、referenceEvidence 和 items；每个 item 必须有 id、kind、name、prompt。referenceEvidence 在无图时输出空数组；收到参考图时必须逐图写出 imageRef（@图N）、observations 和 appliedTo，证明提示词确实基于画面。不得改变剧本事实。", fmt.Sprintf("工作流版本：%s\n请根据以下已确认生产剧本生成角色、场景、道具设定：\n%s", run.WorkflowVersion, run.ScriptSnapshot)
	}
	return "你是 Seedance 分镜师。只输出 JSON，包含 referenceEvidence 和 shots；每个 shot 必须有 id、sceneId、prompt、duration，可选 dialogue。每条 prompt 必须是可直接生成视频的完整 Copy-only 合同，依次包含“场景：”“声音：”“画面内容：”“限制：”，画面内容必须按 0-2秒、2-4秒等连续时间段描述；禁止只写电影感摘要。referenceEvidence 在无图时输出空数组；收到参考图时必须逐图写出 imageRef（@图N）、observations 和 appliedTo，证明提示词确实基于画面。duration 必须为 4–15 秒，素材引用使用 @图N。", fmt.Sprintf("工作流版本：%s\n生产剧本：\n%s\n\n已批准美术产物：\n%s", run.WorkflowVersion, run.ScriptSnapshot, input.ContentJSON)
}

func workflowStageAgentKind(stageID string) string {
	if stageID == WorkflowStageArtDesign {
		return "asset_extractor"
	}
	return "storyboard_director"
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

func workflowContentHash(content []byte) string {
	digest := sha256.Sum256(content)
	return hex.EncodeToString(digest[:])
}
