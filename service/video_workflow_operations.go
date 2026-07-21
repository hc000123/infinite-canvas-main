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
	channelAvailable := workflowTextChannelAvailable()
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
	if stage.AgentRunID == "" {
		return stage, safeMessageError{message: "当前阶段没有可取消任务"}
	}
	run, err := repository.RequestAgentRunCancel(userID, stage.AgentRunID)
	if err != nil {
		return stage, err
	}
	if err := SyncWorkflowStageFromAgentRun(run); err != nil {
		return stage, err
	}
	stage, _, err = repository.GetUserWorkflowStageRun(userID, stageRunID)
	return stage, err
}

func RetryWorkflowStage(userID string, stageRunID string, idempotencyKey string) (model.WorkflowStageRun, error) {
	stage, ok, err := repository.GetUserWorkflowStageRun(userID, stageRunID)
	if err != nil {
		return stage, err
	}
	if !ok {
		return stage, safeMessageError{message: "工作流阶段不存在"}
	}
	switch stage.Status {
	case model.WorkflowStageRunStatusFailed, model.WorkflowStageRunStatusCancelled, model.WorkflowStageRunStatusRejected:
		previous, exists, err := repository.GetAgentRun(stage.AgentRunID)
		if err != nil {
			return stage, err
		}
		if !exists {
			return stage, safeMessageError{message: "原任务不存在，无法保留 Skill 快照"}
		}
		return startWorkflowStage(userID, stage.WorkflowRunID, stage.StageID, idempotencyKey, &previous)
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
