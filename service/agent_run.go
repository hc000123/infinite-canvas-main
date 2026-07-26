package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

type AgentConfigSaveInput struct {
	Scope      string          `json:"scope"`
	ProjectID  string          `json:"projectId"`
	EpisodeID  string          `json:"episodeId"`
	Kind       string          `json:"kind"`
	ConfigJSON json.RawMessage `json:"configJson"`
}

type AgentRunMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type CreateAgentRunInput struct {
	IdempotencyKey     string            `json:"idempotencyKey"`
	InvocationID       string            `json:"-"`
	InvocationRevision int               `json:"-"`
	InvocationAttempt  int               `json:"-"`
	ProjectID          string            `json:"projectId"`
	EpisodeID          string            `json:"episodeId"`
	WorkflowRunID      string            `json:"workflowRunId"`
	StageID            string            `json:"stageId"`
	AgentKind          string            `json:"agentKind"`
	Executor           string            `json:"-"`
	SkillID            string            `json:"-"`
	SkillVersionID     string            `json:"-"`
	SkillVersion       string            `json:"-"`
	SkillContentHash   string            `json:"-"`
	SkillSnapshotJSON  string            `json:"-"`
	ImageManifestJSON  string            `json:"-"`
	MediaBatchID       string            `json:"-"`
	ChannelID          string            `json:"channelId"`
	ModelPreference    string            `json:"modelPreference"`
	AllowFallback      bool              `json:"allowFallback"`
	FallbackChannelIDs []string          `json:"fallbackChannelIds"`
	FrozenCredits      *int              `json:"-"`
	EstimatedCredits   int               `json:"estimatedCredits"`
	AllowBatch         bool              `json:"allowBatch"`
	TimeoutSeconds     int               `json:"timeoutSeconds"`
	ConcurrencyLimit   int               `json:"concurrencyLimit"`
	MaxAttempts        int               `json:"-"`
	WritePolicy        string            `json:"writePolicy"`
	SystemPrompt       string            `json:"systemPrompt"`
	UserPrompt         string            `json:"userPrompt"`
	Messages           []AgentRunMessage `json:"messages"`
	Temperature        *float64          `json:"temperature"`
	MaxOutputTokens    int               `json:"maxOutputTokens"`
	Variables          map[string]any    `json:"variables"`
	SourceSnapshot     map[string]any    `json:"sourceSnapshot"`
	ReviewJSON         json.RawMessage   `json:"reviewJson"`
	MappingPreviewJSON json.RawMessage   `json:"mappingPreviewJson"`
}

type resolvedAgentRunChannel struct {
	ModelName       string
	TargetModel     string
	Channel         model.ModelChannel
	TargetChannelID string
	FallbackUsed    bool
	FallbackReason  string
}

type AgentRunReviewInput struct {
	Status             model.AgentRunStatus `json:"status"`
	ReviewJSON         json.RawMessage      `json:"reviewJson"`
	MappingPreviewJSON json.RawMessage      `json:"mappingPreviewJson"`
}

func SaveUserAgentConfig(userID string, input AgentConfigSaveInput) (model.AgentConfigRecord, error) {
	stamp := now()
	scope := strings.TrimSpace(input.Scope)
	if scope == "" {
		scope = "global"
	}
	kind := strings.TrimSpace(input.Kind)
	if kind == "" {
		return model.AgentConfigRecord{}, safeMessageError{message: "缺少 Agent 类型"}
	}
	id := agentConfigRecordID(userID, scope, input.ProjectID, input.EpisodeID, kind)
	item := model.AgentConfigRecord{
		ID:         id,
		UserID:     strings.TrimSpace(userID),
		Scope:      scope,
		ProjectID:  strings.TrimSpace(input.ProjectID),
		EpisodeID:  strings.TrimSpace(input.EpisodeID),
		Kind:       kind,
		ConfigJSON: string(input.ConfigJSON),
		CreatedAt:  stamp,
		UpdatedAt:  stamp,
	}
	if saved, ok, err := repository.GetAgentConfigRecord(id); err == nil && ok && saved.CreatedAt != "" {
		item.CreatedAt = saved.CreatedAt
	}
	return repository.SaveAgentConfigRecord(item)
}

func ListUserAgentConfigs(userID string, projectID string, episodeID string) ([]model.AgentConfigRecord, error) {
	return repository.ListAgentConfigRecords(userID, projectID, episodeID)
}

func CreateUserAgentRun(userID string, input CreateAgentRunInput) (model.AgentRun, error) {
	run, err := BuildUserAgentRun(userID, input)
	if err != nil {
		return model.AgentRun{}, err
	}
	if strings.TrimSpace(input.MediaBatchID) != "" {
		run, _, err = repository.SaveAgentRunWithWorkflowMedia(run, input.MediaBatchID)
	} else {
		run, _, err = repository.SaveAgentRunIdempotently(run)
	}
	return run, err
}

func BuildUserAgentRun(userID string, input CreateAgentRunInput) (model.AgentRun, error) {
	executorKind := strings.TrimSpace(input.Executor)
	if executorKind == "" {
		executorKind = currentAgentRunExecutorKind()
	}
	if executorKind != currentAgentRunExecutorKind() {
		return model.AgentRun{}, safeMessageError{message: "任务执行器与当前运行模式不匹配"}
	}
	resolved := resolvedAgentRunChannel{}
	credits := 0
	var err error
	if executorKind == AgentRunExecutorAPI {
		if input.FrozenCredits == nil {
			resolved, credits, err = apiAgentRunExecution(input)
		} else {
			resolved, err = resolveAgentRunChannel(input)
			credits = *input.FrozenCredits
			if credits < 0 {
				err = safeMessageError{message: "冻结算力点无效"}
			}
		}
		if err != nil {
			return model.AgentRun{}, err
		}
	} else {
		resolved.ModelName = codexAgentRunModel()
		resolved.TargetModel = strings.TrimSpace(input.ModelPreference)
	}
	estimatedCredits := input.EstimatedCredits
	if executorKind == AgentRunExecutorCodexCLI {
		estimatedCredits = 0
	} else if input.FrozenCredits == nil && estimatedCredits <= 0 {
		estimatedCredits = credits
	}
	timeoutSeconds := normalizeAgentRunTimeout(input.TimeoutSeconds)
	concurrencyLimit := normalizeAgentRunConcurrency(input.ConcurrencyLimit)
	stamp := now()
	idempotencyKey := strings.TrimSpace(input.IdempotencyKey)
	invocationID := strings.TrimSpace(input.InvocationID)
	if invocationID != "" {
		if input.InvocationRevision < 1 || input.InvocationAttempt < 1 {
			return model.AgentRun{}, safeMessageError{message: "Invocation Agent Run 缺少 revision 或 attempt"}
		}
		if input.AllowFallback {
			return model.AgentRun{}, safeMessageError{message: "Invocation Agent Run 禁止 fallback"}
		}
		idempotencyKey = fmt.Sprintf("invocation:%s:revision:%d:attempt:%d", invocationID, input.InvocationRevision, input.InvocationAttempt)
	}
	var idempotencyKeyPointer *string
	if idempotencyKey != "" {
		idempotencyKeyPointer = &idempotencyKey
	}
	run := model.AgentRun{
		ID:                 newID("agentrun"),
		UserID:             strings.TrimSpace(userID),
		ProjectID:          strings.TrimSpace(input.ProjectID),
		EpisodeID:          strings.TrimSpace(input.EpisodeID),
		WorkflowRunID:      strings.TrimSpace(input.WorkflowRunID),
		InvocationID:       invocationID,
		InvocationRevision: input.InvocationRevision,
		InvocationAttempt:  input.InvocationAttempt,
		StageID:            strings.TrimSpace(input.StageID),
		AgentKind:          strings.TrimSpace(input.AgentKind),
		Executor:           executorKind,
		SkillID:            strings.TrimSpace(input.SkillID),
		SkillVersionID:     strings.TrimSpace(input.SkillVersionID),
		SkillVersion:       strings.TrimSpace(input.SkillVersion),
		SkillContentHash:   strings.TrimSpace(input.SkillContentHash),
		SkillSnapshotJSON:  strings.TrimSpace(input.SkillSnapshotJSON),
		ImageManifestJSON:  strings.TrimSpace(input.ImageManifestJSON),
		Model:              resolved.ModelName,
		TargetModel:        resolved.TargetModel,
		ChannelID:          resolved.Channel.ID,
		TargetChannelID:    resolved.TargetChannelID,
		Provider:           resolved.Channel.Name,
		Protocol:           resolved.Channel.Protocol,
		AllowFallback:      input.AllowFallback,
		FallbackUsed:       resolved.FallbackUsed,
		FallbackReason:     resolved.FallbackReason,
		EstimatedCredits:   estimatedCredits,
		TimeoutSeconds:     timeoutSeconds,
		ConcurrencyLimit:   concurrencyLimit,
		AllowBatch:         input.AllowBatch,
		Status:             model.AgentRunStatusQueued,
		WritePolicy:        normalizeAgentWritePolicy(input.WritePolicy),
		RequiresConfirm:    true,
		Credits:            credits,
		IdempotencyKey:     idempotencyKeyPointer,
		MaxAttempts:        normalizeAgentRunMaxAttempts(input.MaxAttempts),
		AvailableAt:        time.Now().UTC().Format(time.RFC3339Nano),
		ReviewJSON:         string(input.ReviewJSON),
		MappingPreviewJSON: string(input.MappingPreviewJSON),
		CreatedAt:          stamp,
		UpdatedAt:          stamp,
	}
	requestBody, err := buildAgentRunChatRequest(input, resolved.ModelName)
	if err != nil {
		return model.AgentRun{}, err
	}
	run.RequestJSON = string(requestBody)
	return run, nil
}

func ListUserAgentRuns(userID string, q model.AgentRunQuery) (model.AgentRunList, error) {
	items, total, err := repository.ListAgentRuns(userID, q)
	if err != nil {
		return model.AgentRunList{}, err
	}
	return model.AgentRunList{Items: items, Total: int(total)}, nil
}

func ReviewUserAgentRun(userID string, id string, input AgentRunReviewInput) (model.AgentRun, error) {
	run, ok, err := repository.GetAgentRun(id)
	if err != nil {
		return model.AgentRun{}, err
	}
	if !ok || run.UserID != strings.TrimSpace(userID) {
		return model.AgentRun{}, safeMessageError{message: "Agent Run 不存在"}
	}
	stamp := now()
	switch input.Status {
	case model.AgentRunStatusApproved:
		run.Status = model.AgentRunStatusApproved
		run.ConfirmedAt = stamp
	case model.AgentRunStatusRejected:
		run.Status = model.AgentRunStatusRejected
		run.ConfirmedAt = stamp
	case model.AgentRunStatusApplied:
		run.Status = model.AgentRunStatusApplied
		run.AppliedAt = stamp
	default:
		return model.AgentRun{}, safeMessageError{message: "不支持的审核状态"}
	}
	if len(input.ReviewJSON) > 0 {
		run.ReviewJSON = string(input.ReviewJSON)
	}
	if len(input.MappingPreviewJSON) > 0 {
		run.MappingPreviewJSON = string(input.MappingPreviewJSON)
	}
	run.UpdatedAt = stamp
	return repository.SaveAgentRun(run)
}

func resolveAgentRunChannel(input CreateAgentRunInput) (resolvedAgentRunChannel, error) {
	targetModel := strings.TrimSpace(input.ModelPreference)
	modelName := targetModel
	if modelName == "" || modelName == "default" {
		settings, err := repository.GetSettings()
		if err != nil {
			return resolvedAgentRunChannel{}, err
		}
		public := normalizeSettings(settings).Public.ModelChannel
		modelName = strings.TrimSpace(public.DefaultTextModel)
	}
	if modelName == "" {
		return resolvedAgentRunChannel{}, safeMessageError{message: "缺少文本模型"}
	}
	channelID := strings.TrimSpace(input.ChannelID)
	fallbackIDs := []string{}
	if input.AllowFallback {
		fallbackIDs = normalizeAgentRunFallbackChannelIDs(input.FallbackChannelIDs)
	}
	channel, err := SelectModelChannelWithOptions(modelName, channelID, fallbackIDs, "text")
	if err != nil {
		return resolvedAgentRunChannel{}, err
	}
	result := resolvedAgentRunChannel{
		ModelName:       modelName,
		TargetModel:     targetModel,
		Channel:         channel,
		TargetChannelID: channelID,
	}
	if channelID != "" && channel.ID != channelID {
		result.FallbackUsed = true
		result.FallbackReason = "指定渠道不可用，按 Agent 设置使用 fallback 渠道"
	}
	return result, nil
}

func buildAgentRunChatRequest(input CreateAgentRunInput, modelName string) ([]byte, error) {
	messages := normalizeAgentRunMessages(input.Messages)
	if len(messages) == 0 {
		if strings.TrimSpace(input.SystemPrompt) != "" {
			messages = append(messages, AgentRunMessage{Role: "system", Content: strings.TrimSpace(input.SystemPrompt)})
		}
		if strings.TrimSpace(input.UserPrompt) != "" {
			messages = append(messages, AgentRunMessage{Role: "user", Content: strings.TrimSpace(input.UserPrompt)})
		}
	}
	if len(messages) == 0 {
		return nil, safeMessageError{message: "缺少 Agent 输入提示词"}
	}
	body := map[string]any{
		"model":    modelName,
		"messages": messages,
	}
	if input.Temperature != nil {
		body["temperature"] = *input.Temperature
	}
	if input.MaxOutputTokens > 0 {
		body["max_tokens"] = input.MaxOutputTokens
	}
	if len(input.Variables) > 0 || len(input.SourceSnapshot) > 0 {
		body["metadata"] = map[string]any{"variables": input.Variables, "sourceSnapshot": input.SourceSnapshot}
	}
	return json.Marshal(body)
}

func callAgentRunTextModel(run model.AgentRun, channel model.ModelChannel, requestBody []byte, timeoutSeconds int) model.AgentRun {
	startedAt := time.Now()
	run.StartedAt = startedAt.Format(time.RFC3339Nano)
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutSeconds)*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, BuildModelChannelURL(channel, "/chat/completions"), bytes.NewReader(requestBody))
	if err != nil {
		return failAgentRun(run, startedAt, "Agent Run 请求创建失败")
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
	request.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: time.Duration(timeoutSeconds) * time.Second}
	response, err := client.Do(request)
	if err != nil {
		return failAgentRun(run, startedAt, "Agent Run 文本模型请求失败")
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode >= http.StatusBadRequest {
		return failAgentRun(run, startedAt, upstreamAgentRunError(body, response.StatusCode))
	}
	rawOutput := extractAgentRunText(body)
	run.RawOutput = rawOutput
	run.StructuredDraftJSON = extractJSONDraft(rawOutput)
	run.Status = model.AgentRunStatusNeedsReview
	run.ErrorMessage = ""
	run.FinishedAt = now()
	run.DurationMs = time.Since(startedAt).Milliseconds()
	run.UpdatedAt = run.FinishedAt
	return run
}

func failAgentRun(run model.AgentRun, startedAt time.Time, message string) model.AgentRun {
	run.Status = model.AgentRunStatusFailed
	run.ErrorMessage = strings.TrimSpace(message)
	run.FinishedAt = now()
	if !startedAt.IsZero() {
		run.DurationMs = time.Since(startedAt).Milliseconds()
	}
	run.UpdatedAt = run.FinishedAt
	return run
}

func normalizeAgentRunFallbackChannelIDs(ids []string) []string {
	result := []string{}
	seen := map[string]bool{}
	for _, item := range ids {
		id := strings.TrimSpace(item)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		result = append(result, id)
	}
	return result
}

func normalizeAgentRunTimeout(value int) int {
	if value <= 0 {
		return 300
	}
	if value < 30 {
		return 30
	}
	if value > 1800 {
		return 1800
	}
	return value
}

func normalizeAgentRunConcurrency(value int) int {
	if value <= 0 {
		return 1
	}
	if value > 10 {
		return 10
	}
	return value
}

func normalizeAgentRunMaxAttempts(value int) int {
	if value <= 0 {
		return 3
	}
	return value
}

func normalizeAgentRunMessages(messages []AgentRunMessage) []AgentRunMessage {
	result := []AgentRunMessage{}
	for _, item := range messages {
		role := strings.TrimSpace(item.Role)
		content := strings.TrimSpace(item.Content)
		if role == "" || content == "" {
			continue
		}
		result = append(result, AgentRunMessage{Role: role, Content: content})
	}
	return result
}

func normalizeAgentWritePolicy(value string) string {
	if strings.TrimSpace(value) == "preview_only" {
		return "preview_only"
	}
	return "confirm_before_write"
}

func extractAgentRunText(body []byte) string {
	var payload struct {
		OutputText string `json:"output_text"`
		Choices    []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
			Text string `json:"text"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(body, &payload); err == nil {
		if strings.TrimSpace(payload.OutputText) != "" {
			return strings.TrimSpace(payload.OutputText)
		}
		for _, choice := range payload.Choices {
			if strings.TrimSpace(choice.Message.Content) != "" {
				return strings.TrimSpace(choice.Message.Content)
			}
			if strings.TrimSpace(choice.Text) != "" {
				return strings.TrimSpace(choice.Text)
			}
		}
	}
	return strings.TrimSpace(string(body))
}

func extractJSONDraft(text string) string {
	value := strings.TrimSpace(text)
	if value == "" {
		return ""
	}
	if json.Valid([]byte(value)) {
		return value
	}
	for _, pair := range [][2]string{{"{", "}"}, {"[", "]"}} {
		start := strings.Index(value, pair[0])
		end := strings.LastIndex(value, pair[1])
		if start >= 0 && end > start {
			candidate := value[start : end+1]
			if json.Valid([]byte(candidate)) {
				return candidate
			}
		}
	}
	return ""
}

func upstreamAgentRunError(body []byte, statusCode int) string {
	var payload struct {
		Error struct {
			Message string `json:"message"`
			Code    string `json:"code"`
		} `json:"error"`
		Message string `json:"message"`
		Msg     string `json:"msg"`
	}
	if err := json.Unmarshal(body, &payload); err == nil {
		if payload.Error.Message != "" {
			if payload.Error.Code != "" {
				return payload.Error.Code + ": " + payload.Error.Message
			}
			return payload.Error.Message
		}
		if payload.Message != "" {
			return payload.Message
		}
		if payload.Msg != "" {
			return payload.Msg
		}
	}
	return fmt.Sprintf("Agent Run 上游请求失败：HTTP %d", statusCode)
}

func agentConfigRecordID(userID string, scope string, projectID string, episodeID string, kind string) string {
	parts := []string{"agentconfig", strings.TrimSpace(userID), strings.TrimSpace(scope), strings.TrimSpace(projectID), strings.TrimSpace(episodeID), strings.TrimSpace(kind)}
	return strings.ReplaceAll(strings.Join(parts, "-"), " ", "_")
}
