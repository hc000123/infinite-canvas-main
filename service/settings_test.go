package service

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestFindSavedChannelIgnoresNegativeIndex(t *testing.T) {
	_, ok := findSavedChannel(model.ModelChannel{Name: "draft", BaseURL: "https://draft.example.com"}, []model.ModelChannel{{
		Name:    "saved",
		BaseURL: "https://saved.example.com",
	}}, -1)
	if ok {
		t.Fatalf("findSavedChannel returned a saved channel for negative index")
	}
}

func TestAdminSettingsMasksSavedChannelAPIKey(t *testing.T) {
	setupAITaskTestDB(t)
	saveSettingsForBoundaryTest(t, true, "sk-real-admin")

	settings, err := AdminSettings()
	if err != nil {
		t.Fatalf("AdminSettings returned error: %v", err)
	}
	if settings.Private.Channels[0].APIKey != maskedAPIKey {
		t.Fatalf("api key mask = %q, want %q", settings.Private.Channels[0].APIKey, maskedAPIKey)
	}
	if strings.Contains(settings.Private.Channels[0].APIKey, "sk-real-admin") {
		t.Fatalf("admin settings leaked api key: %q", settings.Private.Channels[0].APIKey)
	}
}

func TestSaveSettingsKeepsSavedChannelAPIKeyWhenMaskSubmitted(t *testing.T) {
	setupAITaskTestDB(t)
	saveSettingsForBoundaryTest(t, false, "sk-real-save")

	settings, err := AdminSettings()
	if err != nil {
		t.Fatalf("AdminSettings returned error: %v", err)
	}
	settings.Private.Channels[0].Remark = "updated"
	if _, err := SaveSettings(settings); err != nil {
		t.Fatalf("SaveSettings returned error: %v", err)
	}

	saved, err := repository.GetSettings()
	if err != nil {
		t.Fatalf("GetSettings returned error: %v", err)
	}
	if saved.Private.Channels[0].APIKey != "sk-real-save" {
		t.Fatalf("saved api key = %q, want original", saved.Private.Channels[0].APIKey)
	}
	if saved.Private.Channels[0].Remark != "updated" {
		t.Fatalf("remark = %q, want updated", saved.Private.Channels[0].Remark)
	}
}

func TestSaveSettingsKeepsTextEndpointsOnlyForPublishedTextModels(t *testing.T) {
	setupAITaskTestDB(t)
	settings, err := SaveSettings(model.Settings{
		Public: model.PublicSetting{ModelChannel: model.PublicModelChannelSetting{
			AvailableModels: []string{"custom-text", "custom-image", "custom-video"},
			ModelTextEndpoints: []model.ModelTextEndpointType{{
				Model:        "custom-text",
				EndpointType: textEndpointResponses,
			}},
		}},
		Private: model.PrivateSetting{Channels: []model.ModelChannel{
			{ID: "text", Protocol: string(model.ModelProtocolOpenAI), Name: "Text", BaseURL: "https://text.example.com", APIKey: "sk-text", Models: []string{"custom-text"}, Capabilities: []string{"text"}, Enabled: true},
			{ID: "image", Protocol: string(model.ModelProtocolOpenAI), Name: "Image", BaseURL: "https://image.example.com", APIKey: "sk-image", Models: []string{"custom-image"}, Capabilities: []string{"image"}, Enabled: true},
			{ID: "video", Protocol: string(model.ModelProtocolOpenAI), Name: "Video", BaseURL: "https://video.example.com", APIKey: "sk-video", Models: []string{"custom-video"}, Capabilities: []string{"video"}, Enabled: true},
		}},
	})
	if err != nil {
		t.Fatalf("SaveSettings returned error: %v", err)
	}

	want := []model.ModelTextEndpointType{{Model: "custom-text", EndpointType: textEndpointResponses}}
	if !reflect.DeepEqual(settings.Public.ModelChannel.ModelTextEndpoints, want) {
		t.Fatalf("model text endpoints = %#v, want %#v", settings.Public.ModelChannel.ModelTextEndpoints, want)
	}
}

func TestSaveSettingsClearsTextEndpointsWhenNoPublishedTextModel(t *testing.T) {
	setupAITaskTestDB(t)
	settings, err := SaveSettings(model.Settings{
		Public: model.PublicSetting{ModelChannel: model.PublicModelChannelSetting{
			AvailableModels: []string{"custom-image", "custom-video"},
			ModelTextEndpoints: []model.ModelTextEndpointType{{
				Model:        "legacy-text",
				EndpointType: textEndpointResponses,
			}},
		}},
		Private: model.PrivateSetting{Channels: []model.ModelChannel{
			{ID: "image", Protocol: string(model.ModelProtocolOpenAI), Name: "Image", BaseURL: "https://image.example.com", APIKey: "sk-image", Models: []string{"custom-image"}, Capabilities: []string{"image"}, Enabled: true},
			{ID: "video", Protocol: string(model.ModelProtocolOpenAI), Name: "Video", BaseURL: "https://video.example.com", APIKey: "sk-video", Models: []string{"custom-video"}, Capabilities: []string{"video"}, Enabled: true},
		}},
	})
	if err != nil {
		t.Fatalf("SaveSettings returned error: %v", err)
	}
	if len(settings.Public.ModelChannel.ModelTextEndpoints) != 0 {
		t.Fatalf("model text endpoints = %#v, want empty", settings.Public.ModelChannel.ModelTextEndpoints)
	}
}

func TestKeepPrivateAPIKeysSharesOneUnambiguousProviderCredential(t *testing.T) {
	input := model.Settings{Private: model.PrivateSetting{Channels: []model.ModelChannel{
		{ID: "comfly", Name: "中转 comfly", Protocol: "openai", BaseURL: "https://ai.comfly.org", APIKey: maskedAPIKey},
		{ID: "comfly-text", Name: "Comfly 文本", Protocol: "openai", BaseURL: "https://ai.comfly.org", APIKey: maskedAPIKey},
		{ID: "comfly-image", Name: "Comfly 图片", Protocol: "openai", BaseURL: "https://ai.comfly.org", APIKey: maskedAPIKey},
	}}}
	saved := model.Settings{Private: model.PrivateSetting{Channels: []model.ModelChannel{
		{ID: "comfly", Name: "中转 comfly", Protocol: "openai", BaseURL: "https://ai.comfly.org", APIKey: "provider-key"},
	}}}

	keepPrivateAPIKeys(&input, saved)

	for _, channel := range input.Private.Channels {
		if channel.APIKey != "provider-key" {
			t.Fatalf("channel %s api key = %q, want shared provider key", channel.ID, channel.APIKey)
		}
	}
}

func TestKeepPrivateAPIKeysRejectsAmbiguousProviderCredentials(t *testing.T) {
	input := model.Settings{Private: model.PrivateSetting{Channels: []model.ModelChannel{
		{ID: "primary", Name: "Primary", Protocol: "openai", BaseURL: "https://relay.example.com", APIKey: maskedAPIKey},
		{ID: "backup", Name: "Backup", Protocol: "openai", BaseURL: "https://relay.example.com", APIKey: maskedAPIKey},
		{ID: "preset-new", Name: "Preset", Protocol: "openai", BaseURL: "https://relay.example.com", APIKey: maskedAPIKey},
	}}}
	saved := model.Settings{Private: model.PrivateSetting{Channels: []model.ModelChannel{
		{ID: "primary", Name: "Primary", Protocol: "openai", BaseURL: "https://relay.example.com", APIKey: "key-one"},
		{ID: "backup", Name: "Backup", Protocol: "openai", BaseURL: "https://relay.example.com", APIKey: "key-two"},
	}}}

	keepPrivateAPIKeys(&input, saved)

	if input.Private.Channels[2].APIKey != "" {
		t.Fatalf("ambiguous provider api key = %q, want empty", input.Private.Channels[2].APIKey)
	}
}

func TestIsCustomChannelAllowedReadsPublicSetting(t *testing.T) {
	setupAITaskTestDB(t)
	saveSettingsForBoundaryTest(t, true, "sk-real")

	allowed, err := IsCustomChannelAllowed()
	if err != nil {
		t.Fatalf("IsCustomChannelAllowed returned error: %v", err)
	}
	if allowed {
		t.Fatal("custom channel should stay disabled even when legacy settings contain true")
	}
}

func TestCustomChannelDefaultsDisabled(t *testing.T) {
	setting := normalizePublicSetting(model.PublicSetting{})
	if setting.ModelChannel.AllowCustomChannel == nil {
		t.Fatal("AllowCustomChannel should be normalized")
	}
	if *setting.ModelChannel.AllowCustomChannel {
		t.Fatal("custom channel should default to disabled")
	}
}

func TestValidateModelProtocolConflictsRejectsSameModelAcrossProtocols(t *testing.T) {
	setupAITaskTestDB(t)
	_, err := SaveSettings(model.Settings{
		Public: model.PublicSetting{ModelChannel: model.PublicModelChannelSetting{AvailableModels: []string{"shared-video"}}},
		Private: model.PrivateSetting{Channels: []model.ModelChannel{
			{ID: "openai", Name: "OpenAI", Protocol: string(model.ModelProtocolOpenAI), BaseURL: "https://openai.example.com", APIKey: "sk-openai", Models: []string{"shared-video"}, Capabilities: []string{"video"}, Enabled: true},
			{ID: "xinglian", Name: "星链云", Protocol: string(model.ModelProtocolXinglianCloud), BaseURL: "https://xinglian.example.com/v1", APIKey: "sk-xinglian", Models: []string{"shared-video"}, Capabilities: []string{"video"}, Enabled: true},
		}},
	})
	if err == nil || !strings.Contains(err.Error(), "同名模型跨协议冲突") {
		t.Fatalf("SaveSettings error = %v, want protocol conflict", err)
	}
}

func TestValidateModelProtocolConflictsAllowsSameProtocolFallbackChannels(t *testing.T) {
	setupAITaskTestDB(t)
	_, err := SaveSettings(model.Settings{
		Public: model.PublicSetting{ModelChannel: model.PublicModelChannelSetting{AvailableModels: []string{"shared-text"}}},
		Private: model.PrivateSetting{Channels: []model.ModelChannel{
			{ID: "primary", Name: "主渠道", Protocol: string(model.ModelProtocolOpenAI), BaseURL: "https://primary.example.com", APIKey: "sk-primary", Models: []string{"shared-text"}, Capabilities: []string{"text"}, Enabled: true},
			{ID: "fallback", Name: "备用渠道", Protocol: string(model.ModelProtocolOpenAI), BaseURL: "https://fallback.example.com", APIKey: "sk-fallback", Models: []string{"shared-text"}, Capabilities: []string{"text"}, Enabled: true},
		}},
	})
	if err != nil {
		t.Fatalf("SaveSettings returned error for same protocol channels: %v", err)
	}
}

func TestArkEndpointIDCanSelectChannel(t *testing.T) {
	setupAITaskTestDB(t)
	saveArkEndpointSettings(t)

	channel, err := SelectModelChannel("ep-test-video")
	if err != nil {
		t.Fatalf("SelectModelChannel returned error: %v", err)
	}
	if channel.Name != "ark" {
		t.Fatalf("channel name = %q, want ark", channel.Name)
	}
	if endpoint := ModelChannelEndpointForModel(channel, "ep-test-video"); endpoint != "ep-test-video" {
		t.Fatalf("endpoint = %q, want ep-test-video", endpoint)
	}
}

func TestArkEndpointIDUsesDefaultVideoModelCost(t *testing.T) {
	setupAITaskTestDB(t)
	saveArkEndpointSettings(t)

	credits, err := ModelCost("ep-test-video")
	if err != nil {
		t.Fatalf("ModelCost returned error: %v", err)
	}
	if credits != 300 {
		t.Fatalf("credits = %d, want 300", credits)
	}
}

func TestVisibleSeedanceModelUsesVersionedModelCost(t *testing.T) {
	setupAITaskTestDB(t)
	saveArkEndpointSettings(t)

	credits, err := ModelCost("doubao-seedance-2-0")
	if err != nil {
		t.Fatalf("ModelCost returned error: %v", err)
	}
	if credits != 300 {
		t.Fatalf("credits = %d, want 300", credits)
	}
}

func TestPublicSettingsReplacesArkEndpointWithModelName(t *testing.T) {
	setupAITaskTestDB(t)
	savePublicEndpointSettings(t)

	settings, err := PublicSettings()
	if err != nil {
		t.Fatalf("PublicSettings returned error: %v", err)
	}
	if len(settings.ModelChannel.AvailableModels) != 1 || settings.ModelChannel.AvailableModels[0] != "doubao-seedance-2-0" {
		t.Fatalf("available models = %#v, want doubao model", settings.ModelChannel.AvailableModels)
	}
	if settings.ModelChannel.DefaultVideoModel != "doubao-seedance-2-0" {
		t.Fatalf("default video model = %q, want doubao-seedance-2-0", settings.ModelChannel.DefaultVideoModel)
	}
	if settings.ModelChannel.ModelCosts[0].Model != "doubao-seedance-2-0" || settings.ModelChannel.ModelCosts[0].Credits != 300 {
		t.Fatalf("model costs = %#v, want doubao cost", settings.ModelChannel.ModelCosts)
	}
	if len(settings.ModelChannel.ModelProtocols) != 1 || settings.ModelChannel.ModelProtocols[0].Model != "doubao-seedance-2-0" || settings.ModelChannel.ModelProtocols[0].Protocol != string(model.ModelProtocolVolcengineArk) {
		t.Fatalf("model protocols = %#v, want doubao ark protocol", settings.ModelChannel.ModelProtocols)
	}
}

func TestPublicSettingsKeepsDisabledArkModelNormalizationWithoutMetadata(t *testing.T) {
	setupAITaskTestDB(t)
	_, err := repository.SaveSettings(model.Settings{
		Public: model.PublicSetting{ModelChannel: model.PublicModelChannelSetting{
			AvailableModels:   []string{"ep-disabled-video"},
			DefaultVideoModel: "ep-disabled-video",
			ModelCosts:        []model.ModelCost{{Model: "ep-disabled-video", Credits: 300}},
			ModelTextEndpoints: []model.ModelTextEndpointType{{
				Model:        "ep-disabled-video",
				EndpointType: textEndpointResponses,
			}},
		}},
		Private: model.PrivateSetting{Channels: []model.ModelChannel{{
			Protocol:   string(model.ModelProtocolVolcengineArk),
			Name:       "disabled-ark",
			BaseURL:    "https://ark.example.com/api/v3",
			APIKey:     "ark-test",
			EndpointID: "ep-disabled-video",
			Models:     []string{"doubao-seedance-2-0"},
			Enabled:    false,
		}}},
	}, now())
	if err != nil {
		t.Fatalf("SaveSettings returned error: %v", err)
	}

	settings, err := PublicSettings()
	if err != nil {
		t.Fatalf("PublicSettings returned error: %v", err)
	}
	if len(settings.ModelChannel.AvailableModels) != 1 || settings.ModelChannel.AvailableModels[0] != "doubao-seedance-2-0" {
		t.Fatalf("available models = %#v, want disabled ark endpoint normalized", settings.ModelChannel.AvailableModels)
	}
	if settings.ModelChannel.DefaultVideoModel != "doubao-seedance-2-0" {
		t.Fatalf("default video model = %q, want disabled ark endpoint normalized", settings.ModelChannel.DefaultVideoModel)
	}
	if len(settings.ModelChannel.ModelCosts) != 1 || settings.ModelChannel.ModelCosts[0] != (model.ModelCost{Model: "doubao-seedance-2-0", Credits: 300}) {
		t.Fatalf("model costs = %#v, want disabled ark endpoint normalized", settings.ModelChannel.ModelCosts)
	}
	if len(settings.ModelChannel.ModelTextEndpoints) != 0 {
		t.Fatalf("model text endpoints = %#v, want empty without a routable text capability", settings.ModelChannel.ModelTextEndpoints)
	}
	if len(settings.ModelChannel.ModelProtocols) != 0 || len(settings.ModelChannel.ModelCapabilities) != 0 || len(settings.ModelChannel.ModelSources) != 0 {
		t.Fatalf("disabled ark metadata = protocols %#v, capabilities %#v, sources %#v; want empty", settings.ModelChannel.ModelProtocols, settings.ModelChannel.ModelCapabilities, settings.ModelChannel.ModelSources)
	}
}

func TestPublicSettingsKeepsOpenAICompatibleSeedanceModelName(t *testing.T) {
	setupAITaskTestDB(t)
	_, err := repository.SaveSettings(model.Settings{
		Public: model.PublicSetting{
			ModelChannel: model.PublicModelChannelSetting{
				AvailableModels:   []string{"doubao-seedance-2-0-260128"},
				DefaultVideoModel: "doubao-seedance-2-0-260128",
				ModelCosts:        []model.ModelCost{{Model: "doubao-seedance-2-0-260128", Credits: 300}},
			},
		},
		Private: model.PrivateSetting{
			Channels: []model.ModelChannel{{
				Protocol: string(model.ModelProtocolOpenAI),
				Name:     "openai-video",
				BaseURL:  "https://openai.example.com",
				APIKey:   "sk-test",
				Models:   []string{"doubao-seedance-2-0-260128"},
				Weight:   1,
				Enabled:  true,
			}},
		},
	}, now())
	if err != nil {
		t.Fatalf("SaveSettings returned error: %v", err)
	}

	settings, err := PublicSettings()
	if err != nil {
		t.Fatalf("PublicSettings returned error: %v", err)
	}
	if settings.ModelChannel.DefaultVideoModel != "doubao-seedance-2-0-260128" {
		t.Fatalf("default video model = %q, want versioned seedance model", settings.ModelChannel.DefaultVideoModel)
	}
	if len(settings.ModelChannel.AvailableModels) != 1 || settings.ModelChannel.AvailableModels[0] != "doubao-seedance-2-0-260128" {
		t.Fatalf("available models = %#v, want versioned seedance model", settings.ModelChannel.AvailableModels)
	}
	if len(settings.ModelChannel.ModelProtocols) != 1 || settings.ModelChannel.ModelProtocols[0].Protocol != string(model.ModelProtocolOpenAI) {
		t.Fatalf("model protocols = %#v, want openai protocol", settings.ModelChannel.ModelProtocols)
	}
}

func TestPublicSettingsExposesXinglianCloudVideoProtocol(t *testing.T) {
	setupAITaskTestDB(t)
	_, err := repository.SaveSettings(model.Settings{
		Public: model.PublicSetting{ModelChannel: model.PublicModelChannelSetting{
			AvailableModels:   []string{"sd2-720p-fast"},
			DefaultVideoModel: "sd2-720p-fast",
		}},
		Private: model.PrivateSetting{Channels: []model.ModelChannel{{
			Protocol: string(model.ModelProtocolXinglianCloud),
			Name:     "星链云",
			BaseURL:  "https://www.vjimeng.vip/v1",
			APIKey:   "sk-test",
			Models:   []string{"sd2-720p-fast"},
			Weight:   1,
			Enabled:  true,
		}}},
	}, now())
	if err != nil {
		t.Fatalf("SaveSettings returned error: %v", err)
	}

	settings, err := PublicSettings()
	if err != nil {
		t.Fatalf("PublicSettings returned error: %v", err)
	}
	if len(settings.ModelChannel.ModelProtocols) != 1 || settings.ModelChannel.ModelProtocols[0].Protocol != string(model.ModelProtocolXinglianCloud) {
		t.Fatalf("model protocols = %#v, want xinglian-cloud", settings.ModelChannel.ModelProtocols)
	}
}

func TestPublicSettingsExposesVideoModelCapabilities(t *testing.T) {
	setupAITaskTestDB(t)
	_, err := repository.SaveSettings(model.Settings{
		Public: model.PublicSetting{
			ModelChannel: model.PublicModelChannelSetting{
				AvailableModels:   []string{"relay-i2v-main", "doubao-seedance-2-0"},
				DefaultVideoModel: "doubao-seedance-2-0",
			},
		},
		Private: model.PrivateSetting{
			Channels: []model.ModelChannel{
				{
					Protocol:     string(model.ModelProtocolOpenAI),
					Name:         "relay-video",
					BaseURL:      "https://relay.example.com/v1",
					APIKey:       "sk-test",
					Models:       []string{"relay-i2v-main"},
					Capabilities: []string{"video"},
					Weight:       1,
					Enabled:      true,
				},
				{
					Protocol:         string(model.ModelProtocolVolcengineArk),
					Name:             "ark",
					BaseURL:          "https://ark.example.com/api/v3",
					APIKey:           "ark-test",
					EndpointMappings: []model.ModelEndpointMapping{{Model: "doubao-seedance-2-0", EndpointID: "ep-test"}},
					Weight:           1,
					Enabled:          true,
				},
			},
		},
	}, now())
	if err != nil {
		t.Fatalf("SaveSettings returned error: %v", err)
	}

	settings, err := PublicSettings()
	if err != nil {
		t.Fatalf("PublicSettings returned error: %v", err)
	}
	capabilities := map[string][]string{}
	for _, item := range settings.ModelChannel.ModelCapabilities {
		capabilities[item.Model] = item.Capabilities
	}
	if !containsString(capabilities["relay-i2v-main"], "video") {
		t.Fatalf("relay capabilities = %#v, want video", capabilities["relay-i2v-main"])
	}
	if !containsString(capabilities["doubao-seedance-2-0"], "video") {
		t.Fatalf("ark capabilities = %#v, want video", capabilities["doubao-seedance-2-0"])
	}
}

func TestPublicSettingsExposesModelSources(t *testing.T) {
	setupAITaskTestDB(t)
	_, err := repository.SaveSettings(model.Settings{
		Public: model.PublicSetting{
			ModelChannel: model.PublicModelChannelSetting{
				AvailableModels:    []string{"gpt-5.5", "seedance2.0fast"},
				DefaultTextModel:   "gpt-5.5",
				DefaultVideoModel:  "seedance2.0fast",
				DefaultImageModel:  "gpt-5.5",
				ModelCapabilities:  []model.ModelCapabilityType{},
				ModelTextEndpoints: []model.ModelTextEndpointType{},
			},
		},
		Private: model.PrivateSetting{
			Channels: []model.ModelChannel{
				{
					Protocol: string(model.ModelProtocolOpenAI),
					Name:     "文本中转",
					BaseURL:  "https://relay.example.com",
					APIKey:   "sk-test",
					Models:   []string{"gpt-5.5"},
					Enabled:  true,
				},
				{
					Protocol: string(model.ModelProtocolJimengCLI),
					Name:     "即梦本机 CLI",
					Models:   []string{"seedance2.0fast"},
					Enabled:  true,
				},
				{
					Protocol: string(model.ModelProtocolOpenAI),
					Name:     "已停用渠道",
					BaseURL:  "https://disabled.example.com",
					APIKey:   "sk-disabled",
					Models:   []string{"gpt-5.5"},
					Enabled:  false,
				},
			},
		},
	}, now())
	if err != nil {
		t.Fatalf("SaveSettings returned error: %v", err)
	}

	settings, err := PublicSettings()
	if err != nil {
		t.Fatalf("PublicSettings returned error: %v", err)
	}
	sources := map[string]model.ModelSourceType{}
	for _, item := range settings.ModelChannel.ModelSources {
		sources[item.Model] = item
		if item.ChannelName == "已停用渠道" {
			t.Fatalf("model sources included disabled channel: %#v", settings.ModelChannel.ModelSources)
		}
	}
	if sources["gpt-5.5"].ChannelName != "文本中转" || sources["gpt-5.5"].Protocol != string(model.ModelProtocolOpenAI) {
		t.Fatalf("gpt source = %#v, want 文本中转 openai", sources["gpt-5.5"])
	}
	if sources["seedance2.0fast"].ChannelName != "即梦本机 CLI" || sources["seedance2.0fast"].Protocol != string(model.ModelProtocolJimengCLI) {
		t.Fatalf("jimeng source = %#v, want 即梦本机 CLI jimeng-cli", sources["seedance2.0fast"])
	}
}

func TestPublicSettingsIgnoresDisabledAndUnroutableChannelsInModelMetadata(t *testing.T) {
	setupAITaskTestDB(t)
	_, err := repository.SaveSettings(model.Settings{
		Public: model.PublicSetting{ModelChannel: model.PublicModelChannelSetting{
			AvailableModels:   []string{"shared-model"},
			DefaultImageModel: "shared-model",
			DefaultTextModel:  "shared-model",
		}},
		Private: model.PrivateSetting{Channels: []model.ModelChannel{
			{
				ID:           "disabled-text",
				Protocol:     string(model.ModelProtocolOpenAI),
				Name:         "已停用文本渠道",
				BaseURL:      "https://disabled.example.com",
				APIKey:       "sk-disabled",
				Models:       []string{"shared-model"},
				Capabilities: []string{"text"},
				Enabled:      false,
			},
			{
				ID:           "unroutable-text",
				Protocol:     string(model.ModelProtocolOpenAI),
				Name:         "缺少密钥的文本渠道",
				BaseURL:      "https://unroutable.example.com",
				Models:       []string{"shared-model"},
				Capabilities: []string{"text"},
				Enabled:      true,
			},
			{
				ID:           "enabled-image",
				Protocol:     string(model.ModelProtocolXinglianCloud),
				Name:         "启用图片渠道",
				BaseURL:      "https://image.example.com",
				APIKey:       "sk-image",
				Models:       []string{"shared-model"},
				Capabilities: []string{"image"},
				Enabled:      true,
			},
		}},
	}, now())
	if err != nil {
		t.Fatalf("SaveSettings returned error: %v", err)
	}

	settings, err := PublicSettings()
	if err != nil {
		t.Fatalf("PublicSettings returned error: %v", err)
	}
	if len(settings.ModelChannel.ModelProtocols) != 1 || settings.ModelChannel.ModelProtocols[0] != (model.ModelProtocolType{Model: "shared-model", Protocol: string(model.ModelProtocolXinglianCloud)}) {
		t.Fatalf("model protocols = %#v, want enabled image channel only", settings.ModelChannel.ModelProtocols)
	}
	if len(settings.ModelChannel.ModelCapabilities) != 1 || len(settings.ModelChannel.ModelCapabilities[0].Capabilities) != 1 || settings.ModelChannel.ModelCapabilities[0].Capabilities[0] != "image" {
		t.Fatalf("model capabilities = %#v, want image only", settings.ModelChannel.ModelCapabilities)
	}
	if len(settings.ModelChannel.ModelSources) != 1 || settings.ModelChannel.ModelSources[0].ChannelID != "enabled-image" {
		t.Fatalf("model sources = %#v, want enabled image channel only", settings.ModelChannel.ModelSources)
	}
}

func TestPublicSettingsExposesJimengCLIProtocolAndCapabilities(t *testing.T) {
	setupAITaskTestDB(t)
	_, err := repository.SaveSettings(model.Settings{
		Public: model.PublicSetting{
			ModelChannel: model.PublicModelChannelSetting{
				AvailableModels:   []string{"seedance2.0fast"},
				DefaultVideoModel: "seedance2.0fast",
			},
		},
		Private: model.PrivateSetting{
			Channels: []model.ModelChannel{{
				Protocol:  string(model.ModelProtocolJimengCLI),
				Name:      "即梦本机 CLI",
				CLIPath:   "dreamina",
				OutputDir: t.TempDir(),
				Models:    []string{"seedance2.0fast"},
				Enabled:   true,
			}},
		},
	}, now())
	if err != nil {
		t.Fatalf("SaveSettings returned error: %v", err)
	}

	settings, err := PublicSettings()
	if err != nil {
		t.Fatalf("PublicSettings returned error: %v", err)
	}
	if len(settings.ModelChannel.ModelProtocols) != 1 || settings.ModelChannel.ModelProtocols[0].Protocol != string(model.ModelProtocolJimengCLI) {
		t.Fatalf("model protocols = %#v, want jimeng-cli", settings.ModelChannel.ModelProtocols)
	}
	capabilities := map[string][]string{}
	for _, item := range settings.ModelChannel.ModelCapabilities {
		capabilities[item.Model] = item.Capabilities
	}
	for _, want := range []string{"video", "video_query", "preflight", "cli_workflow"} {
		if !containsString(capabilities["seedance2.0fast"], want) {
			t.Fatalf("jimeng capabilities = %#v, want %s", capabilities["seedance2.0fast"], want)
		}
	}
}

func TestSelectModelChannelAllowsJimengCLIWithoutAPIKeyOrBaseURL(t *testing.T) {
	setupAITaskTestDB(t)
	_, err := repository.SaveSettings(model.Settings{
		Private: model.PrivateSetting{
			Channels: []model.ModelChannel{{
				Protocol:  string(model.ModelProtocolJimengCLI),
				Name:      "即梦本机 CLI",
				CLIPath:   "dreamina",
				OutputDir: t.TempDir(),
				Models:    []string{"seedance2.0fast"},
				Enabled:   true,
			}},
		},
	}, now())
	if err != nil {
		t.Fatalf("SaveSettings returned error: %v", err)
	}

	channel, err := SelectModelChannel("seedance2.0fast")
	if err != nil {
		t.Fatalf("SelectModelChannel returned error: %v", err)
	}
	if channel.Protocol != string(model.ModelProtocolJimengCLI) || channel.Name != "即梦本机 CLI" {
		t.Fatalf("channel = %#v, want jimeng cli channel", channel)
	}
}

func TestAdminTestArkChannelModelChecksEnterpriseAPIAuth(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/contents/generations/tasks/__infinite_canvas_probe__" {
			t.Fatalf("path = %s, want ark task probe", r.URL.Path)
		}
		if auth := r.Header.Get("Authorization"); auth != "Bearer ark-key" {
			t.Fatalf("authorization = %q, want ark key", auth)
		}
		http.Error(w, `{"error":{"message":"task not found"}}`, http.StatusNotFound)
	}))
	defer upstream.Close()

	result, err := AdminTestChannelModel(nil, model.ModelChannel{
		Protocol:         string(model.ModelProtocolVolcengineArk),
		Name:             "enterprise",
		BaseURL:          upstream.URL,
		APIKey:           "ark-key",
		EndpointMappings: []model.ModelEndpointMapping{{Model: "doubao-seedance-2-0", EndpointID: "ep-test"}},
		Models:           []string{"doubao-seedance-2-0"},
		Weight:           1,
		Enabled:          true,
	}, "doubao-seedance-2-0")
	if err != nil {
		t.Fatalf("AdminTestChannelModel returned error: %v", err)
	}
	if !strings.Contains(result, "企业 API 鉴权通过") || !strings.Contains(result, "ep-test") {
		t.Fatalf("result = %q, want enterprise auth success with endpoint", result)
	}
}

func TestAdminTestArkChannelModelReportsEnterpriseAPIAuthFailure(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":{"message":"The API key doesn't exist."}}`))
	}))
	defer upstream.Close()

	_, err := AdminTestChannelModel(nil, model.ModelChannel{
		Protocol:         string(model.ModelProtocolVolcengineArk),
		Name:             "enterprise",
		BaseURL:          upstream.URL,
		APIKey:           "bad-key",
		EndpointMappings: []model.ModelEndpointMapping{{Model: "doubao-seedance-2-0", EndpointID: "ep-test"}},
		Models:           []string{"doubao-seedance-2-0"},
		Weight:           1,
		Enabled:          true,
	}, "doubao-seedance-2-0")
	if err == nil || !strings.Contains(err.Error(), "The API key doesn't exist") {
		t.Fatalf("error = %v, want enterprise auth failure", err)
	}
	message := err.Error()
	for _, want := range []string{"渠道：enterprise", "模型：doubao-seedance-2-0", "EP：ep-test", "Base URL：" + upstream.URL, "Key：...-key"} {
		if !strings.Contains(message, want) {
			t.Fatalf("error = %q, want diagnostic %q", message, want)
		}
	}
	if strings.Contains(message, "bad-key") {
		t.Fatalf("error leaked full api key: %q", message)
	}
}

func TestAdminTestJimengChannelModelDoesNotRequireUserLogin(t *testing.T) {
	cli := filepath.Join(t.TempDir(), "dreamina")
	script := `#!/bin/sh
case "$1" in
  version) printf '{"version":"test-jimeng"}\n' ;;
  user_credit) echo "not logged in" >&2; exit 2 ;;
  *) echo "unexpected command: $*" >&2; exit 2 ;;
esac
`
	if err := os.WriteFile(cli, []byte(script), 0755); err != nil {
		t.Fatal(err)
	}

	result, err := AdminTestChannelModel(nil, model.ModelChannel{
		Protocol: string(model.ModelProtocolJimengCLI),
		Name:     "即梦本机 CLI",
		CLIPath:  cli,
		Models:   []string{"seedance2.0fast"},
		Enabled:  true,
	}, "seedance2.0fast")
	if err != nil {
		t.Fatalf("AdminTestChannelModel returned error: %v", err)
	}
	if !strings.Contains(result, "CLI 可用") {
		t.Fatalf("result = %q, want CLI-only success", result)
	}
}

func TestPreflightModelChannelChecksArkEnterpriseAuth(t *testing.T) {
	setupAITaskTestDB(t)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/contents/generations/tasks/__infinite_canvas_probe__" {
			t.Fatalf("path = %s, want ark task probe", r.URL.Path)
		}
		if auth := r.Header.Get("Authorization"); auth != "Bearer ark-key" {
			t.Fatalf("authorization = %q, want ark key", auth)
		}
		http.Error(w, `{"error":{"message":"task not found"}}`, http.StatusNotFound)
	}))
	defer upstream.Close()
	saveArkPreflightSettings(t, upstream.URL, "ark-key")

	result, err := PreflightModelChannel("doubao-seedance-2-0")
	if err != nil {
		t.Fatalf("PreflightModelChannel returned error: %v", err)
	}
	if result.Protocol != string(model.ModelProtocolVolcengineArk) || result.Model != "doubao-seedance-2-0" {
		t.Fatalf("result = %#v, want ark doubao model", result)
	}
	if result.ChannelName != "ark" || result.BaseURL != upstream.URL || result.EndpointID != "ep-test" {
		t.Fatalf("result diagnostics = %#v, want channel/base url/endpoint", result)
	}
	if !result.APIKeyConfigured || result.APIKeyHint != "...-key" {
		t.Fatalf("api key diagnostics = configured %v hint %q, want masked suffix", result.APIKeyConfigured, result.APIKeyHint)
	}
}

func TestPreflightModelChannelReportsArkEnterpriseAuthFailure(t *testing.T) {
	setupAITaskTestDB(t)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":{"message":"The API key doesn't exist."}}`))
	}))
	defer upstream.Close()
	saveArkPreflightSettings(t, upstream.URL, "bad-key")

	_, err := PreflightModelChannel("doubao-seedance-2-0")
	if err == nil || !strings.Contains(err.Error(), "The API key doesn't exist") {
		t.Fatalf("error = %v, want enterprise auth failure", err)
	}
	message := err.Error()
	for _, want := range []string{"渠道：ark", "模型：doubao-seedance-2-0", "EP：ep-test", "Base URL：" + upstream.URL, "Key：...-key"} {
		if !strings.Contains(message, want) {
			t.Fatalf("error = %q, want diagnostic %q", message, want)
		}
	}
	if strings.Contains(message, "bad-key") {
		t.Fatalf("error leaked full api key: %q", message)
	}
}

func saveSettingsForBoundaryTest(t *testing.T, allowCustomChannel bool, apiKey string) {
	t.Helper()
	_, err := repository.SaveSettings(model.Settings{
		Public: model.PublicSetting{
			ModelChannel: model.PublicModelChannelSetting{
				AllowCustomChannel: &allowCustomChannel,
				AvailableModels:    []string{"ep-test"},
				DefaultVideoModel:  "ep-test",
			},
		},
		Private: model.PrivateSetting{
			Channels: []model.ModelChannel{{
				Protocol: string(model.ModelProtocolVolcengineArk),
				Name:     "ark",
				BaseURL:  "https://ark.example.com/api/v3",
				APIKey:   apiKey,
				Models:   []string{"ep-test"},
				Weight:   1,
				Enabled:  true,
			}},
		},
	}, now())
	if err != nil {
		t.Fatalf("SaveSettings returned error: %v", err)
	}
}

func savePublicEndpointSettings(t *testing.T) {
	t.Helper()
	_, err := repository.SaveSettings(model.Settings{
		Public: model.PublicSetting{
			ModelChannel: model.PublicModelChannelSetting{
				AvailableModels:   []string{"ep-test-video"},
				DefaultVideoModel: "ep-test-video",
				ModelCosts:        []model.ModelCost{{Model: "ep-test-video", Credits: 300}},
			},
		},
		Private: model.PrivateSetting{
			Channels: []model.ModelChannel{{
				Protocol:   string(model.ModelProtocolVolcengineArk),
				Name:       "ark",
				BaseURL:    "https://ark.example.com/api/v3",
				APIKey:     "ark-test",
				EndpointID: "ep-test-video",
				Models:     []string{"doubao-seedance-2-0"},
				Weight:     1,
				Enabled:    true,
			}},
		},
	}, now())
	if err != nil {
		t.Fatalf("SaveSettings returned error: %v", err)
	}
}

func saveArkEndpointSettings(t *testing.T) {
	t.Helper()
	_, err := repository.SaveSettings(model.Settings{
		Public: model.PublicSetting{
			ModelChannel: model.PublicModelChannelSetting{
				DefaultVideoModel: "doubao-seedance-2-0-260128",
				ModelCosts: []model.ModelCost{
					{Model: "doubao-seedance-2-0-260128", Credits: 300},
				},
			},
		},
		Private: model.PrivateSetting{
			Channels: []model.ModelChannel{{
				Protocol:   string(model.ModelProtocolVolcengineArk),
				Name:       "ark",
				BaseURL:    "https://ark.example.com/api/v3",
				APIKey:     "ark-test",
				EndpointID: "ep-test-video",
				Models:     []string{"doubao-seedance-2-0"},
				Weight:     1,
				Enabled:    true,
			}},
		},
	}, now())
	if err != nil {
		t.Fatalf("SaveSettings returned error: %v", err)
	}
}

func saveArkPreflightSettings(t *testing.T, baseURL string, apiKey string) {
	t.Helper()
	_, err := repository.SaveSettings(model.Settings{
		Public: model.PublicSetting{
			ModelChannel: model.PublicModelChannelSetting{
				AvailableModels:   []string{"doubao-seedance-2-0"},
				DefaultVideoModel: "doubao-seedance-2-0",
				ModelCosts:        []model.ModelCost{{Model: "doubao-seedance-2-0", Credits: 300}},
			},
		},
		Private: model.PrivateSetting{
			Channels: []model.ModelChannel{{
				Protocol:         string(model.ModelProtocolVolcengineArk),
				Name:             "ark",
				BaseURL:          baseURL,
				APIKey:           apiKey,
				EndpointMappings: []model.ModelEndpointMapping{{Model: "doubao-seedance-2-0", EndpointID: "ep-test"}},
				Models:           []string{"doubao-seedance-2-0"},
				Weight:           1,
				Enabled:          true,
			}},
		},
	}, now())
	if err != nil {
		t.Fatalf("SaveSettings returned error: %v", err)
	}
}

func containsString(items []string, target string) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}
