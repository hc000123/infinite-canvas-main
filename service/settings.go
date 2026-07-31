package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"net/url"
	"sort"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

const (
	modelProtocolOpenAI        = string(model.ModelProtocolOpenAI)
	modelProtocolVolcengineArk = string(model.ModelProtocolVolcengineArk)
	modelProtocolJimengCLI     = string(model.ModelProtocolJimengCLI)
	modelProtocolXinglianCloud = string(model.ModelProtocolXinglianCloud)
	maskedAPIKey               = "********"
	textEndpointChat           = "chat_completions"
	textEndpointResponses      = "responses"
)

func PublicSettings() (model.PublicSetting, error) {
	settings, err := repository.GetSettings()
	return normalizeSettings(settings).Public, err
}

func IsCustomChannelAllowed() (bool, error) {
	return false, nil
}

func AdminSettings() (model.Settings, error) {
	settings, err := repository.GetSettings()
	return hidePrivateAPIKeys(normalizeSettings(settings)), err
}

func SaveSettings(settings model.Settings) (model.Settings, error) {
	saved, err := repository.GetSettings()
	if err != nil {
		return model.Settings{}, err
	}
	settings = normalizeSettings(settings)
	if err := validateModelProtocolConflicts(settings.Private.Channels); err != nil {
		return model.Settings{}, err
	}
	normalizedSaved := normalizeSettings(saved)
	keepPrivateAPIKeys(&settings, normalizedSaved)
	keepPrivateAuthSecrets(&settings, normalizedSaved)
	keepPrivateVolcengineAssetSecrets(&settings, normalizedSaved)
	result, err := repository.SaveSettings(settings, now())
	if err == nil {
		RefreshPromptSyncScheduler()
	}
	return hidePrivateAPIKeys(result), err
}

func validateModelProtocolConflicts(channels []model.ModelChannel) error {
	protocols := map[string]string{}
	for _, channel := range normalizePrivateSetting(model.PrivateSetting{Channels: channels}).Channels {
		if !channel.Enabled {
			continue
		}
		protocol := normalizeModelProtocol(channel.Protocol)
		for _, modelName := range channel.Models {
			modelName = strings.TrimSpace(modelName)
			if modelName == "" {
				continue
			}
			if previous := protocols[modelName]; previous != "" && previous != protocol {
				return fmt.Errorf("同名模型跨协议冲突：%s 同时属于 %s 和 %s", modelName, previous, protocol)
			}
			protocols[modelName] = protocol
		}
	}
	return nil
}

func AdminChannelModels(index *int, channel model.ModelChannel) ([]string, error) {
	resolved, err := resolveAdminChannel(index, channel)
	if err != nil {
		return nil, err
	}
	return fetchAdminChannelModels(resolved)
}

func AdminTestChannelModel(index *int, channel model.ModelChannel, modelName string) (string, error) {
	resolved, err := resolveAdminChannel(index, channel)
	if err != nil {
		return "", err
	}
	return testAdminChannelModel(resolved, modelName)
}

type ModelChannelPreflightResult struct {
	ChannelName      string `json:"channelName"`
	Model            string `json:"model"`
	Protocol         string `json:"protocol"`
	BaseURL          string `json:"baseUrl"`
	EndpointID       string `json:"endpointId"`
	APIKeyConfigured bool   `json:"apiKeyConfigured"`
	APIKeyHint       string `json:"apiKeyHint"`
	CLIPath          string `json:"cliPath,omitempty"`
	OutputDir        string `json:"outputDir,omitempty"`
	Version          string `json:"version,omitempty"`
	LoginReady       bool   `json:"loginReady,omitempty"`
}

func PreflightModelChannel(modelName string) (ModelChannelPreflightResult, error) {
	return preflightModelChannel(context.Background(), model.AuthUser{}, modelName, false)
}

func PreflightModelChannelForUser(ctx context.Context, user model.AuthUser, modelName string) (ModelChannelPreflightResult, error) {
	return preflightModelChannel(ctx, user, modelName, true)
}

func preflightModelChannel(ctx context.Context, user model.AuthUser, modelName string, useUserJimengHome bool) (ModelChannelPreflightResult, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	modelName = strings.TrimSpace(modelName)
	if modelName == "" {
		return ModelChannelPreflightResult{}, safeMessageError{message: "缺少视频模型"}
	}
	channel, err := SelectModelChannel(modelName)
	if err != nil {
		return ModelChannelPreflightResult{}, err
	}
	result := modelChannelPreflightResult(channel, modelName)
	if IsVolcengineArkProtocol(channel.Protocol) {
		if ModelChannelEndpointForModel(channel, modelName) == "" {
			return ModelChannelPreflightResult{}, safeMessageError{message: decoratePreflightChannelMessage("缺少火山 Endpoint / EP", result)}
		}
		if err := testArkChannelAuth(channel); err != nil {
			if safe, ok := err.(interface{ SafeMessage() string }); ok {
				return ModelChannelPreflightResult{}, safeMessageError{message: decoratePreflightChannelMessage(safe.SafeMessage(), result)}
			}
			return ModelChannelPreflightResult{}, safeMessageError{message: decoratePreflightChannelMessage("企业 API 预检请求失败，请检查 Base URL 是否可访问", result)}
		}
	}
	if IsJimengCLIProtocol(channel.Protocol) {
		preflightCtx := ctx
		if useUserJimengHome {
			userID := strings.TrimSpace(user.ID)
			if userID == "" {
				return ModelChannelPreflightResult{}, safeMessageError{message: "缺少用户身份"}
			}
			preflightCtx = WithJimengCLIHome(preflightCtx, JimengUserHomeDir(channel, userID))
		}
		jimengResult, err := PreflightJimengCLI(preflightCtx, channel, modelName)
		if err != nil {
			if safe, ok := err.(interface{ SafeMessage() string }); ok {
				return ModelChannelPreflightResult{}, safeMessageError{message: decoratePreflightChannelMessage(safe.SafeMessage(), result)}
			}
			return ModelChannelPreflightResult{}, safeMessageError{message: decoratePreflightChannelMessage("即梦 CLI 预检失败", result)}
		}
		result.CLIPath = jimengResult.CLIPath
		result.OutputDir = jimengResult.OutputDir
		result.Version = jimengResult.Version
		result.LoginReady = jimengResult.LoginReady
	}
	if IsXinglianCloudProtocol(channel.Protocol) {
		if err := PreflightXinglianChannel(channel, modelName); err != nil {
			if safe, ok := err.(interface{ SafeMessage() string }); ok {
				return ModelChannelPreflightResult{}, safeMessageError{message: decoratePreflightChannelMessage(safe.SafeMessage(), result)}
			}
			return ModelChannelPreflightResult{}, safeMessageError{message: decoratePreflightChannelMessage("星链云余额预检失败", result)}
		}
	}
	return result, nil
}

func modelChannelPreflightResult(channel model.ModelChannel, modelName string) ModelChannelPreflightResult {
	channel = normalizeModelChannel(channel)
	return ModelChannelPreflightResult{
		ChannelName:      strings.TrimSpace(channel.Name),
		Model:            strings.TrimSpace(modelName),
		Protocol:         normalizeModelProtocol(channel.Protocol),
		BaseURL:          safeModelChannelBaseURL(channel.BaseURL),
		EndpointID:       ModelChannelEndpointForModel(channel, modelName),
		APIKeyConfigured: strings.TrimSpace(channel.APIKey) != "",
		APIKeyHint:       apiKeyHint(channel.APIKey),
	}
}

func decoratePreflightChannelMessage(message string, result ModelChannelPreflightResult) string {
	details := []string{}
	if result.ChannelName != "" {
		details = append(details, "渠道："+result.ChannelName)
	}
	if result.Model != "" {
		details = append(details, "模型："+result.Model)
	}
	if result.EndpointID != "" {
		details = append(details, "EP："+result.EndpointID)
	}
	if result.BaseURL != "" {
		details = append(details, "Base URL："+result.BaseURL)
	}
	if result.APIKeyConfigured {
		if result.APIKeyHint != "" {
			details = append(details, "Key："+result.APIKeyHint)
		} else {
			details = append(details, "Key：已配置")
		}
	} else {
		details = append(details, "Key：未配置")
	}
	if len(details) == 0 {
		return message
	}
	return message + "（" + strings.Join(details, "；") + "）"
}

func safeModelChannelBaseURL(rawURL string) string {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return ""
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return ""
	}
	parsed.User = nil
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return strings.TrimRight(parsed.String(), "/")
}

func apiKeyHint(apiKey string) string {
	key := strings.TrimSpace(apiKey)
	if key == "" {
		return ""
	}
	runes := []rune(key)
	if len(runes) <= 4 {
		return "已配置"
	}
	return "..." + string(runes[len(runes)-4:])
}

func normalizeSettings(settings model.Settings) model.Settings {
	settings.Public = normalizePublicSetting(settings.Public)
	settings.Private = normalizePrivateSetting(settings.Private)
	settings.Public.ModelChannel = normalizePublicModelChannelWithPrivate(settings.Public.ModelChannel, settings.Private.Channels)
	settings.Public.VolcengineAsset.Enabled = settings.Private.VolcengineAsset.Enabled
	return settings
}

func normalizePublicSetting(setting model.PublicSetting) model.PublicSetting {
	if setting.ModelChannel.AvailableModels == nil {
		setting.ModelChannel.AvailableModels = []string{}
	}
	if setting.ModelChannel.ModelCosts == nil {
		setting.ModelChannel.ModelCosts = []model.ModelCost{}
	}
	if setting.ModelChannel.ModelTextEndpoints == nil {
		setting.ModelChannel.ModelTextEndpoints = []model.ModelTextEndpointType{}
	}
	if setting.ModelChannel.ModelProtocols == nil {
		setting.ModelChannel.ModelProtocols = []model.ModelProtocolType{}
	}
	if setting.ModelChannel.ModelCapabilities == nil {
		setting.ModelChannel.ModelCapabilities = []model.ModelCapabilityType{}
	}
	if setting.ModelChannel.ModelSources == nil {
		setting.ModelChannel.ModelSources = []model.ModelSourceType{}
	}
	for i := range setting.ModelChannel.ModelCosts {
		setting.ModelChannel.ModelCosts[i].Model = strings.TrimSpace(setting.ModelChannel.ModelCosts[i].Model)
		if setting.ModelChannel.ModelCosts[i].Credits < 0 {
			setting.ModelChannel.ModelCosts[i].Credits = 0
		}
	}
	setting.ModelChannel.ModelTextEndpoints = normalizeModelTextEndpoints(setting.ModelChannel.ModelTextEndpoints, setting.ModelChannel.AvailableModels)
	if setting.ModelChannel.AllowCustomChannel == nil {
		enabled := false
		setting.ModelChannel.AllowCustomChannel = &enabled
	}
	if setting.Auth.AllowRegister == nil {
		enabled := true
		setting.Auth.AllowRegister = &enabled
	}
	return setting
}

func ModelCost(modelName string) (int, error) {
	settings, err := repository.GetSettings()
	if err != nil {
		return 0, err
	}
	modelName = strings.TrimSpace(modelName)
	public := normalizeSettings(settings).Public.ModelChannel
	if cost, ok := modelCostByName(public.ModelCosts, modelName); ok {
		return cost, nil
	}
	if strings.HasPrefix(strings.ToLower(modelName), "ep-") {
		for _, channel := range normalizePrivateSetting(settings.Private).Channels {
			channel = normalizeModelChannel(channel)
			if !modelMatchesArkEndpoint(channel, modelName) {
				continue
			}
			for _, candidate := range append([]string{public.DefaultVideoModel}, channel.Models...) {
				if cost, ok := modelCostByName(public.ModelCosts, candidate); ok {
					return cost, nil
				}
			}
		}
	}
	return 0, nil
}

func modelCostByName(items []model.ModelCost, modelName string) (int, bool) {
	modelName = strings.TrimSpace(modelName)
	normalizedModelName := normalizeVisibleArkModelName(modelName)
	for _, item := range normalizePublicSetting(model.PublicSetting{ModelChannel: model.PublicModelChannelSetting{ModelCosts: items}}).ModelChannel.ModelCosts {
		if item.Model == modelName || (normalizedModelName != "" && normalizeVisibleArkModelName(item.Model) == normalizedModelName) {
			return item.Credits, true
		}
	}
	return 0, false
}

func normalizePublicModelChannelWithPrivate(public model.PublicModelChannelSetting, channels []model.ModelChannel) model.PublicModelChannelSetting {
	public.DefaultModel = ""
	endpointModels := map[string][]string{}
	openAIModels := map[string]bool{}
	modelProtocols := map[string]string{}
	modelCapabilities := map[string][]string{}
	setModelProtocol := func(modelName string, protocol string, overwrite bool) {
		modelName = strings.TrimSpace(modelName)
		if modelName == "" {
			return
		}
		if !overwrite {
			if _, ok := modelProtocols[modelName]; ok {
				return
			}
		}
		modelProtocols[modelName] = normalizeModelProtocol(protocol)
	}
	setModelCapabilities := func(modelName string, capabilities []string) {
		modelName = strings.TrimSpace(modelName)
		if modelName == "" {
			return
		}
		modelCapabilities[modelName] = uniqueModelNames(append(modelCapabilities[modelName], capabilities...))
	}
	for _, channel := range channels {
		channel = normalizeModelChannel(channel)
		contributesMetadata := modelChannelContributesPublicMetadata(channel)
		if !IsVolcengineArkProtocol(channel.Protocol) {
			for _, modelName := range channel.Models {
				modelName = strings.TrimSpace(modelName)
				if normalizeModelProtocol(channel.Protocol) == modelProtocolOpenAI {
					openAIModels[modelName] = true
				}
				if contributesMetadata {
					setModelProtocol(modelName, channel.Protocol, false)
					setModelCapabilities(modelName, channel.Capabilities)
				}
			}
			continue
		}
		appendEndpointModels := func(endpointID string, models []string) {
			endpointID = strings.TrimSpace(endpointID)
			if endpointID == "" {
				return
			}
			normalizedModels := uniqueModelNames(models)
			endpointModels[endpointID] = uniqueModelNames(append(endpointModels[endpointID], normalizedModels...))
			if !contributesMetadata {
				return
			}
			for _, modelName := range normalizedModels {
				setModelProtocol(modelName, modelProtocolVolcengineArk, true)
				setModelCapabilities(modelName, channel.Capabilities)
			}
		}
		appendEndpointModels(channel.EndpointID, channel.Models)
		for _, item := range channel.EndpointMappings {
			appendEndpointModels(item.EndpointID, []string{item.Model})
		}
	}
	resolveModels := func(modelName string) []string {
		modelName = strings.TrimSpace(modelName)
		if strings.HasPrefix(strings.ToLower(modelName), "ep-") {
			return endpointModels[modelName]
		}
		if openAIModels[modelName] {
			return []string{modelName}
		}
		if normalized := normalizeVisibleArkModelName(modelName); normalized != "" {
			return []string{normalized}
		}
		if modelName == "" {
			return nil
		}
		return []string{modelName}
	}
	nextModels := []string{}
	for _, item := range public.AvailableModels {
		nextModels = append(nextModels, resolveModels(item)...)
	}
	public.AvailableModels = uniqueModelNames(nextModels)
	nextCosts := []model.ModelCost{}
	seenCosts := map[string]bool{}
	for _, item := range public.ModelCosts {
		for _, modelName := range resolveModels(item.Model) {
			if seenCosts[modelName] {
				continue
			}
			seenCosts[modelName] = true
			nextCosts = append(nextCosts, model.ModelCost{Model: modelName, Credits: item.Credits})
		}
	}
	public.ModelCosts = nextCosts
	nextTextEndpoints := []model.ModelTextEndpointType{}
	seenTextEndpoints := map[string]bool{}
	for _, item := range public.ModelTextEndpoints {
		for _, modelName := range resolveModels(item.Model) {
			if seenTextEndpoints[modelName] {
				continue
			}
			seenTextEndpoints[modelName] = true
			nextTextEndpoints = append(nextTextEndpoints, model.ModelTextEndpointType{Model: modelName, EndpointType: normalizeTextEndpointType(item.EndpointType, modelName)})
		}
	}
	public.ModelTextEndpoints = normalizeModelTextEndpoints(nextTextEndpoints, modelNamesWithCapability(public.AvailableModels, modelCapabilities, "text"))
	if models := resolveModels(public.DefaultVideoModel); len(models) > 0 {
		public.DefaultVideoModel = models[0]
	}
	public.ModelProtocols = normalizePublicModelProtocols(modelProtocols, public)
	public.ModelCapabilities = normalizePublicModelCapabilities(modelCapabilities, public)
	public.ModelSources = normalizePublicModelSources(channels, public)
	return public
}

func normalizePublicModelProtocols(modelProtocols map[string]string, public model.PublicModelChannelSetting) []model.ModelProtocolType {
	models := uniqueModelNames(append([]string{}, public.AvailableModels...))
	models = uniqueModelNames(append(models, public.DefaultImageModel, public.DefaultVideoModel, public.DefaultTextModel))
	result := make([]model.ModelProtocolType, 0, len(models))
	for _, modelName := range models {
		rawProtocol, ok := modelProtocols[modelName]
		if !ok {
			continue
		}
		protocol := normalizeModelProtocol(rawProtocol)
		if protocol == "" {
			continue
		}
		result = append(result, model.ModelProtocolType{Model: modelName, Protocol: protocol})
	}
	return result
}

func normalizePublicModelCapabilities(modelCapabilities map[string][]string, public model.PublicModelChannelSetting) []model.ModelCapabilityType {
	models := uniqueModelNames(append([]string{}, public.AvailableModels...))
	models = uniqueModelNames(append(models, public.DefaultImageModel, public.DefaultVideoModel, public.DefaultTextModel))
	result := make([]model.ModelCapabilityType, 0, len(models))
	for _, modelName := range models {
		rawCapabilities := modelCapabilities[modelName]
		if len(rawCapabilities) == 0 {
			continue
		}
		capabilities := normalizeModelChannelCapabilities(rawCapabilities, "")
		if len(capabilities) == 0 {
			continue
		}
		result = append(result, model.ModelCapabilityType{Model: modelName, Capabilities: capabilities})
	}
	return result
}

func normalizePublicModelSources(channels []model.ModelChannel, public model.PublicModelChannelSetting) []model.ModelSourceType {
	visibleModels := map[string]bool{}
	for _, modelName := range uniqueModelNames(append(append([]string{}, public.AvailableModels...), public.DefaultImageModel, public.DefaultVideoModel, public.DefaultTextModel)) {
		visibleModels[modelName] = true
	}
	result := []model.ModelSourceType{}
	seen := map[string]bool{}
	for _, channel := range channels {
		channel = normalizeModelChannel(channel)
		if !modelChannelContributesPublicMetadata(channel) {
			continue
		}
		channelName := strings.TrimSpace(channel.Name)
		if channelName == "" {
			channelName = channel.ID
		}
		for _, item := range channel.Models {
			modelName := visibleModelNameForSource(channel, item)
			if modelName == "" || !visibleModels[modelName] {
				continue
			}
			key := channel.ID + "\x00" + modelName
			if seen[key] {
				continue
			}
			seen[key] = true
			result = append(result, model.ModelSourceType{
				Model:       modelName,
				ChannelID:   channel.ID,
				ChannelName: channelName,
				Protocol:    normalizeModelProtocol(channel.Protocol),
			})
		}
	}
	return result
}

func modelChannelContributesPublicMetadata(channel model.ModelChannel) bool {
	return channel.Enabled && (IsJimengCLIProtocol(channel.Protocol) || (strings.TrimSpace(channel.BaseURL) != "" && strings.TrimSpace(channel.APIKey) != ""))
}

func visibleModelNameForSource(channel model.ModelChannel, modelName string) string {
	modelName = strings.TrimSpace(modelName)
	if modelName == "" || strings.HasPrefix(strings.ToLower(modelName), "ep-") {
		return ""
	}
	if IsVolcengineArkProtocol(channel.Protocol) {
		return normalizeVisibleArkModelName(modelName)
	}
	return modelName
}

func normalizeModelTextEndpoints(items []model.ModelTextEndpointType, availableModels []string) []model.ModelTextEndpointType {
	availableModels = uniqueModelNames(availableModels)
	available := map[string]bool{}
	for _, item := range availableModels {
		available[item] = true
	}
	result := []model.ModelTextEndpointType{}
	seen := map[string]bool{}
	for _, item := range items {
		modelName := strings.TrimSpace(item.Model)
		if modelName == "" || seen[modelName] || !available[modelName] {
			continue
		}
		seen[modelName] = true
		result = append(result, model.ModelTextEndpointType{Model: modelName, EndpointType: normalizeTextEndpointType(item.EndpointType, modelName)})
	}
	for _, modelName := range availableModels {
		if seen[modelName] {
			continue
		}
		seen[modelName] = true
		result = append(result, model.ModelTextEndpointType{Model: modelName, EndpointType: defaultTextEndpointType(modelName)})
	}
	return result
}

func modelNamesWithCapability(modelNames []string, capabilitiesByModel map[string][]string, capability string) []string {
	capability = strings.TrimSpace(strings.ToLower(capability))
	result := []string{}
	for _, modelName := range uniqueModelNames(modelNames) {
		for _, item := range capabilitiesByModel[modelName] {
			if strings.TrimSpace(strings.ToLower(item)) == capability {
				result = append(result, modelName)
				break
			}
		}
	}
	return result
}

func normalizeTextEndpointType(endpointType string, modelName string) string {
	value := strings.TrimSpace(endpointType)
	if value == textEndpointResponses || value == textEndpointChat {
		return value
	}
	if defaultTextEndpointType(modelName) == textEndpointResponses {
		return textEndpointResponses
	}
	return textEndpointChat
}

func defaultTextEndpointType(modelName string) string {
	name := strings.ToLower(strings.TrimSpace(modelName))
	if strings.Contains(name, "gpt-5.5") {
		return textEndpointResponses
	}
	return textEndpointChat
}

func normalizeVisibleArkModelName(modelName string) string {
	value := strings.TrimSpace(modelName)
	const seedancePrefix = "doubao-seedance-2-0-"
	if strings.HasPrefix(strings.ToLower(value), seedancePrefix) && allDigits(value[len(seedancePrefix):]) {
		return "doubao-seedance-2-0"
	}
	return value
}

func allDigits(value string) bool {
	if value == "" {
		return false
	}
	for _, item := range value {
		if item < '0' || item > '9' {
			return false
		}
	}
	return true
}

func normalizePrivateSetting(setting model.PrivateSetting) model.PrivateSetting {
	if setting.Channels == nil {
		setting.Channels = []model.ModelChannel{}
	}
	setting.PromptSync = normalizePromptSyncSetting(setting.PromptSync)
	setting.VolcengineAsset = normalizeVolcengineAssetSetting(setting.VolcengineAsset)
	seenChannelIDs := map[string]int{}
	for i := range setting.Channels {
		setting.Channels[i] = normalizeModelChannel(setting.Channels[i])
		id := setting.Channels[i].ID
		if seenChannelIDs[id] > 0 {
			setting.Channels[i].ID = fmt.Sprintf("%s-%d", id, seenChannelIDs[id]+1)
		}
		seenChannelIDs[id]++
	}
	return setting
}

func hidePrivateAPIKeys(settings model.Settings) model.Settings {
	for i := range settings.Private.Channels {
		if strings.TrimSpace(settings.Private.Channels[i].APIKey) != "" {
			settings.Private.Channels[i].APIKey = maskedAPIKey
		}
	}
	settings.Private.Auth.LinuxDo.ClientSecret = ""
	settings.Private.VolcengineAsset.AccessKeyConfigured = strings.TrimSpace(settings.Private.VolcengineAsset.AccessKey) != ""
	settings.Private.VolcengineAsset.SecretKeyConfigured = strings.TrimSpace(settings.Private.VolcengineAsset.SecretKey) != ""
	settings.Private.VolcengineAsset.AccessKey = ""
	settings.Private.VolcengineAsset.SecretKey = ""
	return settings
}

func keepPrivateAPIKeys(settings *model.Settings, saved model.Settings) {
	for i := range settings.Private.Channels {
		if apiKey := strings.TrimSpace(settings.Private.Channels[i].APIKey); apiKey != "" && !isMaskedAPIKey(apiKey) {
			continue
		}
		settings.Private.Channels[i].APIKey = ""
		if channel, ok := findSavedChannel(settings.Private.Channels[i], saved.Private.Channels, i); ok {
			settings.Private.Channels[i].APIKey = channel.APIKey
			continue
		}
		settings.Private.Channels[i].APIKey = providerAPIKey(settings.Private.Channels[i], saved.Private.Channels)
	}
}

func providerAPIKey(channel model.ModelChannel, saved []model.ModelChannel) string {
	baseURL := strings.TrimRight(strings.TrimSpace(channel.BaseURL), "/")
	if baseURL == "" {
		return ""
	}
	apiKey := ""
	for _, item := range saved {
		if normalizeModelProtocol(item.Protocol) != normalizeModelProtocol(channel.Protocol) || strings.TrimRight(strings.TrimSpace(item.BaseURL), "/") != baseURL {
			continue
		}
		candidate := strings.TrimSpace(item.APIKey)
		if candidate == "" {
			continue
		}
		if apiKey != "" && apiKey != candidate {
			return ""
		}
		apiKey = candidate
	}
	return apiKey
}

func isMaskedAPIKey(value string) bool {
	return strings.TrimSpace(value) == maskedAPIKey
}

func keepPrivateAuthSecrets(settings *model.Settings, saved model.Settings) {
	if strings.TrimSpace(settings.Private.Auth.LinuxDo.ClientSecret) == "" {
		settings.Private.Auth.LinuxDo.ClientSecret = saved.Private.Auth.LinuxDo.ClientSecret
	}
}

func keepPrivateVolcengineAssetSecrets(settings *model.Settings, saved model.Settings) {
	if strings.TrimSpace(settings.Private.VolcengineAsset.AccessKey) == "" {
		settings.Private.VolcengineAsset.AccessKey = saved.Private.VolcengineAsset.AccessKey
	}
	if strings.TrimSpace(settings.Private.VolcengineAsset.SecretKey) == "" {
		settings.Private.VolcengineAsset.SecretKey = saved.Private.VolcengineAsset.SecretKey
	}
}

func normalizeVolcengineAssetSetting(setting model.VolcengineAssetSetting) model.VolcengineAssetSetting {
	setting.AccessKey = strings.TrimSpace(setting.AccessKey)
	setting.SecretKey = strings.TrimSpace(setting.SecretKey)
	setting.AccessKeyConfigured = setting.AccessKeyConfigured || setting.AccessKey != ""
	setting.SecretKeyConfigured = setting.SecretKeyConfigured || setting.SecretKey != ""
	setting.ProjectName = strings.TrimSpace(setting.ProjectName)
	if setting.ProjectName == "" {
		setting.ProjectName = "default"
	}
	setting.Region = strings.TrimSpace(setting.Region)
	if setting.Region == "" {
		setting.Region = "cn-beijing"
	}
	setting.AssetGroupID = strings.TrimSpace(setting.AssetGroupID)
	setting.PublicAssetBaseURL = strings.TrimRight(strings.TrimSpace(setting.PublicAssetBaseURL), "/")
	return setting
}

func findSavedChannel(channel model.ModelChannel, saved []model.ModelChannel, index int) (model.ModelChannel, bool) {
	for _, item := range saved {
		if item.Name == channel.Name && item.BaseURL == channel.BaseURL {
			return item, true
		}
	}
	if index >= 0 && index < len(saved) {
		return saved[index], true
	}
	return model.ModelChannel{}, false
}

func SelectModelChannel(modelName string) (model.ModelChannel, error) {
	return SelectModelChannelWithOptions(modelName, "", nil, "")
}

func SelectModelChannelWithOptions(modelName string, channelID string, fallbackChannelIDs []string, capability string) (model.ModelChannel, error) {
	settings, err := repository.GetSettings()
	if err != nil {
		return model.ModelChannel{}, err
	}
	privateChannels := normalizePrivateSetting(settings.Private).Channels
	if strings.TrimSpace(channelID) != "" {
		channel, ok := findModelChannelByID(privateChannels, channelID, modelName, capability)
		if ok {
			return channel, nil
		}
		if len(fallbackChannelIDs) == 0 {
			return model.ModelChannel{}, safeMessageError{message: "指定 API 渠道不可用或不支持该模型"}
		}
		for _, fallbackID := range fallbackChannelIDs {
			channel, ok := findModelChannelByID(privateChannels, fallbackID, modelName, capability)
			if ok {
				return channel, nil
			}
		}
		return model.ModelChannel{}, safeMessageError{message: "指定 API 渠道和 fallback 渠道均不可用"}
	}
	channels := modelChannelsForModel(privateChannels, modelName)
	if strings.TrimSpace(capability) != "" {
		filtered := make([]model.ModelChannel, 0, len(channels))
		for _, channel := range channels {
			if modelChannelSupportsCapability(channel, capability) {
				filtered = append(filtered, channel)
			}
		}
		channels = filtered
	}
	if len(channels) == 0 {
		return model.ModelChannel{}, errors.New("没有可用模型渠道")
	}
	total := 0
	for _, channel := range channels {
		total += channel.Weight
	}
	hit := rand.Intn(total)
	for _, channel := range channels {
		hit -= channel.Weight
		if hit < 0 {
			return channel, nil
		}
	}
	return channels[0], nil
}

func BuildModelChannelURL(channel model.ModelChannel, path string) string {
	baseURL := strings.TrimRight(channel.BaseURL, "/")
	if normalizeModelProtocol(channel.Protocol) == modelProtocolOpenAI && !strings.HasSuffix(baseURL, "/v1") {
		baseURL += "/v1"
	}
	return baseURL + path
}

func normalizeModelChannel(channel model.ModelChannel) model.ModelChannel {
	channel.Protocol = normalizeModelProtocol(channel.Protocol)
	channel.ID = strings.TrimSpace(channel.ID)
	if channel.ID == "" {
		channel.ID = stableModelChannelID(channel)
	}
	channel.EndpointID = strings.TrimSpace(channel.EndpointID)
	channel.CLIPath = strings.TrimSpace(channel.CLIPath)
	channel.WorkDir = strings.TrimSpace(channel.WorkDir)
	channel.OutputDir = strings.TrimSpace(channel.OutputDir)
	if channel.TimeoutSeconds < 0 {
		channel.TimeoutSeconds = 0
	}
	if channel.SessionID < 0 {
		channel.SessionID = 0
	}
	if channel.ConcurrencyLimit < 0 {
		channel.ConcurrencyLimit = 0
	}
	if channel.Models == nil {
		channel.Models = []string{}
	}
	models := make([]string, 0, len(channel.Models))
	legacyEndpointID := ""
	for _, item := range channel.Models {
		modelName := strings.TrimSpace(item)
		if modelName == "" {
			continue
		}
		if strings.HasPrefix(strings.ToLower(modelName), "ep-") {
			if legacyEndpointID == "" {
				legacyEndpointID = modelName
			}
			continue
		}
		models = append(models, modelName)
	}
	if channel.EndpointID == "" {
		channel.EndpointID = legacyEndpointID
	}
	if IsVolcengineArkProtocol(channel.Protocol) {
		channel.EndpointMappings = normalizeEndpointMappings(channel.EndpointMappings, models, channel.EndpointID)
		if len(channel.EndpointMappings) > 0 {
			models = make([]string, 0, len(channel.EndpointMappings))
			for _, item := range channel.EndpointMappings {
				models = append(models, item.Model)
			}
			if channel.EndpointID == "" {
				channel.EndpointID = channel.EndpointMappings[0].EndpointID
			}
		}
	} else {
		channel.EndpointID = ""
		channel.EndpointMappings = []model.ModelEndpointMapping{}
	}
	channel.Models = uniqueModelNames(models)
	channel.Capabilities = normalizeModelChannelCapabilities(channel.Capabilities, channel.Protocol)
	channel.Environment = normalizeModelChannelEnvironment(channel.Environment)
	if channel.Weight <= 0 {
		channel.Weight = 1
	}
	return channel
}

func stableModelChannelID(channel model.ModelChannel) string {
	source := strings.ToLower(strings.TrimSpace(channel.Name))
	if source == "" {
		source = normalizeModelProtocol(channel.Protocol) + "-" + strings.TrimSpace(channel.BaseURL)
	}
	var builder strings.Builder
	previousDash := false
	for _, r := range source {
		allowed := (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')
		if allowed {
			builder.WriteRune(r)
			previousDash = false
			continue
		}
		if !previousDash {
			builder.WriteByte('-')
			previousDash = true
		}
	}
	id := strings.Trim(builder.String(), "-")
	if id == "" {
		id = "model-channel"
	}
	return id
}

func normalizeModelChannelCapabilities(capabilities []string, protocol string) []string {
	if len(capabilities) == 0 {
		if IsVolcengineArkProtocol(protocol) {
			return []string{"text", "video"}
		}
		if IsJimengCLIProtocol(protocol) {
			return []string{"video", "video_query", "preflight", "cli_workflow"}
		}
		if IsXinglianCloudProtocol(protocol) {
			return []string{"video", "video_query", "preflight"}
		}
		return []string{"text", "image"}
	}
	allowed := map[string]bool{"text": true, "image": true, "video": true, "video_query": true, "asset_review": true, "preflight": true, "cli": true, "cli_workflow": true}
	seen := map[string]bool{}
	result := []string{}
	for _, item := range capabilities {
		value := strings.TrimSpace(strings.ToLower(item))
		if value == "" || !allowed[value] || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	if len(result) == 0 {
		return normalizeModelChannelCapabilities(nil, protocol)
	}
	return result
}

func normalizeModelChannelEnvironment(environment string) string {
	switch strings.TrimSpace(strings.ToLower(environment)) {
	case "dev", "test", "prod":
		return strings.TrimSpace(strings.ToLower(environment))
	default:
		return "dev"
	}
}

func normalizeEndpointMappings(mappings []model.ModelEndpointMapping, fallbackModels []string, fallbackEndpointID string) []model.ModelEndpointMapping {
	result := make([]model.ModelEndpointMapping, 0, len(mappings))
	seen := map[string]bool{}
	appendMapping := func(modelName string, endpointID string) {
		modelName = strings.TrimSpace(modelName)
		endpointID = strings.TrimSpace(endpointID)
		if modelName == "" || endpointID == "" || seen[modelName] {
			return
		}
		seen[modelName] = true
		result = append(result, model.ModelEndpointMapping{Model: modelName, EndpointID: endpointID})
	}
	for _, item := range mappings {
		appendMapping(item.Model, item.EndpointID)
	}
	if len(result) == 0 && strings.TrimSpace(fallbackEndpointID) != "" {
		for _, item := range fallbackModels {
			appendMapping(item, fallbackEndpointID)
		}
	}
	return result
}

func uniqueModelNames(models []string) []string {
	result := []string{}
	seen := map[string]bool{}
	for _, item := range models {
		modelName := strings.TrimSpace(item)
		if modelName == "" || seen[modelName] {
			continue
		}
		seen[modelName] = true
		result = append(result, modelName)
	}
	return result
}

func ModelChannelEndpointForModel(channel model.ModelChannel, modelName string) string {
	channel = normalizeModelChannel(channel)
	for _, item := range channel.EndpointMappings {
		if strings.TrimSpace(item.Model) == strings.TrimSpace(modelName) {
			return strings.TrimSpace(item.EndpointID)
		}
	}
	return strings.TrimSpace(channel.EndpointID)
}

func IsVolcengineArkProtocol(protocol string) bool {
	return normalizeModelProtocol(protocol) == modelProtocolVolcengineArk
}

func IsJimengCLIProtocol(protocol string) bool {
	return normalizeModelProtocol(protocol) == modelProtocolJimengCLI
}

func IsXinglianCloudProtocol(protocol string) bool {
	return normalizeModelProtocol(protocol) == modelProtocolXinglianCloud
}

func normalizeModelProtocol(protocol string) string {
	switch strings.TrimSpace(protocol) {
	case "", modelProtocolOpenAI:
		return modelProtocolOpenAI
	case modelProtocolVolcengineArk:
		return modelProtocolVolcengineArk
	case modelProtocolJimengCLI:
		return modelProtocolJimengCLI
	case modelProtocolXinglianCloud:
		return modelProtocolXinglianCloud
	default:
		return modelProtocolOpenAI
	}
}

func resolveAdminChannel(index *int, channel model.ModelChannel) (model.ModelChannel, error) {
	resolved := normalizeModelChannel(channel)
	if isMaskedAPIKey(resolved.APIKey) {
		resolved.APIKey = ""
	}
	if strings.TrimSpace(resolved.APIKey) == "" {
		settings, err := repository.GetSettings()
		if err != nil {
			return model.ModelChannel{}, err
		}
		saved := normalizePrivateSetting(settings.Private).Channels
		if index != nil && *index >= 0 && *index < len(saved) {
			if resolved.APIKey == "" {
				resolved.APIKey = saved[*index].APIKey
			}
			if resolved.BaseURL == "" {
				resolved.BaseURL = saved[*index].BaseURL
			}
			if resolved.CLIPath == "" {
				resolved.CLIPath = saved[*index].CLIPath
			}
			if resolved.WorkDir == "" {
				resolved.WorkDir = saved[*index].WorkDir
			}
			if resolved.OutputDir == "" {
				resolved.OutputDir = saved[*index].OutputDir
			}
			if resolved.Name == "" {
				resolved.Name = saved[*index].Name
			}
		}
		if resolved.APIKey == "" {
			if savedChannel, ok := findSavedChannel(resolved, saved, -1); ok {
				resolved.APIKey = savedChannel.APIKey
			}
		}
	}
	if IsJimengCLIProtocol(resolved.Protocol) {
		return resolved, nil
	}
	if strings.TrimSpace(resolved.BaseURL) == "" {
		return model.ModelChannel{}, safeMessageError{message: "缺少接口地址"}
	}
	if strings.TrimSpace(resolved.APIKey) == "" {
		return model.ModelChannel{}, safeMessageError{message: "缺少 API Key"}
	}
	return resolved, nil
}

func fetchAdminChannelModels(channel model.ModelChannel) ([]string, error) {
	if IsJimengCLIProtocol(channel.Protocol) {
		return SupportedJimengModelVersions(), nil
	}
	request, err := http.NewRequest(http.MethodGet, BuildModelChannelURL(channel, "/models"), nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
	response, err := DoAIHTTPRequest(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode >= http.StatusBadRequest {
		return nil, readAdminChannelError(body, response.StatusCode, "读取模型失败")
	}
	var payload struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	_ = json.Unmarshal(body, &payload)
	result := make([]string, 0, len(payload.Data))
	for _, item := range payload.Data {
		if strings.TrimSpace(item.ID) != "" {
			result = append(result, item.ID)
		}
	}
	sort.Strings(result)
	return result, nil
}

func testAdminChannelModel(channel model.ModelChannel, modelName string) (string, error) {
	if strings.TrimSpace(modelName) == "" {
		return "", errors.New("缺少模型名称")
	}
	if IsVolcengineArkProtocol(channel.Protocol) {
		endpointID := ModelChannelEndpointForModel(channel, modelName)
		result := modelChannelPreflightResult(channel, modelName)
		if endpointID == "" {
			return "", safeMessageError{message: decoratePreflightChannelMessage("缺少火山 Endpoint / EP", result)}
		}
		if err := testArkChannelAuth(channel); err != nil {
			if safe, ok := err.(interface{ SafeMessage() string }); ok {
				return "", safeMessageError{message: decoratePreflightChannelMessage(safe.SafeMessage(), result)}
			}
			return "", safeMessageError{message: decoratePreflightChannelMessage("企业 API 预检请求失败，请检查 Base URL 是否可访问", result)}
		}
		return fmt.Sprintf("企业 API 鉴权通过；本地模型 %s 将使用火山 EP %s，EP 实际绑定模型以火山后台为准", modelName, endpointID), nil
	}
	if IsJimengCLIProtocol(channel.Protocol) {
		result, err := PreflightJimengCLIInstallation(channel, modelName)
		if err != nil {
			return "", err
		}
		if result.Version != "" {
			return fmt.Sprintf("即梦 CLI 可用；模型 %s 可用；CLI 版本 %s。用户需在个人配置中自行完成网页登录", modelName, result.Version), nil
		}
		return fmt.Sprintf("即梦 CLI 可用；模型 %s 可用。用户需在个人配置中自行完成网页登录", modelName), nil
	}
	if IsXinglianCloudProtocol(channel.Protocol) {
		if err := PreflightXinglianChannel(channel, modelName); err != nil {
			return "", err
		}
		return fmt.Sprintf("星链云余额预检通过；模型 %s 可用", modelName), nil
	}
	body, _ := json.Marshal(map[string]any{
		"model": modelName,
		"messages": []map[string]string{{
			"role":    "user",
			"content": "hi",
		}},
	})
	request, err := http.NewRequest(http.MethodPost, BuildModelChannelURL(channel, "/chat/completions"), strings.NewReader(string(body)))
	if err != nil {
		return "", err
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
	request.Header.Set("Content-Type", "application/json")
	response, err := DoAIHTTPRequest(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	responseBody, _ := io.ReadAll(response.Body)
	if response.StatusCode >= http.StatusBadRequest {
		return "", readAdminChannelError(responseBody, response.StatusCode, "测试失败")
	}
	var payload struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	_ = json.Unmarshal(responseBody, &payload)
	if len(payload.Choices) > 0 && strings.TrimSpace(payload.Choices[0].Message.Content) != "" {
		return payload.Choices[0].Message.Content, nil
	}
	return "ok", nil
}

func testArkChannelAuth(channel model.ModelChannel) error {
	request, err := http.NewRequest(http.MethodGet, strings.TrimRight(channel.BaseURL, "/")+"/contents/generations/tasks/__infinite_canvas_probe__", nil)
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
	response, err := DoAIHTTPRequest(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode == http.StatusUnauthorized || response.StatusCode == http.StatusForbidden {
		return readAdminChannelError(body, response.StatusCode, "企业 API 鉴权失败")
	}
	return nil
}

func readAdminChannelError(body []byte, statusCode int, fallback string) error {
	var payload struct {
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
		Message string `json:"message"`
		Msg     string `json:"msg"`
	}
	if len(body) > 0 && json.Unmarshal(body, &payload) == nil {
		if payload.Error != nil && strings.TrimSpace(payload.Error.Message) != "" {
			return safeMessageError{message: payload.Error.Message}
		}
		if strings.TrimSpace(payload.Message) != "" {
			return safeMessageError{message: payload.Message}
		}
		if strings.TrimSpace(payload.Msg) != "" {
			return safeMessageError{message: payload.Msg}
		}
	}
	if statusCode == http.StatusUnauthorized {
		return safeMessageError{message: "上游接口认证失败（401），请检查 API Key"}
	}
	if statusCode > 0 {
		return safeMessageError{message: fmt.Sprintf("%s：%d", fallback, statusCode)}
	}
	return safeMessageError{message: fallback}
}

type safeMessageError struct {
	message string
}

func (err safeMessageError) Error() string {
	return err.message
}

func (err safeMessageError) SafeMessage() string {
	return err.message
}

func modelChannelsForModel(channels []model.ModelChannel, modelName string) []model.ModelChannel {
	result := []model.ModelChannel{}
	modelName = strings.TrimSpace(modelName)
	for _, channel := range channels {
		channel = normalizeModelChannel(channel)
		if !channel.Enabled {
			continue
		}
		if !IsJimengCLIProtocol(channel.Protocol) && (channel.BaseURL == "" || channel.APIKey == "") {
			continue
		}
		if modelMatchesArkEndpoint(channel, modelName) {
			result = append(result, channel)
			continue
		}
		for _, item := range channel.Models {
			if strings.TrimSpace(item) == modelName {
				result = append(result, channel)
				break
			}
		}
	}
	return result
}

func findModelChannelByID(channels []model.ModelChannel, channelID string, modelName string, capability string) (model.ModelChannel, bool) {
	channelID = strings.TrimSpace(channelID)
	for _, channel := range channels {
		channel = normalizeModelChannel(channel)
		if channel.ID != channelID || !channel.Enabled {
			continue
		}
		if !IsJimengCLIProtocol(channel.Protocol) && (channel.BaseURL == "" || channel.APIKey == "") {
			continue
		}
		if strings.TrimSpace(capability) != "" && !modelChannelSupportsCapability(channel, capability) {
			continue
		}
		if modelChannelSupportsModel(channel, modelName) {
			return channel, true
		}
	}
	return model.ModelChannel{}, false
}

func modelChannelSupportsCapability(channel model.ModelChannel, capability string) bool {
	capability = strings.TrimSpace(strings.ToLower(capability))
	if capability == "" {
		return true
	}
	channel = normalizeModelChannel(channel)
	for _, item := range channel.Capabilities {
		if strings.TrimSpace(strings.ToLower(item)) == capability {
			return true
		}
	}
	return false
}

func modelChannelSupportsModel(channel model.ModelChannel, modelName string) bool {
	modelName = strings.TrimSpace(modelName)
	if modelName == "" {
		return false
	}
	if modelMatchesArkEndpoint(channel, modelName) {
		return true
	}
	for _, item := range channel.Models {
		if strings.TrimSpace(item) == modelName {
			return true
		}
	}
	return false
}

func modelMatchesArkEndpoint(channel model.ModelChannel, modelName string) bool {
	if !IsVolcengineArkProtocol(channel.Protocol) {
		return false
	}
	modelName = strings.TrimSpace(modelName)
	if modelName == "" {
		return false
	}
	if strings.TrimSpace(channel.EndpointID) == modelName {
		return true
	}
	for _, item := range channel.EndpointMappings {
		if strings.TrimSpace(item.EndpointID) == modelName {
			return true
		}
	}
	return false
}
