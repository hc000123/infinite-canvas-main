package handler_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/basketikun/infinite-canvas/router"
	"github.com/basketikun/infinite-canvas/service"
	"github.com/gin-gonic/gin"
)

func TestInvocationHTTPDirectPreflightThroughRealRouter(t *testing.T) {
	app := setupInvocationHTTPRouter(t)
	ownerToken := registerAndLoginInvocationHTTPUser(t, app, "invocation-http-owner")
	foreignToken := registerAndLoginInvocationHTTPUser(t, app, "invocation-http-foreign")

	created := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/artifacts", ownerToken, map[string]any{
		"artifactType": "source_text", "schemaVersion": "1.0.0", "projectId": "project-http", "episodeId": "episode-http",
		"payload": map[string]any{"text": "HTTP 原始剧本"},
	})
	if created.Code != 0 {
		t.Fatalf("create Artifact response=%s", created.Raw)
	}
	var artifact service.ArtifactEnvelope
	decodeInvocationHTTPData(t, created, &artifact)
	if artifact.Artifact.ID == "" || artifact.Artifact.ContentHash == "" {
		t.Fatalf("Artifact=%#v", artifact)
	}

	request := map[string]any{
		"source": "direct", "projectId": "project-http", "episodeId": "episode-http",
		"skillVersionId": "skill-version-system-workflow-script-3.1.0", "expectedOutputArtifactType": "production_script",
		"inputArtifactRefs": []map[string]any{{"bindingName": "source_text", "artifactId": artifact.Artifact.ID, "contentHash": artifact.Artifact.ContentHash}},
		"parameters":        map[string]any{"language": "zh-CN"}, "idempotencyKey": "Authorization: Bearer must-not-leak",
	}
	preflightResponse := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/invocations", ownerToken, request)
	if preflightResponse.Code != 0 {
		t.Fatalf("create Invocation response=%s", preflightResponse.Raw)
	}
	var preflight service.InvocationPreflightResponse
	decodeInvocationHTTPData(t, preflightResponse, &preflight)
	if preflight.Run.Status != model.InvocationStatusAwaitingConfirmation || preflight.Run.LatestAttempt != 0 || preflight.Revision.SkillVersionID != "skill-version-system-workflow-script-3.1.0" || len(preflight.ConfirmationRequirements) == 0 {
		t.Fatalf("preflight=%#v", preflight)
	}
	for _, forbidden := range []string{"Authorization: Bearer must-not-leak", "channelId", "apiKey", "skillSnapshotJSON", "requestHash"} {
		if strings.Contains(preflightResponse.Raw, forbidden) {
			t.Fatalf("unsafe preflight exposed %q: %s", forbidden, preflightResponse.Raw)
		}
	}

	missingConfirmation := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/invocations/"+preflight.Run.ID+"/confirm", ownerToken, map[string]any{"requirementCodes": []string{}})
	if missingConfirmation.Code == 0 || missingConfirmation.Msg != "操作失败" {
		t.Fatalf("missing requirements accepted: %s", missingConfirmation.Raw)
	}

	detailResponse := invocationHTTPCall(t, app, http.MethodGet, "/api/v1/invocations/"+preflight.Run.ID, ownerToken, nil)
	if detailResponse.Code != 0 {
		t.Fatalf("detail response=%s", detailResponse.Raw)
	}
	var detail service.InvocationDetail
	decodeInvocationHTTPData(t, detailResponse, &detail)
	if detail.Run.Status != model.InvocationStatusAwaitingConfirmation || detail.Run.LatestAttempt != 0 || len(detail.Revisions) != 1 || len(detail.Events) != 1 {
		t.Fatalf("detail=%#v", detail)
	}
	eventsResponse := invocationHTTPCall(t, app, http.MethodGet, "/api/v1/invocations/"+preflight.Run.ID+"/events?after=0&limit=1", ownerToken, nil)
	if eventsResponse.Code != 0 {
		t.Fatalf("events response=%s", eventsResponse.Raw)
	}
	var events []model.InvocationEvent
	decodeInvocationHTTPData(t, eventsResponse, &events)
	if len(events) != 1 || events[0].Type != "preflight.completed" {
		t.Fatalf("events=%#v", events)
	}

	for _, target := range []string{"/api/v1/invocations/" + preflight.Run.ID, "/api/v1/invocations/" + preflight.Run.ID + "/events?limit=1", "/api/v1/artifacts/" + artifact.Artifact.ID} {
		foreign := invocationHTTPCall(t, app, http.MethodGet, target, foreignToken, nil)
		if foreign.Code == 0 {
			t.Fatalf("foreign user read %s: %s", target, foreign.Raw)
		}
	}

	strictRequest := request
	strictRequest["receipt"] = map[string]any{"forged": true}
	if response := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/invocations", ownerToken, strictRequest); response.Code == 0 {
		t.Fatalf("unknown create field accepted: %s", response.Raw)
	}
	for _, suffix := range []string{"cancel", "retry"} {
		response := invocationHTTPRawCall(t, app, http.MethodPost, "/api/v1/invocations/"+preflight.Run.ID+"/"+suffix, ownerToken, []byte(`{}`))
		if response.Code == 0 {
			t.Fatalf("non-zero-byte %s accepted: %s", suffix, response.Raw)
		}
	}
}

type invocationHTTPResponse struct {
	Code int             `json:"code"`
	Data json.RawMessage `json:"data"`
	Msg  string          `json:"msg"`
	Raw  string          `json:"-"`
}

func setupInvocationHTTPRouter(t *testing.T) http.Handler {
	t.Helper()
	oldConfig := config.Cfg
	config.Cfg.StorageDriver = "sqlite"
	config.Cfg.DatabaseDSN = filepath.Join(t.TempDir(), "invocation-http.db")
	config.Cfg.JWTSecret = "invocation-http-test-secret"
	config.Cfg.JWTExpireHours = 1
	config.Cfg.TrustedProxies = nil
	config.Cfg.PublicAssetDir = t.TempDir()
	repository.ResetForTest()
	t.Cleanup(func() {
		config.Cfg = oldConfig
		repository.ResetForTest()
	})
	if err := service.EnsureCoreArtifactSchemas(); err != nil {
		t.Fatal(err)
	}
	if err := service.EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	allowRegister := true
	if _, err := service.SaveSettings(model.Settings{
		Public: model.PublicSetting{
			Auth:         model.PublicAuthSetting{AllowRegister: &allowRegister},
			ModelChannel: model.PublicModelChannelSetting{AvailableModels: []string{"text-test"}, DefaultTextModel: "text-test"},
		},
		Private: model.PrivateSetting{Channels: []model.ModelChannel{{
			ID: "text-channel", Protocol: string(model.ModelProtocolOpenAI), Name: "test-only", BaseURL: "https://example.invalid/v1",
			APIKey: "must-not-leak", Models: []string{"text-test"}, Capabilities: []string{"text"}, Enabled: true,
		}}},
	}); err != nil {
		t.Fatal(err)
	}
	gin.SetMode(gin.TestMode)
	return router.New()
}

func registerAndLoginInvocationHTTPUser(t *testing.T, app http.Handler, username string) string {
	t.Helper()
	password := "password-123"
	registered := invocationHTTPCall(t, app, http.MethodPost, "/api/auth/register", "", map[string]any{"username": username, "password": password})
	if registered.Code != 0 {
		t.Fatalf("register %s: %s", username, registered.Raw)
	}
	loggedIn := invocationHTTPCall(t, app, http.MethodPost, "/api/auth/login", "", map[string]any{"username": username, "password": password})
	if loggedIn.Code != 0 {
		t.Fatalf("login %s: %s", username, loggedIn.Raw)
	}
	var result model.LoginResult
	decodeInvocationHTTPData(t, loggedIn, &result)
	if result.Status != "authenticated" || result.Session.Token == "" {
		t.Fatalf("login result=%#v raw=%s", result, loggedIn.Raw)
	}
	return result.Session.Token
}

func invocationHTTPCall(t *testing.T, app http.Handler, method, target, token string, body any) invocationHTTPResponse {
	t.Helper()
	var encoded []byte
	if body != nil {
		var err error
		encoded, err = json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
	}
	return invocationHTTPRawCall(t, app, method, target, token, encoded)
}

func invocationHTTPRawCall(t *testing.T, app http.Handler, method, target, token string, body []byte) invocationHTTPResponse {
	t.Helper()
	request := httptest.NewRequest(method, target, bytes.NewReader(body))
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	recorder := httptest.NewRecorder()
	app.ServeHTTP(recorder, request)
	var response invocationHTTPResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("%s %s returned HTTP %d non-envelope body %q: %v", method, target, recorder.Code, recorder.Body.String(), err)
	}
	response.Raw = recorder.Body.String()
	if recorder.Code != http.StatusOK {
		t.Fatalf("%s %s returned HTTP %d: %s", method, target, recorder.Code, response.Raw)
	}
	return response
}

func decodeInvocationHTTPData(t *testing.T, response invocationHTTPResponse, target any) {
	t.Helper()
	if err := json.Unmarshal(response.Data, target); err != nil {
		t.Fatalf("decode data from %s: %v", response.Raw, err)
	}
}

func TestInvocationHTTPRouteCountDocumentsThreeArtifactAndElevenInvocationRoutes(t *testing.T) {
	app := setupInvocationHTTPRouter(t)
	ginApp, ok := app.(*gin.Engine)
	if !ok {
		t.Fatalf("router type=%T", app)
	}
	want := map[string]bool{
		"POST /api/v1/artifacts": true, "GET /api/v1/artifacts": true, "GET /api/v1/artifacts/:id": true,
		"POST /api/v1/invocations": true, "GET /api/v1/invocations": true, "GET /api/v1/invocations/:id": true,
		"POST /api/v1/invocations/:id/repreflight": true, "POST /api/v1/invocations/:id/confirm": true,
		"POST /api/v1/invocations/:id/cancel": true, "POST /api/v1/invocations/:id/retry": true,
		"POST /api/v1/invocations/:id/revalidate": true, "POST /api/v1/invocations/:id/review": true,
		"POST /api/v1/invocations/:id/apply": true, "GET /api/v1/invocations/:id/events": true,
	}
	for _, route := range ginApp.Routes() {
		delete(want, fmt.Sprintf("%s %s", route.Method, route.Path))
	}
	if len(want) != 0 {
		t.Fatalf("missing routes=%v", want)
	}
}
