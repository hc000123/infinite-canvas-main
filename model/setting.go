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
	ModelProtocolJimengCLI     ModelProtocol = "jimeng-cli"
	ModelProtocolXinglianCloud ModelProtocol = "xinglian-cloud"
	ModelProtocolMiniMax       ModelProtocol = "minimax"
)

// ModelChannel 模型渠道配置。
type ModelChannel struct {
	ID               string                 `json:"id"`
	Protocol         string                 `json:"protocol"`
	Name             string                 `json:"name"`
	BaseURL          string                 `json:"baseUrl"`
	APIKey           string                 `json:"apiKey"`
	CLIPath          string                 `json:"cliPath"`
	WorkDir          string                 `json:"workDir"`
	OutputDir        string                 `json:"outputDir"`
	TimeoutSeconds   int                    `json:"timeoutSeconds"`
	SessionID        int                    `json:"sessionId"`
	ConcurrencyLimit int                    `json:"concurrencyLimit"`
	EndpointID       string                 `json:"endpointId"`
	EndpointMappings []ModelEndpointMapping `json:"endpointMappings"`
	Models           []string               `json:"models"`
	Capabilities     []string               `json:"capabilities"`
	Environment      string                 `json:"environment"`
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

type ModelTextEndpointType struct {
	Model        string `json:"model"`
	EndpointType string `json:"endpointType"`
}

type ModelProtocolType struct {
	Model    string `json:"model"`
	Protocol string `json:"protocol"`
}

type ModelCapabilityType struct {
	Model        string   `json:"model"`
	Capabilities []string `json:"capabilities"`
}

type ModelSourceType struct {
	Model       string `json:"model"`
	ChannelID   string `json:"channelId"`
	ChannelName string `json:"channelName"`
	Protocol    string `json:"protocol"`
}

// PublicModelChannelSetting 公开模型渠道配置。
type PublicModelChannelSetting struct {
	AvailableModels    []string                `json:"availableModels"`
	ModelCosts         []ModelCost             `json:"modelCosts"`
	ModelTextEndpoints []ModelTextEndpointType `json:"modelTextEndpoints"`
	ModelProtocols     []ModelProtocolType     `json:"modelProtocols"`
	ModelCapabilities  []ModelCapabilityType   `json:"modelCapabilities"`
	ModelSources       []ModelSourceType       `json:"modelSources"`
	DefaultModel       string                  `json:"defaultModel"`
	DefaultImageModel  string                  `json:"defaultImageModel"`
	DefaultVideoModel  string                  `json:"defaultVideoModel"`
	DefaultTextModel   string                  `json:"defaultTextModel"`
	SystemPrompt       string                  `json:"systemPrompt"`
	AllowCustomChannel *bool                   `json:"allowCustomChannel"`
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

type ImageUpscaleSetting struct {
	Managed                   bool   `json:"managed"`
	Enabled                   bool   `json:"enabled"`
	Provider                  string `json:"provider"`
	AccessKeyID               string `json:"accessKeyId"`
	AccessKeySecret           string `json:"accessKeySecret"`
	SecurityToken             string `json:"securityToken"`
	AccessKeyIDConfigured     bool   `json:"accessKeyIdConfigured"`
	AccessKeySecretConfigured bool   `json:"accessKeySecretConfigured"`
	SecurityTokenConfigured   bool   `json:"securityTokenConfigured"`
}

type VideoUpscaleSetting struct {
	Enabled              bool   `json:"enabled"`
	SubtitleEraseEnabled bool   `json:"subtitleEraseEnabled"`
	Provider             string `json:"provider"`
	APIKey               string `json:"apiKey"`
	APIKeyConfigured     bool   `json:"apiKeyConfigured"`
	OutputTOSPath        string `json:"outputTosPath"`
	OutputQualityMode    string `json:"outputQualityMode"`
	PreserveAudio        bool   `json:"preserveAudio"`
	MaxTarget            string `json:"maxTarget"`
}

// PrivateSetting 私有配置。
type PrivateSetting struct {
	Channels        []ModelChannel         `json:"channels"`
	PromptSync      PromptSyncSetting      `json:"promptSync"`
	Auth            PrivateAuthSetting     `json:"auth"`
	VolcengineAsset VolcengineAssetSetting `json:"volcengineAsset"`
	ImageUpscale    ImageUpscaleSetting    `json:"imageUpscale"`
	VideoUpscale    VideoUpscaleSetting    `json:"videoUpscale"`
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
