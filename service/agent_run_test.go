package service

import (
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestCreateUserAgentRunQueuesWithoutCallingUpstream(t *testing.T) {
	setupAITaskTestDB(t)
	var calls atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()
	saveAgentRunTextChannel(t, upstream.URL)

	run, err := CreateUserAgentRun("user-1", CreateAgentRunInput{
		AgentKind:       "asset_extractor",
		IdempotencyKey:  "create-1",
		ModelPreference: "text-test",
		UserPrompt:      "test",
	})
	if err != nil {
		t.Fatalf("CreateUserAgentRun returned error: %v", err)
	}
	if run.Status != model.AgentRunStatusQueued || calls.Load() != 0 {
		t.Fatalf("run status=%s calls=%d", run.Status, calls.Load())
	}
	if run.IdempotencyKey == nil || *run.IdempotencyKey != "create-1" {
		t.Fatalf("idempotency key=%v", run.IdempotencyKey)
	}

	replayed, err := CreateUserAgentRun("user-1", CreateAgentRunInput{
		AgentKind:       "asset_extractor",
		IdempotencyKey:  "create-1",
		ModelPreference: "text-test",
		UserPrompt:      "test",
	})
	if err != nil || replayed.ID != run.ID {
		t.Fatalf("replayed=%#v err=%v", replayed, err)
	}
}

func saveAgentRunTextChannel(t *testing.T, baseURL string) {
	t.Helper()
	_, err := repository.SaveSettings(model.Settings{
		Public: model.PublicSetting{ModelChannel: model.PublicModelChannelSetting{
			AvailableModels:  []string{"text-test"},
			DefaultTextModel: "text-test",
			ModelCosts:       []model.ModelCost{{Model: "text-test", Credits: 5}},
		}},
		Private: model.PrivateSetting{Channels: []model.ModelChannel{{
			ID:           "text-channel",
			Protocol:     string(model.ModelProtocolOpenAI),
			Name:         "test-text",
			BaseURL:      baseURL,
			APIKey:       "test-key",
			Models:       []string{"text-test"},
			Capabilities: []string{"text"},
			Weight:       1,
			Enabled:      true,
		}}},
	}, now())
	if err != nil {
		t.Fatalf("SaveSettings returned error: %v", err)
	}
}
