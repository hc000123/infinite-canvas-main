package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
)

func TestAPIAgentRunExecutorGeneratesAndArchivesBase64Image(t *testing.T) {
	png := testRuntimePNG(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/images/generations" {
			t.Fatalf("path=%s", r.URL.Path)
		}
		var body map[string]any
		if json.NewDecoder(r.Body).Decode(&body) != nil || body["model"] != "image-test" || body["n"] != float64(1) {
			t.Fatalf("body=%+v", body)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"request-1","data":[{"b64_json":"` + base64.StdEncoding.EncodeToString(png) + `"}]}`))
	}))
	defer server.Close()
	setupAPIImageExecutorTest(t, server.URL)

	run := imageExecutorAgentRun(`{"model":"image-test","n":1,"prompt":"character"}`, `{"assetId":"character-001","bindingName":"asset_rendition","ordinals":[0]}`)
	result := NewAPIAgentRunExecutor(server.Client()).Call(context.Background(), run)
	if result.message != "" || !strings.Contains(result.structuredJSON, `"assetId":"character-001"`) || !strings.Contains(result.structuredJSON, `"ordinal":0`) || !strings.Contains(result.structuredJSON, `/api/uploaded-assets/runtime/image/sha256-`) {
		t.Fatalf("result=%+v", result)
	}
	if strings.Contains(result.structuredJSON, "b64_json") || strings.Contains(result.structuredJSON, base64.StdEncoding.EncodeToString(png)) || result.rawOutput != result.structuredJSON {
		t.Fatalf("provider payload leaked: %s", result.structuredJSON)
	}
}

func TestAPIAgentRunExecutorArchivesDownloadedImageWithInjectedResolver(t *testing.T) {
	png := testRuntimePNG(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"request_id":"request-url","data":[{"url":"https://cdn.example.test/result.png"}]}`))
	}))
	defer server.Close()
	setupAPIImageExecutorTest(t, server.URL)
	executor := NewAPIAgentRunExecutor(server.Client())
	executor.downloadImage = func(context.Context, string) ([]byte, error) { return png, nil }
	result := executor.Call(context.Background(), imageExecutorAgentRun(`{"model":"image-test","n":1,"prompt":"scene"}`, `{"assetId":"scene-001","bindingName":"asset_rendition","ordinals":[0]}`))
	if result.message != "" || !strings.Contains(result.structuredJSON, `"requestId":"request-url"`) || !strings.Contains(result.structuredJSON, `"assetId":"scene-001"`) {
		t.Fatalf("result=%+v", result)
	}
}

func TestAPIAgentRunExecutorRejectsInvalidImageResponses(t *testing.T) {
	for _, test := range []struct {
		name       string
		statusCode int
		response   string
		retryable  bool
	}{
		{name: "empty", response: `{"data":[]}`, retryable: true},
		{name: "invalid base64", response: `{"data":[{"b64_json":"%%%"}]}`},
		{name: "not image", response: `{"data":[{"b64_json":"bm90LWltYWdl"}]}`},
		{name: "rate limited", statusCode: http.StatusTooManyRequests, response: `{"error":{"message":"slow down"}}`, retryable: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if test.statusCode != 0 {
					w.WriteHeader(test.statusCode)
				}
				_, _ = w.Write([]byte(test.response))
			}))
			defer server.Close()
			setupAPIImageExecutorTest(t, server.URL)
			result := NewAPIAgentRunExecutor(server.Client()).Call(context.Background(), imageExecutorAgentRun(`{"model":"image-test","n":1,"prompt":"prop"}`, `{"assetId":"prop-001","bindingName":"asset_rendition","ordinals":[0]}`))
			if result.message == "" || result.retryable != test.retryable || result.structuredJSON != "" {
				t.Fatalf("result=%+v", result)
			}
		})
	}
}

func setupAPIImageExecutorTest(t *testing.T, baseURL string) {
	t.Helper()
	original := config.Cfg.PublicAssetDir
	config.Cfg.PublicAssetDir = t.TempDir()
	t.Cleanup(func() { config.Cfg.PublicAssetDir = original })
	setupAITaskTestDB(t)
	if _, err := SaveSettings(model.Settings{
		Public:  model.PublicSetting{ModelChannel: model.PublicModelChannelSetting{AvailableModels: []string{"image-test"}, DefaultImageModel: "image-test"}},
		Private: model.PrivateSetting{Channels: []model.ModelChannel{{ID: "image-channel", Protocol: string(model.ModelProtocolOpenAI), Name: "openai", BaseURL: baseURL, APIKey: "image-key", Models: []string{"image-test"}, Capabilities: []string{"image"}, Enabled: true}}},
	}); err != nil {
		t.Fatal(err)
	}
}

func imageExecutorAgentRun(requestJSON, manifestJSON string) model.AgentRun {
	return model.AgentRun{
		ID: "image-agent-run", UserID: "user-1", Executor: AgentRunExecutorAPI, ExecutionKind: "image_model",
		Model: "image-test", ChannelID: "image-channel", Provider: "openai", Protocol: string(model.ModelProtocolOpenAI),
		RequestJSON: requestJSON, ImageManifestJSON: manifestJSON, TimeoutSeconds: 30,
	}
}
