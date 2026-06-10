package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"sort"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

const (
	modelProtocolOpenAI        = string(model.ModelProtocolOpenAI)
	modelProtocolVolcengineArk = string(model.ModelProtocolVolcengineArk)
	maskedAPIKey               = "********"
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
	for i := range setting.ModelChannel.ModelCosts {
		setting.ModelChannel.ModelCosts[i].Model = strings.TrimSpace(setting.ModelChannel.ModelCosts[i].Model)
		if setting.ModelChannel.ModelCosts[i].Credits < 0 {
			setting.ModelChannel.ModelCosts[i].Credits = 0
		}
	}
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
	endpointModels := map[string][]string{}
	for _, channel := range channels {
		channel = normalizeModelChannel(channel)
		if !IsVolcengineArkProtocol(channel.Protocol) {
			continue
		}
		appendEndpointModels := func(endpointID string, models []string) {
			endpointID = strings.TrimSpace(endpointID)
			if endpointID == "" {
				return
			}
			endpointModels[endpointID] = uniqueModelNames(append(endpointModels[endpointID], models...))
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
	if models := resolveModels(public.DefaultVideoModel); len(models) > 0 {
		public.DefaultVideoModel = models[0]
	}
	return public
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
	for i := range setting.Channels {
		setting.Channels[i] = normalizeModelChannel(setting.Channels[i])
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
		if channel, ok := findSavedChannel(settings.Private.Channels[i], saved.Private.Channels, i); ok {
			settings.Private.Channels[i].APIKey = channel.APIKey
		}
	}
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
	if index < len(saved) {
		return saved[index], true
	}
	return model.ModelChannel{}, false
}

func SelectModelChannel(modelName string) (model.ModelChannel, error) {
	settings, err := repository.GetSettings()
	if err != nil {
		return model.ModelChannel{}, err
	}
	channels := modelChannelsForModel(normalizePrivateSetting(settings.Private).Channels, modelName)
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
	channel.EndpointID = strings.TrimSpace(channel.EndpointID)
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
	if channel.Weight <= 0 {
		channel.Weight = 1
	}
	return channel
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

func normalizeModelProtocol(protocol string) string {
	switch strings.TrimSpace(protocol) {
	case "", modelProtocolOpenAI:
		return modelProtocolOpenAI
	case modelProtocolVolcengineArk:
		return modelProtocolVolcengineArk
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
	if strings.TrimSpace(resolved.BaseURL) == "" {
		return model.ModelChannel{}, safeMessageError{message: "缺少接口地址"}
	}
	if strings.TrimSpace(resolved.APIKey) == "" {
		return model.ModelChannel{}, safeMessageError{message: "缺少 API Key"}
	}
	return resolved, nil
}

func fetchAdminChannelModels(channel model.ModelChannel) ([]string, error) {
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
		if endpointID == "" {
			return "", errors.New("缺少火山 Endpoint / EP")
		}
		return fmt.Sprintf("本地模型 %s 将使用火山 EP %s；EP 实际绑定模型以火山后台为准", modelName, endpointID), nil
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
		if !channel.Enabled || channel.BaseURL == "" || channel.APIKey == "" {
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
