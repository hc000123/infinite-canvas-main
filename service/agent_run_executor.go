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
	httpClient    *http.Client
	downloadImage func(context.Context, string) ([]byte, error)
}

func NewAPIAgentRunExecutor(client *http.Client) *APIAgentRunExecutor {
	if client == nil {
		client = &http.Client{}
	}
	return &APIAgentRunExecutor{httpClient: client, downloadImage: downloadRuntimeImage}
}

func (executor *APIAgentRunExecutor) Kind() string { return AgentRunExecutorAPI }

func (executor *APIAgentRunExecutor) Available(context.Context) error {
	return nil
}

func (executor *APIAgentRunExecutor) ReserveCredits(run *model.AgentRun) error {
	return reserveAgentRunCredits(run)
}

func (executor *APIAgentRunExecutor) RefundCredits(run *model.AgentRun) error {
	return refundAgentRunCredits(run)
}

func (executor *APIAgentRunExecutor) Call(ctx context.Context, run model.AgentRun) agentRunCallResult {
	if run.ExecutionKind == "image_model" {
		return executor.callImageModel(ctx, run)
	}
	channel, err := SelectModelChannelWithOptions(run.Model, run.ChannelID, nil, "text")
	if err != nil {
		return agentRunCallResult{message: err.Error(), errorClass: "execution_target_unavailable"}
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

func (executor *APIAgentRunExecutor) callImageModel(ctx context.Context, run model.AgentRun) agentRunCallResult {
	channel, err := SelectModelChannelWithOptions(run.Model, run.ChannelID, nil, "image")
	if err != nil {
		return agentRunCallResult{message: err.Error(), errorClass: "execution_target_unavailable"}
	}
	var manifest struct {
		AssetID     string `json:"assetId"`
		BindingName string `json:"bindingName"`
		Ordinals    []int  `json:"ordinals"`
	}
	if json.Unmarshal([]byte(run.ImageManifestJSON), &manifest) != nil || strings.TrimSpace(manifest.AssetID) == "" || strings.TrimSpace(manifest.BindingName) == "" || len(manifest.Ordinals) == 0 {
		return agentRunCallResult{message: "图片输出映射无效", errorClass: "execution_snapshot_invalid"}
	}
	timeout := time.Duration(normalizeAgentRunTimeout(run.TimeoutSeconds)) * time.Second
	callCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	request, err := http.NewRequestWithContext(callCtx, http.MethodPost, BuildModelChannelURL(channel, "/images/generations"), strings.NewReader(run.RequestJSON))
	if err != nil {
		return agentRunCallResult{message: "图片生成请求创建失败"}
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
	request.Header.Set("Content-Type", "application/json")
	response, err := executor.httpClient.Do(request)
	if err != nil {
		return agentRunCallResult{message: "图片模型请求失败", retryable: true}
	}
	defer response.Body.Close()
	body, readErr := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if readErr != nil {
		return agentRunCallResult{message: "图片模型响应读取失败", retryable: true}
	}
	if response.StatusCode >= http.StatusBadRequest {
		return agentRunCallResult{message: upstreamAgentRunError(body, response.StatusCode), retryable: response.StatusCode == http.StatusTooManyRequests || response.StatusCode >= http.StatusInternalServerError}
	}
	var payload struct {
		ID        string `json:"id"`
		RequestID string `json:"request_id"`
		Data      []struct {
			Base64 string `json:"b64_json"`
			URL    string `json:"url"`
		} `json:"data"`
	}
	if json.Unmarshal(body, &payload) != nil || len(payload.Data) == 0 {
		return agentRunCallResult{message: "图片模型未返回图片", retryable: true}
	}
	requestID := strings.TrimSpace(payload.RequestID)
	if requestID == "" {
		requestID = strings.TrimSpace(payload.ID)
	}
	if requestID == "" {
		requestID = run.ID
	}
	provider := strings.TrimSpace(run.Provider)
	if provider == "" {
		provider = strings.TrimSpace(run.Protocol)
	}
	outputs := make([]map[string]any, 0, len(manifest.Ordinals))
	for index, item := range payload.Data {
		if index >= len(manifest.Ordinals) {
			break
		}
		data, decodeErr := decodeGeneratedImageItem(callCtx, item.Base64, item.URL, executor.downloadImage)
		if decodeErr != nil {
			continue
		}
		image, persistErr := persistRuntimeImage(data)
		if persistErr != nil {
			continue
		}
		renditionID := "rendition-" + strings.TrimPrefix(image.Hash, "sha256:")
		outputs = append(outputs, map[string]any{
			"bindingName": manifest.BindingName, "ordinal": manifest.Ordinals[index],
			"payload": map[string]any{
				"assetId": manifest.AssetID, "renditionId": renditionID, "mediaType": "image", "mediaRef": image.MediaRef,
				"generationMetadata": map[string]any{"provider": provider, "model": run.Model, "requestId": requestID},
			},
		})
	}
	if len(outputs) == 0 {
		return agentRunCallResult{message: "图片模型没有返回有效图片", retryable: len(payload.Data) < len(manifest.Ordinals)}
	}
	structured, err := marshalInvocationCanonical(map[string]any{"outputs": outputs})
	if err != nil {
		return agentRunCallResult{message: "图片输出构造失败"}
	}
	return agentRunCallResult{rawOutput: string(structured), structuredJSON: string(structured)}
}

func decodeGeneratedImageItem(ctx context.Context, encoded, rawURL string, download func(context.Context, string) ([]byte, error)) ([]byte, error) {
	encoded = strings.TrimSpace(encoded)
	if strings.HasPrefix(encoded, "data:") {
		if comma := strings.Index(encoded, ","); comma >= 0 {
			encoded = encoded[comma+1:]
		}
	}
	if encoded != "" {
		return base64.StdEncoding.DecodeString(encoded)
	}
	if strings.TrimSpace(rawURL) == "" {
		return nil, errors.New("missing image data")
	}
	return download(ctx, rawURL)
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

func agentRunExecutorKind(executionKind string) string {
	if strings.EqualFold(strings.TrimSpace(executionKind), "image_model") {
		return AgentRunExecutorAPI
	}
	return currentAgentRunExecutorKind()
}

func workflowExecutorAvailable() bool {
	executor, err := NewAgentRunExecutorFromConfig()
	if err != nil {
		return false
	}
	return executor.Available(context.Background()) == nil
}

func apiAgentRunExecution(input CreateAgentRunInput) (resolvedAgentRunChannel, int, error) {
	return apiAgentRunExecutionForCapability(input, "text")
}

func apiAgentRunExecutionForCapability(input CreateAgentRunInput, capability string) (resolvedAgentRunChannel, int, error) {
	resolved, err := resolveAgentRunChannelForCapability(input, capability)
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
