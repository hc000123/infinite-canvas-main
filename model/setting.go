package model

import "encoding/json"

type SettingKey string

const (
	SettingKeyPublic  SettingKey = "public"
	SettingKeyPrivate SettingKey = "private"
)

type ModelProtocol string

const (
	ModelProtocolOpenAI        ModelProtocol = "openai"
	ModelProtocolVolcengineArk ModelProtocol = "volcengine-ark"
)

// ModelChannel 模型渠道配置。
type ModelChannel struct {
	Protocol         string                 `json:"protocol"`
	Name             string                 `json:"name"`
	BaseURL          string                 `json:"baseUrl"`
	APIKey           string                 `json:"apiKey"`
	EndpointID       string                 `json:"endpointId"`
	EndpointMappings []ModelEndpointMapping `json:"endpointMappings"`
	Models           []string               `json:"models"`
	Weight           int                    `json:"weight"`
	Enabled          bool                   `json:"enabled"`
	Remark           string                 `json:"remark"`
}

type ModelEndpointMapping struct {
	Model      string `json:"model"`
	EndpointID string `json:"endpointId"`
}

// ModelCost 模型算力点配置。
type ModelCost struct {
	Model   string `json:"model"`
	Credits int    `json:"credits"`
}

// PublicModelChannelSetting 公开模型渠道配置。
type PublicModelChannelSetting struct {
	AvailableModels    []string    `json:"availableModels"`
	ModelCosts         []ModelCost `json:"modelCosts"`
	DefaultModel       string      `json:"defaultModel"`
	DefaultImageModel  string      `json:"defaultImageModel"`
	DefaultVideoModel  string      `json:"defaultVideoModel"`
	DefaultTextModel   string      `json:"defaultTextModel"`
	SystemPrompt       string      `json:"systemPrompt"`
	AllowCustomChannel *bool       `json:"allowCustomChannel"`
}

// PublicSetting 公开配置。
type PublicSetting struct {
	ModelChannel    PublicModelChannelSetting    `json:"modelChannel"`
	Auth            PublicAuthSetting            `json:"auth"`
	VolcengineAsset PublicVolcengineAssetSetting `json:"volcengineAsset"`
}

type PublicAuthSetting struct {
	AllowRegister *bool                    `json:"allowRegister"`
	LinuxDo       PublicLinuxDoAuthSetting `json:"linuxDo"`
}

type PublicLinuxDoAuthSetting struct {
	Enabled bool `json:"enabled"`
}

type PublicVolcengineAssetSetting struct {
	Enabled bool `json:"enabled"`
}

type VolcengineAssetSetting struct {
	Enabled             bool   `json:"enabled"`
	AccessKey           string `json:"accessKey"`
	SecretKey           string `json:"secretKey"`
	AccessKeyConfigured bool   `json:"accessKeyConfigured"`
	SecretKeyConfigured bool   `json:"secretKeyConfigured"`
	ProjectName         string `json:"projectName"`
	Region              string `json:"region"`
	AssetGroupID        string `json:"assetGroupId"`
	PublicAssetBaseURL  string `json:"publicAssetBaseUrl"`
}

// PrivateSetting 私有配置。
type PrivateSetting struct {
	Channels        []ModelChannel         `json:"channels"`
	PromptSync      PromptSyncSetting      `json:"promptSync"`
	Auth            PrivateAuthSetting     `json:"auth"`
	VolcengineAsset VolcengineAssetSetting `json:"volcengineAsset"`
}

// PromptSyncSetting 提示词定时同步配置。
type PromptSyncSetting struct {
	Enabled *bool  `json:"enabled"`
	Cron    string `json:"cron"`
}

type PrivateAuthSetting struct {
	LinuxDo PrivateLinuxDoAuthSetting `json:"linuxDo"`
}

type PrivateLinuxDoAuthSetting struct {
	ClientID     string `json:"clientId"`
	ClientSecret string `json:"clientSecret"`
}

// Setting 系统配置。
type Setting struct {
	Key       SettingKey      `json:"key" gorm:"primaryKey"`
	Value     json.RawMessage `json:"value" gorm:"serializer:json"`
	CreatedAt string          `json:"createdAt"`
	UpdatedAt string          `json:"updatedAt"`
}

// Settings 系统公开和私有配置。
type Settings struct {
	Public  PublicSetting  `json:"public"`
	Private PrivateSetting `json:"private"`
}
