package service

import (
	"encoding/json"
	"strings"
	"sync"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func ListWorkflowRuns(userID string, query WorkflowRunListQuery) (WorkflowRunList, error) {
	query.ProjectID = strings.TrimSpace(query.ProjectID)
	query.EpisodeID = strings.TrimSpace(query.EpisodeID)
	query.Normalize()
	runs, total, err := repository.ListUserWorkflowRuns(userID, query)
	if err != nil {
		return WorkflowRunList{}, err
	}
	runIDs := make([]string, 0, len(runs))
	for _, run := range runs {
		runIDs = append(runIDs, run.ID)
	}
	allStages, err := repository.ListWorkflowStageRunsByRunIDs(userID, runIDs)
	if err != nil {
		return WorkflowRunList{}, err
	}
	invocationRun := make(map[string]string, len(allStages))
	invocationIDs := make([]string, 0, len(allStages))
	for _, stage := range allStages {
		if stage.InvocationID == "" {
			continue
		}
		invocationRun[stage.InvocationID] = stage.WorkflowRunID
		invocationIDs = append(invocationIDs, stage.InvocationID)
	}
	gates, err := repository.ListInvocationGatesByIDs(userID, invocationIDs)
	if err != nil {
		return WorkflowRunList{}, err
	}
	stagesByRun := make(map[string][]WorkflowStagePollSummary, len(runs))
	seenStages := make(map[string]bool, len(allStages))
	for _, stage := range allStages {
		key := stage.WorkflowRunID + "\x00" + stage.StageID
		if seenStages[key] {
			continue
		}
		seenStages[key] = true
		stagesByRun[stage.WorkflowRunID] = append(stagesByRun[stage.WorkflowRunID], WorkflowStagePollSummary{
			ID: stage.ID, StageID: stage.StageID, InvocationID: stage.InvocationID, Status: stage.Status,
			Attempt: stage.Attempt, ErrorMessage: stage.ErrorMessage, UpdatedAt: stage.UpdatedAt,
		})
	}
	warningsByRun := make(map[string]int, len(runs))
	for _, gate := range gates {
		var issues []WorkflowGateIssue
		if json.Unmarshal([]byte(gate.IssuesJSON), &issues) != nil {
			continue
		}
		for _, issue := range issues {
			if !issue.Blocking {
				warningsByRun[invocationRun[gate.InvocationID]]++
			}
		}
	}
	items := make([]WorkflowRunListItem, 0, len(runs))
	for _, run := range runs {
		stages := stagesByRun[run.ID]
		if stages == nil {
			stages = []WorkflowStagePollSummary{}
		}
		reviewCount := 0
		for _, stage := range stages {
			if stage.Status == model.WorkflowStageRunStatusNeedsReview {
				reviewCount++
			}
		}
		items = append(items, WorkflowRunListItem{
			ID: run.ID, ProjectID: run.ProjectID, EpisodeID: run.EpisodeID, WorkflowID: run.WorkflowID,
			WorkflowVersion: run.WorkflowVersion, CurrentStageID: run.CurrentStageID, Status: run.Status,
			Stages: stages, ReviewCount: reviewCount, WarningCount: warningsByRun[run.ID], CreatedAt: run.CreatedAt, UpdatedAt: run.UpdatedAt,
		})
	}
	return WorkflowRunList{Items: items, Total: total, Page: query.Page, PageSize: query.PageSize}, nil
}

type WorkflowWorkerHealth struct {
	Enabled              bool   `json:"enabled"`
	Ready                bool   `json:"ready"`
	WorkerID             string `json:"workerId"`
	LastHeartbeatAt      string `json:"lastHeartbeatAt"`
	HeartbeatFresh       bool   `json:"heartbeatFresh"`
	TextChannelAvailable bool   `json:"textChannelAvailable"`
	QueueDepth           int64  `json:"queueDepth"`
	RunningCount         int64  `json:"runningCount"`
	StaleLeaseCount      int64  `json:"staleLeaseCount"`
	Executor             string `json:"executor"`
	ExecutorLabel        string `json:"executorLabel"`
}

var workflowWorkerRuntime = struct {
	sync.RWMutex
	enabled       bool
	workerID      string
	lastHeartbeat time.Time
}{}

func SetWorkflowWorkerEnabled(enabled bool) {
	workflowWorkerRuntime.Lock()
	workflowWorkerRuntime.enabled = enabled
	if !enabled {
		workflowWorkerRuntime.workerID = ""
		workflowWorkerRuntime.lastHeartbeat = time.Time{}
	}
	workflowWorkerRuntime.Unlock()
}

func markWorkflowWorkerHeartbeat(workerID string, stamp time.Time) {
	workflowWorkerRuntime.Lock()
	workflowWorkerRuntime.workerID = strings.TrimSpace(workerID)
	workflowWorkerRuntime.lastHeartbeat = stamp.UTC()
	workflowWorkerRuntime.Unlock()
}

func GetWorkflowWorkerHealth() (WorkflowWorkerHealth, error) {
	workflowWorkerRuntime.RLock()
	enabled := workflowWorkerRuntime.enabled
	workerID := workflowWorkerRuntime.workerID
	heartbeat := workflowWorkerRuntime.lastHeartbeat
	workflowWorkerRuntime.RUnlock()
	currentTime := time.Now().UTC()
	stats, err := repository.GetAgentRunQueueStats(currentTime)
	if err != nil {
		return WorkflowWorkerHealth{}, err
	}
	channelAvailable := workflowExecutorAvailable()
	fresh := !heartbeat.IsZero() && currentTime.Sub(heartbeat) <= 30*time.Second
	heartbeatText := ""
	if !heartbeat.IsZero() {
		heartbeatText = workerTime(heartbeat)
	}
	return WorkflowWorkerHealth{
		Enabled:              enabled,
		Ready:                enabled && fresh && channelAvailable && stats.StaleLeases == 0,
		WorkerID:             workerID,
		LastHeartbeatAt:      heartbeatText,
		HeartbeatFresh:       fresh,
		TextChannelAvailable: channelAvailable,
		QueueDepth:           stats.Queued,
		RunningCount:         stats.Running,
		StaleLeaseCount:      stats.StaleLeases,
		Executor:             AgentRunExecutorAPI,
		ExecutorLabel:        "后台 API",
	}, nil
}

func CancelWorkflowStage(userID string, stageRunID string) (model.WorkflowStageRun, error) {
	stage, ok, err := repository.GetUserWorkflowStageRun(userID, stageRunID)
	if err != nil {
		return stage, err
	}
	if !ok {
		return stage, safeMessageError{message: "工作流阶段不存在"}
	}
	if stage.InvocationID == "" {
		return stage, safeMessageError{message: "当前阶段没有可取消任务"}
	}
	_, err = CancelInvocation(userID, stage.InvocationID)
	if err != nil {
		return stage, err
	}
	projection, err := projectWorkflowInvocation(userID, stage)
	return projection.Stage, err
}

func RetryWorkflowStage(userID string, stageRunID string, idempotencyKey string) (model.WorkflowStageRun, error) {
	stage, ok, err := repository.GetUserWorkflowStageRun(userID, stageRunID)
	if err != nil {
		return stage, err
	}
	if !ok {
		return stage, safeMessageError{message: "工作流阶段不存在"}
	}
	latest, exists, err := repository.LatestWorkflowStageRun(userID, stage.WorkflowRunID, stage.StageID)
	if err != nil {
		return stage, err
	}
	if exists && latest.ParentStageRunID == stage.ID && latest.InvocationID == stage.InvocationID && latest.Attempt > stage.Attempt {
		current, projectErr := projectWorkflowInvocation(userID, latest)
		return current.Stage, projectErr
	}
	projection, err := projectWorkflowInvocation(userID, stage)
	if err != nil {
		return stage, err
	}
	switch projection.Stage.Status {
	case model.WorkflowStageRunStatusFailed, model.WorkflowStageRunStatusCancelled, model.WorkflowStageRunStatusRejected:
		response, err := RetryInvocation(userID, stage.InvocationID)
		if err != nil {
			return stage, err
		}
		if response.Attempt == nil {
			return stage, safeMessageError{message: "工作流重试未能创建执行尝试"}
		}
		if err := repository.CopyAgentRunImageManifest(userID, stage.AgentRunID, response.Attempt.AgentRunID); err != nil {
			return stage, err
		}
		stamp := now()
		retry := stage
		retry.ID, retry.ParentStageRunID = newID("workflowstage"), stage.ID
		retry.AgentRunID, retry.Attempt = response.Attempt.AgentRunID, response.Attempt.Attempt
		retry.Status, retry.OutputArtifactID = model.WorkflowStageRunStatusQueued, ""
		retry.ErrorMessage, retry.ReviewDecision, retry.ReviewedArtifactHash, retry.ReviewComment = "", "", "", ""
		retry.ApplyReceiptJSON, retry.StartedAt, retry.FinishedAt, retry.ReviewedAt, retry.AppliedAt = "", "", "", "", ""
		retry.ProgressCurrent, retry.CreatedAt, retry.UpdatedAt = 0, stamp, stamp
		workflowRun, _, _ := repository.GetUserWorkflowRun(userID, stage.WorkflowRunID)
		event := workflowEvent(workflowRun, retry, "stage.queued", "info", map[string]any{"invocationId": retry.InvocationID, "agentRunId": retry.AgentRunID, "attempt": retry.Attempt, "retry": true, "idempotencyKey": strings.TrimSpace(idempotencyKey)}, stamp)
		if err := repository.CreateWorkflowStageWithEvent(retry, event); err != nil {
			return retry, err
		}
		return retry, nil
	default:
		return stage, safeMessageError{message: "当前阶段状态不能重试"}
	}
}

func ListUserWorkflowEvents(userID string, workflowRunID string, after uint64, limit int) ([]model.WorkflowEvent, error) {
	if _, ok, err := repository.GetUserWorkflowRun(userID, workflowRunID); err != nil {
		return nil, err
	} else if !ok {
		return nil, safeMessageError{message: "工作流不存在"}
	}
	return repository.ListWorkflowEvents(userID, workflowRunID, after, limit)
}

func GetWorkflowRunPoll(userID, workflowRunID string, after uint64) (WorkflowRunPoll, error) {
	run, ok, err := repository.GetUserWorkflowRun(userID, workflowRunID)
	if err != nil {
		return WorkflowRunPoll{}, err
	}
	if !ok {
		return WorkflowRunPoll{}, safeMessageError{message: "工作流不存在"}
	}
	allStages, err := repository.ListWorkflowStageRuns(userID, workflowRunID)
	if err != nil {
		return WorkflowRunPoll{}, err
	}
	latest := make([]model.WorkflowStageRun, 0, len(allStages))
	seen := make(map[string]bool, len(allStages))
	invocationIDs := make([]string, 0, len(allStages))
	for _, stage := range allStages {
		if seen[stage.StageID] {
			continue
		}
		seen[stage.StageID] = true
		latest = append(latest, stage)
		if stage.InvocationID != "" {
			invocationIDs = append(invocationIDs, stage.InvocationID)
		}
	}
	invocations, err := repository.ListUserInvocationsByIDs(userID, invocationIDs)
	if err != nil {
		return WorkflowRunPoll{}, err
	}
	invocationByID := make(map[string]model.InvocationRun, len(invocations))
	for _, invocation := range invocations {
		invocationByID[invocation.ID] = invocation
	}
	stages := make([]WorkflowStagePollSummary, 0, len(latest))
	for _, stage := range latest {
		summary := WorkflowStagePollSummary{ID: stage.ID, StageID: stage.StageID, InvocationID: stage.InvocationID, Status: stage.Status, Attempt: stage.Attempt, ErrorMessage: stage.ErrorMessage, UpdatedAt: stage.UpdatedAt}
		if invocation, exists := invocationByID[stage.InvocationID]; exists {
			summary.Status = workflowStageStatusFromInvocation(invocation.Status)
			summary.Attempt = invocation.LatestAttempt
			summary.UpdatedAt = invocation.UpdatedAt
			summary.ErrorMessage = ""
			if invocation.Status == model.InvocationStatusFailed || invocation.Status == model.InvocationStatusBlocked || invocation.Status == model.InvocationStatusPartial {
				summary.ErrorMessage = invocation.AggregateErrorSummary
			}
		}
		stages = append(stages, summary)
	}
	events, err := repository.ListWorkflowEvents(userID, workflowRunID, after, 100)
	if err != nil {
		return WorkflowRunPoll{}, err
	}
	nextAfter := after
	if len(events) > 0 {
		nextAfter = events[len(events)-1].ID
	}
	worker, err := GetWorkflowWorkerHealth()
	if err != nil {
		return WorkflowRunPoll{}, err
	}
	return WorkflowRunPoll{RunID: run.ID, Status: run.Status, UpdatedAt: run.UpdatedAt, Stages: stages, Events: events, NextAfter: nextAfter, Worker: worker}, nil
}

func workflowTextChannelAvailable() bool {
	settings, err := repository.GetSettings()
	if err != nil {
		return false
	}
	modelName := strings.TrimSpace(normalizeSettings(settings).Public.ModelChannel.DefaultTextModel)
	if modelName == "" {
		return false
	}
	_, err = SelectModelChannelWithOptions(modelName, "", nil, "text")
	return err == nil
}
