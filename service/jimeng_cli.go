package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"mime"
	"mime/multipart"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/basketikun/infinite-canvas/model"
)

const defaultJimengCLIName = "dreamina"

var jimengCommandMutex sync.Mutex
var jimengPreflightTimeout = 15 * time.Second

type jimengCLIHomeContextKey struct{}

type JimengCLIPreflightResult struct {
	CLIPath    string
	OutputDir  string
	Version    string
	LoginReady bool
}

type JimengLoginStartResult struct {
	CLIPath                 string `json:"cliPath"`
	VerificationURI         string `json:"verificationUri"`
	VerificationURIComplete string `json:"verificationUriComplete,omitempty"`
	UserCode                string `json:"userCode"`
	DeviceCode              string `json:"deviceCode"`
	ExpiresIn               int64  `json:"expiresIn,omitempty"`
	Interval                int64  `json:"interval,omitempty"`
	LoginReady              bool   `json:"loginReady,omitempty"`
	Message                 string `json:"message,omitempty"`
}

type JimengLoginCheckResult struct {
	LoginReady bool   `json:"loginReady"`
	Message    string `json:"message"`
}

func SupportedJimengModelVersions() []string {
	return []string{"seedance2.0fast", "seedance2.0", "seedance2.0_vip", "seedance2.0fast_vip", "seedance2.0mini"}
}

func WithJimengCLIHome(ctx context.Context, home string) context.Context {
	home = strings.TrimSpace(home)
	if home == "" {
		return ctx
	}
	return context.WithValue(ctx, jimengCLIHomeContextKey{}, home)
}

func JimengUserHomeDir(_ model.ModelChannel, userID string) string {
	base := strings.TrimSpace(os.Getenv("DREAMINA_HOME"))
	if base == "" {
		base = filepath.Join("data", "dreamina-home")
	}
	safeID := stableModelChannelID(model.ModelChannel{Name: userID})
	if safeID == "model-channel" {
		safeID = "user"
	}
	return filepath.Join(base, "users", safeID)
}

func PreflightJimengCLIInstallation(channel model.ModelChannel, modelName string) (JimengCLIPreflightResult, error) {
	channel = normalizeModelChannel(channel)
	if !modelChannelSupportsModel(channel, modelName) {
		return JimengCLIPreflightResult{}, safeMessageError{message: "即梦 CLI 渠道不支持该模型"}
	}
	cliPath, err := resolveJimengCLIPath(channel)
	if err != nil {
		return JimengCLIPreflightResult{}, err
	}
	outputDir := resolveJimengOutputDir(channel)
	if err := ensureWritableDir(outputDir); err != nil {
		return JimengCLIPreflightResult{}, safeMessageError{message: "即梦 CLI 输出目录不可写"}
	}
	jimengCommandMutex.Lock()
	defer jimengCommandMutex.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), jimengPreflightTimeout)
	defer cancel()
	versionOutput, err := runJimengCLIUnlocked(ctx, channel, "version")
	if err != nil {
		return JimengCLIPreflightResult{}, safeMessageError{message: "即梦 CLI 版本检查失败"}
	}
	return JimengCLIPreflightResult{
		CLIPath:   cliPath,
		OutputDir: outputDir,
		Version:   parseJimengVersion(versionOutput),
	}, nil
}

func PreflightJimengCLI(ctx context.Context, channel model.ModelChannel, modelName string) (JimengCLIPreflightResult, error) {
	result, err := PreflightJimengCLIInstallation(channel, modelName)
	if err != nil {
		return JimengCLIPreflightResult{}, err
	}
	channel = normalizeModelChannel(channel)
	jimengCommandMutex.Lock()
	defer jimengCommandMutex.Unlock()
	commandCtx, cancel := context.WithTimeout(ctx, jimengPreflightTimeout)
	defer cancel()
	if _, err := runJimengCLIUnlocked(commandCtx, channel, "user_credit"); err != nil {
		return JimengCLIPreflightResult{}, safeMessageError{message: "即梦 CLI 未登录或登录态无效，请先在个人配置中完成即梦网页登录"}
	}
	result.LoginReady = true
	return result, nil
}

func SubmitJimengVideoTask(ctx context.Context, channel model.ModelChannel, body []byte, contentType string, modelName string) ([]byte, error) {
	channel = normalizeModelChannel(channel)
	command, err := prepareJimengVideoCommand(body, contentType, modelName, channel.SessionID)
	if err != nil {
		return nil, err
	}
	defer command.cleanup()
	commandCtx, cancel := context.WithTimeout(ctx, jimengCommandTimeout(channel))
	defer cancel()
	output, err := runJimengCLI(commandCtx, channel, command.args...)
	if err != nil {
		return nil, err
	}
	return NormalizeJimengVideoTaskResponse(output)
}

func StartJimengLogin(ctx context.Context, channel model.ModelChannel) (JimengLoginStartResult, error) {
	channel = normalizeModelChannel(channel)
	cliPath, err := resolveJimengCLIPath(channel)
	if err != nil {
		return JimengLoginStartResult{}, err
	}
	commandCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	output, err := runJimengCLI(commandCtx, channel, "login", "--headless")
	if err != nil {
		return JimengLoginStartResult{}, err
	}
	result, err := parseJimengLoginStartResult(output)
	if err != nil {
		return JimengLoginStartResult{}, err
	}
	result.CLIPath = cliPath
	return result, nil
}

func CheckJimengLogin(ctx context.Context, channel model.ModelChannel, deviceCode string) (JimengLoginCheckResult, error) {
	channel = normalizeModelChannel(channel)
	deviceCode = strings.TrimSpace(deviceCode)
	if deviceCode == "" {
		return JimengLoginCheckResult{}, errors.New("缺少即梦登录 device_code")
	}
	commandCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	output, err := runJimengCLI(commandCtx, channel, "login", "checklogin", "--device_code="+deviceCode, "--poll=30")
	if err != nil {
		return JimengLoginCheckResult{}, err
	}
	return JimengLoginCheckResult{LoginReady: true, Message: jimengLoginCheckMessage(output)}, nil
}

func StartUserJimengLogin(ctx context.Context, user model.AuthUser, modelName string) (JimengLoginStartResult, error) {
	loginCtx, channel, err := userJimengLoginContext(ctx, user, modelName)
	if err != nil {
		return JimengLoginStartResult{}, err
	}
	return StartJimengLogin(loginCtx, channel)
}

func CheckUserJimengLogin(ctx context.Context, user model.AuthUser, modelName string, deviceCode string) (JimengLoginCheckResult, error) {
	loginCtx, channel, err := userJimengLoginContext(ctx, user, modelName)
	if err != nil {
		return JimengLoginCheckResult{}, err
	}
	return CheckJimengLogin(loginCtx, channel, deviceCode)
}

func QueryJimengVideoTask(ctx context.Context, channel model.ModelChannel, submitID string) ([]byte, error) {
	submitID = strings.TrimSpace(submitID)
	if submitID == "" {
		return nil, errors.New("缺少即梦任务 ID")
	}
	commandCtx, cancel := context.WithTimeout(ctx, jimengCommandTimeout(channel))
	defer cancel()
	output, err := runJimengCLI(commandCtx, channel, "query_result", "--submit_id="+submitID)
	if err != nil {
		return nil, err
	}
	return NormalizeJimengVideoTaskResponse(output)
}

func userJimengLoginContext(ctx context.Context, user model.AuthUser, modelName string) (context.Context, model.ModelChannel, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	userID := strings.TrimSpace(user.ID)
	if userID == "" {
		return ctx, model.ModelChannel{}, safeMessageError{message: "缺少用户身份"}
	}
	modelName = strings.TrimSpace(modelName)
	if modelName == "" {
		settings, err := PublicSettings()
		if err != nil {
			return ctx, model.ModelChannel{}, err
		}
		modelName = strings.TrimSpace(settings.ModelChannel.DefaultVideoModel)
	}
	if modelName == "" {
		return ctx, model.ModelChannel{}, safeMessageError{message: "缺少视频模型"}
	}
	channel, err := SelectModelChannel(modelName)
	if err != nil {
		return ctx, model.ModelChannel{}, err
	}
	if !IsJimengCLIProtocol(channel.Protocol) {
		return ctx, model.ModelChannel{}, safeMessageError{message: "当前视频模型不是即梦 CLI"}
	}
	return WithJimengCLIHome(ctx, JimengUserHomeDir(channel, userID)), channel, nil
}

func parseJimengLoginStartResult(body []byte) (JimengLoginStartResult, error) {
	payload, err := jimengJSONObject(body)
	if err != nil {
		return parseJimengLoginStartText(body)
	}
	return parseJimengLoginStartPayload(payload)
}

func parseJimengLoginStartPayload(payload map[string]any) (JimengLoginStartResult, error) {
	result := JimengLoginStartResult{
		VerificationURI:         aiTaskStringValue(payload, "verification_uri", "verificationUri", "verification_url", "verificationURL"),
		VerificationURIComplete: aiTaskStringValue(payload, "verification_uri_complete", "verificationUriComplete"),
		UserCode:                aiTaskStringValue(payload, "user_code", "userCode"),
		DeviceCode:              aiTaskStringValue(payload, "device_code", "deviceCode"),
		ExpiresIn:               aiTaskInt64Value(payload, "expires_in", "expiresIn"),
		Interval:                aiTaskInt64Value(payload, "interval"),
		LoginReady:              jimengBoolValue(payload, "login_ready", "loginReady"),
		Message:                 aiTaskStringValue(payload, "message", "msg"),
	}
	if result.VerificationURI == "" && result.VerificationURIComplete != "" {
		result.VerificationURI = result.VerificationURIComplete
	}
	status := strings.ToLower(aiTaskStringValue(payload, "status", "login_status"))
	if result.LoginReady || status == "success" || status == "ready" || status == "logged_in" || status == "already_logged_in" {
		result.LoginReady = true
		if result.Message == "" {
			result.Message = "即梦 CLI 已登录"
		}
		return result, nil
	}
	if result.VerificationURI == "" || result.UserCode == "" || result.DeviceCode == "" {
		return JimengLoginStartResult{}, errors.New("即梦 CLI 没有返回网页登录验证信息")
	}
	return result, nil
}

func parseJimengLoginStartText(body []byte) (JimengLoginStartResult, error) {
	text := strings.TrimSpace(string(body))
	if strings.Contains(text, "已复用当前本地 OAuth 登录态") || strings.Contains(strings.ToLower(text), "reused current local oauth login") {
		return JimengLoginStartResult{LoginReady: true, Message: "即梦 CLI 已登录"}, nil
	}
	values := map[string]string{}
	for _, line := range strings.Split(text, "\n") {
		key, value, ok := strings.Cut(strings.TrimSpace(line), ":")
		if !ok {
			continue
		}
		values[jimengLoginTextKey(key)] = strings.Trim(strings.TrimSpace(value), `"'`)
	}
	result := JimengLoginStartResult{
		VerificationURI:         firstJimengLoginTextValue(values, "verification_uri", "verification_url", "url"),
		VerificationURIComplete: firstJimengLoginTextValue(values, "verification_uri_complete", "verification_url_complete"),
		UserCode:                firstJimengLoginTextValue(values, "user_code"),
		DeviceCode:              firstJimengLoginTextValue(values, "device_code"),
		ExpiresIn:               jimengLoginTextSeconds(firstJimengLoginTextValue(values, "expires_in")),
		Interval:                jimengLoginTextSeconds(firstJimengLoginTextValue(values, "interval", "poll_interval")),
	}
	if result.VerificationURI == "" && result.VerificationURIComplete != "" {
		result.VerificationURI = result.VerificationURIComplete
	}
	if result.VerificationURI == "" || result.UserCode == "" || result.DeviceCode == "" {
		return JimengLoginStartResult{}, errors.New("即梦 CLI 没有返回网页登录验证信息")
	}
	return result, nil
}

func jimengLoginTextKey(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.NewReplacer("-", "_", " ", "_").Replace(value)
	return value
}

func firstJimengLoginTextValue(values map[string]string, keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(values[key]); value != "" {
			return value
		}
	}
	return ""
}

func jimengLoginTextSeconds(value string) int64 {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0
	}
	if seconds, err := strconv.ParseInt(value, 10, 64); err == nil {
		return seconds
	}
	if duration, err := time.ParseDuration(value); err == nil {
		return int64(duration / time.Second)
	}
	return 0
}

func jimengBoolValue(payload map[string]any, keys ...string) bool {
	for _, key := range keys {
		switch value := payload[key].(type) {
		case bool:
			return value
		case string:
			text := strings.TrimSpace(strings.ToLower(value))
			return text == "true" || text == "1" || text == "yes"
		}
	}
	return false
}

func jimengLoginCheckMessage(body []byte) string {
	payload, err := jimengJSONObject(body)
	if err != nil {
		return strings.TrimSpace(string(body))
	}
	if message := aiTaskStringValue(payload, "message", "msg"); message != "" {
		return message
	}
	if status := aiTaskStringValue(payload, "status"); status != "" {
		return status
	}
	return "即梦网页登录验证已完成"
}

func DownloadJimengVideoTaskContent(ctx context.Context, channel model.ModelChannel, submitID string) (string, []byte, error) {
	submitID = strings.TrimSpace(submitID)
	if submitID == "" {
		return "", nil, errors.New("缺少即梦任务 ID")
	}
	outputDir := jimengTaskOutputDir(channel, submitID)
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return "", nil, err
	}
	commandCtx, cancel := context.WithTimeout(ctx, jimengCommandTimeout(channel))
	defer cancel()
	output, err := runJimengCLI(commandCtx, channel, "query_result", "--submit_id="+submitID, "--download_dir="+outputDir)
	if err != nil {
		return "", nil, err
	}
	normalized, err := NormalizeJimengVideoTaskResponse(output)
	if err != nil {
		return "", nil, err
	}
	videoPath, err := findJimengDownloadedVideo(outputDir)
	if err != nil {
		return "", normalized, err
	}
	return videoPath, normalized, nil
}

func BuildJimengText2VideoArgs(body []byte, contentType string, modelVersion string, sessionID int) ([]string, error) {
	fields, err := readJimengVideoFields(body, contentType)
	if err != nil {
		return nil, err
	}
	if fields.HasReferences {
		return nil, errors.New("即梦 CLI 参考生成需要上传图片、视频或音频文件，暂不支持 JSON 或 URL 参考")
	}
	prompt := strings.TrimSpace(fields.Prompt)
	if prompt == "" {
		return nil, errors.New("缺少视频提示词")
	}
	modelVersion = strings.TrimSpace(modelVersion)
	if modelVersion == "" {
		modelVersion = "seedance2.0fast"
	}
	args := []string{
		"text2video",
		"--prompt=" + prompt,
		"--duration=" + strconv.Itoa(normalizeJimengDuration(fields.Duration)),
		"--ratio=" + normalizeJimengRatio(fields.Ratio),
		"--video_resolution=" + normalizeJimengModelResolution(modelVersion, fields.Resolution),
		"--model_version=" + modelVersion,
	}
	if sessionID > 0 {
		args = append(args, "--session="+strconv.Itoa(sessionID))
	}
	return append(args, "--poll=0"), nil
}

func NormalizeJimengVideoTaskResponse(body []byte) ([]byte, error) {
	payload, err := jimengJSONObject(body)
	if err != nil {
		return nil, err
	}
	payload = unwrapJimengPayload(payload)
	id := aiTaskStringValue(payload, "submit_id", "id", "task_id")
	if id == "" {
		return nil, errors.New("即梦 CLI 没有返回任务 ID")
	}
	rawStatus := aiTaskStringValue(payload, "gen_status", "status")
	if rawStatus == "" {
		rawStatus = "querying"
	}
	normalized := map[string]any{
		"id":         id,
		"status":     normalizeJimengTaskStatus(rawStatus),
		"raw_status": rawStatus,
	}
	putJimengString(normalized, "model", aiTaskStringValue(payload, "model_version", "model"))
	putJimengString(normalized, "resolution", aiTaskStringValue(payload, "video_resolution", "resolution"))
	putJimengString(normalized, "ratio", aiTaskStringValue(payload, "ratio"))
	putJimengNumber(normalized, "duration", aiTaskInt64Value(payload, "duration"))
	if videoURL := jimengVideoURL(payload); videoURL != "" {
		normalized["video_url"] = videoURL
		normalized["content"] = map[string]string{"video_url": videoURL}
	}
	if message := jimengFailureMessage(payload); message != "" {
		normalized["error"] = map[string]string{"message": message}
	}
	return json.Marshal(normalized)
}

func JimengTaskIDFromNormalized(body []byte) string {
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return ""
	}
	return aiTaskStringValue(payload, "id")
}

func JimengTaskStatusFromNormalized(body []byte) model.AITaskStatus {
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return model.AITaskStatusCreated
	}
	return normalizeAITaskStatus(aiTaskStringValue(payload, "status"))
}

func resolveJimengCLIPath(channel model.ModelChannel) (string, error) {
	path := strings.TrimSpace(channel.CLIPath)
	if path == "" {
		path = strings.TrimSpace(channel.BaseURL)
	}
	if path == "" {
		path = defaultJimengCLIName
	}
	if strings.ContainsRune(path, filepath.Separator) {
		if info, err := os.Stat(path); err != nil || info.IsDir() {
			return "", safeMessageError{message: "未找到即梦 CLI 可执行文件"}
		}
		return path, nil
	}
	resolved, err := exec.LookPath(path)
	if err != nil {
		return "", safeMessageError{message: "未找到即梦 CLI，请先安装 dreamina"}
	}
	return resolved, nil
}

func resolveJimengOutputDir(channel model.ModelChannel) string {
	if strings.TrimSpace(channel.OutputDir) != "" {
		return strings.TrimSpace(channel.OutputDir)
	}
	if outputDir := strings.TrimSpace(os.Getenv("DREAMINA_OUTPUT_DIR")); outputDir != "" {
		return outputDir
	}
	return filepath.Join("data", "jimeng-cli")
}

func runJimengCLI(ctx context.Context, channel model.ModelChannel, args ...string) ([]byte, error) {
	jimengCommandMutex.Lock()
	defer jimengCommandMutex.Unlock()
	return runJimengCLIUnlocked(ctx, channel, args...)
}

func runJimengCLIUnlocked(ctx context.Context, channel model.ModelChannel, args ...string) ([]byte, error) {
	cliPath, err := resolveJimengCLIPath(channel)
	if err != nil {
		return nil, err
	}
	command := exec.CommandContext(ctx, cliPath, args...)
	if strings.TrimSpace(channel.WorkDir) != "" {
		command.Dir = strings.TrimSpace(channel.WorkDir)
	}
	if home := jimengCLIHome(ctx); home != "" {
		if err := os.MkdirAll(home, 0700); err != nil {
			return nil, safeMessageError{message: "即梦 CLI 登录态目录不可写"}
		}
		command.Env = jimengEnvironmentWithHome(os.Environ(), home)
	}
	var stderr bytes.Buffer
	command.Stderr = &stderr
	output, err := command.Output()
	if err != nil {
		message := strings.TrimSpace(stderr.String())
		if message == "" {
			message = err.Error()
		}
		if strings.Contains(message, "AigcComplianceConfirmationRequired") {
			message = "即梦模型需要完成一次性内容合规授权，请先在即梦网页生成一次并确认授权后重试"
		}
		return output, safeMessageError{message: message}
	}
	return output, nil
}

func jimengCLIHome(ctx context.Context) string {
	if value, ok := ctx.Value(jimengCLIHomeContextKey{}).(string); ok {
		if home := strings.TrimSpace(value); home != "" {
			return home
		}
	}
	return strings.TrimSpace(os.Getenv("DREAMINA_HOME"))
}

func jimengEnvironmentWithHome(environment []string, home string) []string {
	if runtime.GOOS == "darwin" {
		return environment
	}
	result := make([]string, 0, len(environment)+1)
	for _, value := range environment {
		if !strings.HasPrefix(value, "HOME=") {
			result = append(result, value)
		}
	}
	return append(result, "HOME="+home)
}

type jimengVideoFields struct {
	Prompt        string
	Duration      string
	Ratio         string
	Resolution    string
	HasReferences bool
}

func readJimengVideoFields(body []byte, contentType string) (jimengVideoFields, error) {
	if strings.HasPrefix(contentType, "multipart/form-data") {
		_, params, err := mime.ParseMediaType(contentType)
		if err != nil {
			return jimengVideoFields{}, err
		}
		form, err := multipart.NewReader(bytes.NewReader(body), params["boundary"]).ReadForm(32 << 20)
		if err != nil {
			return jimengVideoFields{}, err
		}
		defer form.RemoveAll()
		return jimengVideoFields{
			Prompt:        firstArkFormValue(form.Value, "prompt"),
			Duration:      firstArkFormAliasValue(form.Value, "duration", "seconds"),
			Ratio:         firstArkFormAliasValue(form.Value, "ratio", "size"),
			Resolution:    firstArkFormAliasValue(form.Value, "video_resolution", "resolution", "resolution_name"),
			HasReferences: len(form.File["input_reference[]"]) > 0 || len(form.Value["input_reference[]"]) > 0,
		}, nil
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return jimengVideoFields{}, err
	}
	return jimengVideoFields{
		Prompt:        jimengPrompt(payload),
		Duration:      aiTaskStringValue(payload, "duration", "seconds"),
		Ratio:         aiTaskStringValue(payload, "ratio", "size"),
		Resolution:    aiTaskStringValue(payload, "video_resolution", "resolution", "resolution_name"),
		HasReferences: jimengPayloadHasReferences(payload),
	}, nil
}

func jimengPrompt(payload map[string]any) string {
	if prompt := aiTaskStringValue(payload, "prompt"); prompt != "" {
		return prompt
	}
	items, _ := payload["content"].([]any)
	for _, item := range items {
		record, ok := item.(map[string]any)
		if !ok || aiTaskStringValue(record, "type") != "text" {
			continue
		}
		if text := aiTaskStringValue(record, "text"); text != "" {
			return text
		}
	}
	return ""
}

func jimengPayloadHasReferences(payload map[string]any) bool {
	for _, key := range []string{"input_reference", "input_reference[]", "image", "video", "audio"} {
		if value := aiTaskStringValue(payload, key); value != "" {
			return true
		}
	}
	items, _ := payload["content"].([]any)
	for _, item := range items {
		record, ok := item.(map[string]any)
		if !ok {
			continue
		}
		switch aiTaskStringValue(record, "type") {
		case "image_url", "video_url", "audio_url":
			return true
		}
	}
	return false
}

func normalizeJimengDuration(value string) int {
	duration, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil || duration == 0 {
		duration = 6
	}
	if duration < 4 {
		return 4
	}
	if duration > 15 {
		return 15
	}
	return duration
}

func normalizeJimengRatio(value string) string {
	switch strings.TrimSpace(value) {
	case "1:1", "3:4", "16:9", "4:3", "9:16", "21:9":
		return strings.TrimSpace(value)
	case "720x1280", "1080x1920":
		return "9:16"
	case "1280x720", "1920x1080":
		return "16:9"
	default:
		return "16:9"
	}
}

func normalizeJimengResolution(value string) string {
	resolution := strings.ToLower(strings.TrimSpace(value))
	if resolution == "1080" || resolution == "1080p" {
		return "1080p"
	}
	return "720p"
}

func normalizeJimengTaskStatus(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "success", "succeeded", "completed":
		return "succeeded"
	case "fail", "failed", "error", "expired":
		return "failed"
	case "cancel", "cancelled", "canceled":
		return "cancelled"
	case "querying", "running", "processing", "in_progress":
		return "running"
	default:
		return "queued"
	}
}

func jimengJSONObject(body []byte) (map[string]any, error) {
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err == nil && payload != nil {
		return payload, nil
	}
	text := strings.TrimSpace(string(body))
	start := strings.Index(text, "{")
	end := strings.LastIndex(text, "}")
	if start < 0 || end <= start {
		return nil, errors.New("即梦 CLI 输出不是 JSON")
	}
	if err := json.Unmarshal([]byte(text[start:end+1]), &payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func unwrapJimengPayload(payload map[string]any) map[string]any {
	for _, key := range []string{"data", "result", "task"} {
		if nested, ok := payload[key].(map[string]any); ok {
			return nested
		}
	}
	return payload
}

func jimengVideoURL(payload map[string]any) string {
	if value := aiTaskStringValue(payload, "video_url", "url", "video"); value != "" {
		return value
	}
	for _, key := range []string{"content", "result", "output"} {
		if nested, ok := payload[key].(map[string]any); ok {
			if value := jimengVideoURL(nested); value != "" {
				return value
			}
		}
		if items, ok := payload[key].([]any); ok {
			for _, item := range items {
				if nested, ok := item.(map[string]any); ok {
					if value := jimengVideoURL(nested); value != "" {
						return value
					}
				}
				if text, ok := item.(string); ok && strings.TrimSpace(text) != "" {
					return strings.TrimSpace(text)
				}
			}
		}
	}
	if items, ok := payload["downloaded_files"].([]any); ok && len(items) > 0 {
		if text, ok := items[0].(string); ok {
			return "jimeng-local:" + filepath.Base(text)
		}
	}
	return ""
}

func jimengFailureMessage(payload map[string]any) string {
	if value := aiTaskStringValue(payload, "fail_reason", "error_message", "message", "msg"); value != "" {
		return value
	}
	if nested, ok := payload["error"].(map[string]any); ok {
		return aiTaskStringValue(nested, "message", "msg", "code")
	}
	return ""
}

func putJimengString(payload map[string]any, key string, value string) {
	if strings.TrimSpace(value) != "" {
		payload[key] = strings.TrimSpace(value)
	}
}

func putJimengNumber(payload map[string]any, key string, value int64) {
	if value > 0 {
		payload[key] = value
	}
}

func parseJimengVersion(body []byte) string {
	payload, err := jimengJSONObject(body)
	if err != nil {
		return strings.TrimSpace(string(body))
	}
	return aiTaskStringValue(payload, "version", "commit")
}

func ensureWritableDir(dir string) error {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	file, err := os.CreateTemp(dir, ".write-test-*")
	if err != nil {
		return err
	}
	name := file.Name()
	_ = file.Close()
	return os.Remove(name)
}

func jimengCommandTimeout(channel model.ModelChannel) time.Duration {
	if channel.TimeoutSeconds > 0 {
		return time.Duration(channel.TimeoutSeconds) * time.Second
	}
	return AIVideoTaskTimeout
}

func jimengTaskOutputDir(channel model.ModelChannel, submitID string) string {
	safeID := stableModelChannelID(model.ModelChannel{Name: submitID})
	if safeID == "model-channel" {
		safeID = "task"
	}
	return filepath.Join(resolveJimengOutputDir(channel), safeID)
}

func findJimengDownloadedVideo(dir string) (string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", err
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(entry.Name()))
		if ext == ".mp4" || ext == ".mov" || ext == ".m4v" || ext == ".webm" {
			return filepath.Join(dir, entry.Name()), nil
		}
	}
	return "", errors.New("即梦 CLI 未下载到视频文件")
}
