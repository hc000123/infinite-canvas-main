package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"sort"
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
	requestBody, err := buildAPIMultimodalRequest(run.RequestJSON, run.ImageManifestJSON)
	if err != nil {
		return agentRunCallResult{message: "Agent Run 图片上下文无效"}
	}
	request, err := http.NewRequestWithContext(callCtx, http.MethodPost, BuildModelChannelURL(channel, "/chat/completions"), bytes.NewReader(requestBody))
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

func buildAPIMultimodalRequest(requestJSON string, manifestJSON string) ([]byte, error) {
	if strings.TrimSpace(manifestJSON) == "" {
		return []byte(requestJSON), nil
	}
	var manifest struct {
		Items []struct {
			Label      string `json:"label"`
			Kind       string `json:"kind"`
			Version    string `json:"version"`
			MIME       string `json:"mime"`
			ServerPath string `json:"serverPath"`
			Order      int    `json:"order"`
		} `json:"items"`
	}
	if err := json.Unmarshal([]byte(manifestJSON), &manifest); err != nil || len(manifest.Items) > 9 {
		return nil, errors.New("invalid image manifest")
	}
	if len(manifest.Items) == 0 {
		return []byte(requestJSON), nil
	}
	var request map[string]any
	if err := json.Unmarshal([]byte(requestJSON), &request); err != nil {
		return nil, err
	}
	messages, ok := request["messages"].([]any)
	if !ok || len(messages) == 0 {
		return nil, errors.New("missing messages")
	}
	userIndex := -1
	for index := len(messages) - 1; index >= 0; index-- {
		message, valid := messages[index].(map[string]any)
		if valid && strings.EqualFold(strings.TrimSpace(stringValue(message["role"])), "user") {
			userIndex = index
			break
		}
	}
	if userIndex < 0 {
		return nil, errors.New("missing user message")
	}
	sort.SliceStable(manifest.Items, func(left, right int) bool { return manifest.Items[left].Order < manifest.Items[right].Order })
	message := messages[userIndex].(map[string]any)
	textContent, ok := message["content"].(string)
	if !ok || strings.TrimSpace(textContent) == "" {
		return nil, errors.New("invalid user message")
	}
	parts := []any{map[string]any{"type": "text", "text": textContent + "\n\n" + codexImageContext(manifestJSON)}}
	for _, item := range manifest.Items {
		mimeType := strings.TrimSpace(item.MIME)
		if mimeType != "image/png" && mimeType != "image/jpeg" && mimeType != "image/webp" {
			return nil, errors.New("unsupported image mime")
		}
		file, err := os.Open(strings.TrimSpace(item.ServerPath))
		if err != nil {
			return nil, err
		}
		data, readErr := io.ReadAll(io.LimitReader(file, maxWorkflowMediaBytes+1))
		closeErr := file.Close()
		if readErr != nil || closeErr != nil || len(data) == 0 || len(data) > maxWorkflowMediaBytes {
			return nil, errors.New("invalid image data")
		}
		parts = append(parts, map[string]any{"type": "image_url", "image_url": map[string]any{"url": "data:" + mimeType + ";base64," + base64.StdEncoding.EncodeToString(data)}})
	}
	message["content"] = parts
	messages[userIndex] = message
	request["messages"] = messages
	return json.Marshal(request)
}

func stringValue(value any) string {
	text, _ := value.(string)
	return text
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
