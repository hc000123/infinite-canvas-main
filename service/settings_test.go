package service

import (
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

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

func TestIsCustomChannelAllowedReadsPublicSetting(t *testing.T) {
	setupAITaskTestDB(t)
	saveSettingsForBoundaryTest(t, false, "sk-real")

	allowed, err := IsCustomChannelAllowed()
	if err != nil {
		t.Fatalf("IsCustomChannelAllowed returned error: %v", err)
	}
	if allowed {
		t.Fatal("custom channel should be disabled")
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
