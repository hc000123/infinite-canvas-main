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
