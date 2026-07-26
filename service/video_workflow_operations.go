package service

import (
	"strings"
	"sync"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

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
	executorKind := currentAgentRunExecutorKind()
	channelAvailable := workflowExecutorAvailable()
	executorLabel := "后台 API"
	if executorKind == AgentRunExecutorCodexCLI {
		executorLabel = "本地 Codex 验证"
	}
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
		Executor:             executorKind,
		ExecutorLabel:        executorLabel,
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
