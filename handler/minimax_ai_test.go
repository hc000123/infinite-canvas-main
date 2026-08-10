package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/basketikun/infinite-canvas/service"
)

func TestMiniMaxVideoProxySubmitsAndQueriesH3Task(t *testing.T) {
	setupAIHandlerTestDB(t)
	queryCount := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer minimax-key" {
			t.Fatalf("authorization = %q", r.Header.Get("Authorization"))
		}
		switch r.URL.Path {
		case "/v2/video_generation":
			if r.Method != http.MethodPost {
				t.Fatalf("create method = %s", r.Method)
			}
			payload := readJSONMap(t, mustReadAll(t, r.Body))
			if payload["model"] != "MiniMax-H3" || payload["resolution"] != "2K" || payload["duration"] != float64(6) {
				t.Fatalf("create payload = %#v", payload)
			}
			if _, exists := payload["seed"]; exists {
				t.Fatalf("unsupported seed reached MiniMax: %#v", payload)
			}
			_, _ = w.Write([]byte(`{"task_id":"task-minimax"}`))
		case "/v2/query/video_generation/task-minimax":
			queryCount++
			_, _ = w.Write([]byte(`{"task":{"id":"task-minimax","model":"MiniMax-H3","status":"succeeded","created_at":10,"updated_at":20,"content":{"url":"https://cdn.example.com/minimax.mp4"},"resolution":"2K","duration":6,"ratio":"16:9"}}`))
		default:
			t.Fatalf("unexpected MiniMax path: %s", r.URL.Path)
		}
	}))
	defer upstream.Close()
	saveMiniMaxHandlerSettings(t, upstream.URL)

	request := httptest.NewRequest(http.MethodPost, "/api/v1/videos", strings.NewReader(`{"model":"MiniMax-H3","content":[{"type":"text","text":"一只猫在草地奔跑"}],"duration":6,"ratio":"16:9","resolution":"2K","aigc_watermark":false,"seed":42}`))
	request.Header.Set("Content-Type", "application/json")
	request = request.WithContext(service.WithUser(request.Context(), model.AuthUser{ID: "user-minimax", Username: "minimax", Role: model.UserRoleUser}))
	response := httptest.NewRecorder()

	proxyAIRequest(response, request, "/videos")
	if response.Code != http.StatusOK {
		t.Fatalf("submit status = %d body=%s", response.Code, response.Body.String())
	}
	if payload := readJSONMap(t, response.Body.Bytes()); payload["id"] != "task-minimax" || payload["status"] != "queued" {
		t.Fatalf("submit response = %#v", payload)
	}
	if response.Header().Get("X-AI-Upstream-Task-ID") != "task-minimax" {
		t.Fatalf("upstream task header = %q", response.Header().Get("X-AI-Upstream-Task-ID"))
	}

	queryRequest := httptest.NewRequest(http.MethodGet, "/api/v1/videos/task-minimax?model=MiniMax-H3", nil).WithContext(request.Context())
	queryResponse := httptest.NewRecorder()
	proxyAIGetRequest(queryResponse, queryRequest, "/videos/task-minimax")
	if queryResponse.Code != http.StatusOK {
		t.Fatalf("query status = %d body=%s", queryResponse.Code, queryResponse.Body.String())
	}
	if payload := readJSONMap(t, queryResponse.Body.Bytes()); payload["status"] != "succeeded" || payload["video_url"] != "https://cdn.example.com/minimax.mp4" {
		t.Fatalf("query response = %#v", payload)
	}
	if queryCount != 1 {
		t.Fatalf("query count = %d", queryCount)
	}
}

func TestMiniMaxVideoContentQueriesTaskBeforeSafeDownload(t *testing.T) {
	setupAIHandlerTestDB(t)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v2/query/video_generation/task-no-content" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"task":{"id":"task-no-content","status":"running"}}`))
	}))
	defer upstream.Close()
	saveMiniMaxHandlerSettings(t, upstream.URL)

	request := httptest.NewRequest(http.MethodGet, "/api/v1/videos/task-no-content/content?model=MiniMax-H3", nil)
	request = request.WithContext(service.WithUser(request.Context(), model.AuthUser{ID: "user-minimax", Username: "minimax", Role: model.UserRoleUser}))
	response := httptest.NewRecorder()
	proxyAIGetRequest(response, request, "/videos/task-no-content/content")

	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "尚未返回可下载地址") {
		t.Fatalf("content response = %d %s", response.Code, response.Body.String())
	}
}

func saveMiniMaxHandlerSettings(t *testing.T, upstreamURL string) {
	t.Helper()
	now := time.Now().Format(time.RFC3339)
	_, err := repository.SaveSettings(model.Settings{
		Public: model.PublicSetting{ModelChannel: model.PublicModelChannelSetting{
			AvailableModels:   []string{"MiniMax-H3"},
			DefaultVideoModel: "MiniMax-H3",
			ModelCosts:        []model.ModelCost{{Model: "MiniMax-H3", Credits: 0}},
		}},
		Private: model.PrivateSetting{Channels: []model.ModelChannel{{
			Protocol:     string(model.ModelProtocolMiniMax),
			Name:         "MiniMax H3",
			BaseURL:      upstreamURL,
			APIKey:       "minimax-key",
			Models:       []string{"MiniMax-H3"},
			Capabilities: []string{"video", "video_query"},
			Weight:       1,
			Enabled:      true,
		}}},
	}, now)
	if err != nil {
		t.Fatalf("SaveSettings returned error: %v", err)
	}
}
