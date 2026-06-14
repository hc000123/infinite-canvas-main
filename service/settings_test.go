package service

import (
	"net/http"
	"net/http/httptest"
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
