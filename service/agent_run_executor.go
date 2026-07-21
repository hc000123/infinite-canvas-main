package service

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
)

const (
	AgentRunExecutorAPI      = "api"
	AgentRunExecutorCodexCLI = "codex-cli"
)

type AgentRunExecutor interface {
	Kind() string
	Available(context.Context) error
	Call(context.Context, model.AgentRun) agentRunCallResult
	ReserveCredits(*model.AgentRun) error
	RefundCredits(*model.AgentRun) error
}

type APIAgentRunExecutor struct {
	httpClient *http.Client
}

func NewAPIAgentRunExecutor(client *http.Client) *APIAgentRunExecutor {
	if client == nil {
		client = &http.Client{}
	}
	return &APIAgentRunExecutor{httpClient: client}
}

func (executor *APIAgentRunExecutor) Kind() string { return AgentRunExecutorAPI }

func (executor *APIAgentRunExecutor) Available(context.Context) error {
	if !workflowTextChannelAvailable() {
		return errors.New("没有可用文本模型渠道")
	}
	return nil
}

func (executor *APIAgentRunExecutor) ReserveCredits(run *model.AgentRun) error {
	return reserveAgentRunCredits(run)
}

func (executor *APIAgentRunExecutor) RefundCredits(run *model.AgentRun) error {
	return refundAgentRunCredits(run)
}

func (executor *APIAgentRunExecutor) Call(ctx context.Context, run model.AgentRun) agentRunCallResult {
	channel, err := SelectModelChannelWithOptions(run.Model, run.ChannelID, nil, "text")
	if err != nil {
		return agentRunCallResult{message: err.Error()}
	}
	timeout := time.Duration(normalizeAgentRunTimeout(run.TimeoutSeconds)) * time.Second
	callCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	request, err := http.NewRequestWithContext(callCtx, http.MethodPost, BuildModelChannelURL(channel, "/chat/completions"), bytes.NewBufferString(run.RequestJSON))
	if err != nil {
		return agentRunCallResult{message: "Agent Run 请求创建失败"}
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
	request.Header.Set("Content-Type", "application/json")
	response, err := executor.httpClient.Do(request)
	if err != nil {
		if errors.Is(err, context.Canceled) && ctx.Err() != nil {
			return agentRunCallResult{message: "Agent Run 已取消"}
		}
		return agentRunCallResult{message: "Agent Run 文本模型请求失败", retryable: true}
	}
	defer response.Body.Close()
	body, readErr := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if readErr != nil {
		return agentRunCallResult{message: "Agent Run 上游响应读取失败", retryable: true}
	}
	if response.StatusCode >= http.StatusBadRequest {
		return agentRunCallResult{message: upstreamAgentRunError(body, response.StatusCode), retryable: response.StatusCode == http.StatusTooManyRequests || response.StatusCode >= http.StatusInternalServerError}
	}
	rawOutput := extractAgentRunText(body)
	if strings.TrimSpace(rawOutput) == "" {
		return agentRunCallResult{message: "Agent Run 上游未返回可审核内容", retryable: true}
	}
	return agentRunCallResult{rawOutput: rawOutput, structuredJSON: extractJSONDraft(rawOutput)}
}

func NewAgentRunExecutorFromConfig() (AgentRunExecutor, error) {
	if currentAgentRunExecutorKind() == AgentRunExecutorCodexCLI {
		executor := NewCodexAgentRunExecutor(CodexExecutorOptions{
			Bin: config.Cfg.WorkflowCodexBin, Workdir: config.Cfg.WorkflowCodexWorkdir, Model: config.Cfg.WorkflowCodexModel,
		})
		return executor, executor.Available(context.Background())
	}
	return NewAPIAgentRunExecutor(nil), nil
}

func currentAgentRunExecutorKind() string {
	if strings.EqualFold(strings.TrimSpace(config.Cfg.WorkflowTextExecutor), AgentRunExecutorCodexCLI) && config.Cfg.WorkflowLocalCodexEnabled {
		return AgentRunExecutorCodexCLI
	}
	return AgentRunExecutorAPI
}

func workflowExecutorAvailable() bool {
	executor, err := NewAgentRunExecutorFromConfig()
	if err != nil {
		return false
	}
	return executor.Available(context.Background()) == nil
}

func apiAgentRunExecution(input CreateAgentRunInput) (resolvedAgentRunChannel, int, error) {
	resolved, err := resolveAgentRunChannel(input)
	if err != nil {
		return resolved, 0, err
	}
	credits, err := ModelCost(resolved.ModelName)
	return resolved, credits, err
}

func codexAgentRunModel() string {
	modelName := strings.TrimSpace(config.Cfg.WorkflowCodexModel)
	if modelName == "" {
		return "codex"
	}
	return modelName
}
