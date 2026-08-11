package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

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

const imageCapabilityFixedScript = `场次 1，清晨，旧公交站。
林秋站在站牌下，手里捏着一张折起的车票。公交车由远及近。
林秋低声说：“这次不等了。”
她把车票收进口袋，向车门走去。`

func TestInvocationHTTPImageCapabilityProducesApprovedAssetBriefAndClientReceipt(t *testing.T) {
	app := setupInvocationHTTPRouter(t)
	fixture := createImageCapabilityFixtureSkill(t)
	ownerToken := registerAndLoginInvocationHTTPUser(t, app, "image-capability-owner")
	foreignToken := registerAndLoginInvocationHTTPUser(t, app, "image-capability-foreign")

	createdResponse := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/artifacts", ownerToken, map[string]any{
		"artifactType": "source_text", "schemaVersion": "1.0.0", "projectId": "project-image", "episodeId": "episode-image",
		"payload": map[string]any{"text": imageCapabilityFixedScript},
	})
	if createdResponse.Code != 0 {
		t.Fatalf("create source response=%s", createdResponse.Raw)
	}
	var source service.ArtifactEnvelope
	decodeInvocationHTTPData(t, createdResponse, &source)

	preflightResponse := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/invocations", ownerToken, map[string]any{
		"source": "image", "projectId": "project-image", "episodeId": "episode-image",
		"skillVersionId": fixture.Version.ID, "expectedOutputArtifactType": "asset_brief",
		"inputArtifactRefs": []map[string]any{{"bindingName": "source", "artifactId": source.Artifact.ID, "contentHash": source.Artifact.ContentHash}},
		"parameters":        map[string]any{"consumerSurface": "image"}, "idempotencyKey": "image-capability-fixed-preflight",
	})
	if preflightResponse.Code != 0 {
		t.Fatalf("preflight response=%s", preflightResponse.Raw)
	}
	var preflight service.InvocationPreflightResponse
	decodeInvocationHTTPData(t, preflightResponse, &preflight)
	if preflight.Run.Source != "image" || preflight.Run.Status != model.InvocationStatusAwaitingConfirmation || preflight.Revision.SkillVersionID != fixture.Version.ID || preflight.Revision.SkillContentHash != fixture.Version.ContentHash {
		t.Fatalf("preflight=%#v fixture=%#v", preflight, fixture.Version)
	}
	if len(preflight.InputArtifactRefs) != 1 || preflight.InputArtifactRefs[0].ArtifactID != source.Artifact.ID || preflight.InputArtifactRefs[0].ArtifactHash != source.Artifact.ContentHash {
		t.Fatalf("input refs=%#v source=%#v", preflight.InputArtifactRefs, source.Artifact)
	}
	if foreign := invocationHTTPCall(t, app, http.MethodGet, "/api/v1/invocations/"+preflight.Run.ID, foreignToken, nil); foreign.Code == 0 {
		t.Fatalf("foreign detail accepted: %s", foreign.Raw)
	}

	confirmedResponse := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/invocations/"+preflight.Run.ID+"/confirm", ownerToken, map[string]any{"requirementCodes": preflight.ConfirmationRequirements})
	if confirmedResponse.Code != 0 {
		t.Fatalf("confirm response=%s", confirmedResponse.Raw)
	}
	var confirmed service.InvocationLifecycleResponse
	decodeInvocationHTTPData(t, confirmedResponse, &confirmed)
	if confirmed.Run.Status != model.InvocationStatusQueued || confirmed.Attempt == nil || confirmed.Attempt.Attempt != 1 {
		t.Fatalf("confirmed=%#v", confirmed)
	}

	wantBrief := "林秋站在清晨的旧公交站，手持折起的车票，公交车由远及近。保留原对白：“这次不等了。”"
	rawOutput, _ := json.Marshal(map[string]any{"assetId": "lin-qiu", "brief": wantBrief, "format": "image_prompt"})
	upstreamResponse, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": string(rawOutput)}}}})
	client := &http.Client{Transport: invocationRoundTripper(func(request *http.Request) (*http.Response, error) {
		body, _ := io.ReadAll(request.Body)
		if !bytes.Contains(body, []byte("林秋")) || !bytes.Contains(body, []byte("折起的车票")) || !bytes.Contains(body, []byte("这次不等了")) {
			t.Fatalf("worker request lost fixed script details: %s", body)
		}
		return &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(bytes.NewReader(upstreamResponse)), Request: request}, nil
	})}
	worker := service.NewAgentRunWorker(service.AgentRunWorkerOptions{ID: "image-capability-e2e", LeaseDuration: time.Minute, HTTPClient: client})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}

	detailResponse := invocationHTTPCall(t, app, http.MethodGet, "/api/v1/invocations/"+preflight.Run.ID, ownerToken, nil)
	if detailResponse.Code != 0 {
		t.Fatalf("detail response=%s", detailResponse.Raw)
	}
	var detail service.InvocationDetail
	decodeInvocationHTTPData(t, detailResponse, &detail)
	if detail.Run.Status != model.InvocationStatusNeedsReview || detail.ArtifactSetHash == "" || len(detail.OutputArtifacts) != 1 {
		t.Fatalf("detail=%#v", detail)
	}
	output := detail.OutputArtifacts[0]
	if output.Artifact.ArtifactType != "asset_brief" || output.Artifact.ProducerInvocationID == nil || *output.Artifact.ProducerInvocationID != preflight.Run.ID || len(output.ParentArtifactIds) != 1 || output.ParentArtifactIds[0] != source.Artifact.ID {
		t.Fatalf("output lineage=%#v", output)
	}
	if output.Payload["assetId"] != "lin-qiu" || output.Payload["brief"] != wantBrief || output.Payload["format"] != "image_prompt" {
		t.Fatalf("output payload=%#v", output.Payload)
	}
	if !strings.Contains(output.Payload["brief"].(string), "林秋") || !strings.Contains(output.Payload["brief"].(string), "旧公交站") || !strings.Contains(output.Payload["brief"].(string), "折起的车票") || !strings.Contains(output.Payload["brief"].(string), "“这次不等了。”") {
		t.Fatalf("fixed details missing from brief: %s", output.Payload["brief"])
	}

	reviewResponse := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/invocations/"+preflight.Run.ID+"/review", ownerToken, map[string]any{
		"decision": "approved", "attempt": detail.Run.LatestAttempt, "artifactSetHash": detail.ArtifactSetHash, "comment": "固定剧本效果验收通过",
	})
	if reviewResponse.Code != 0 {
		t.Fatalf("review response=%s", reviewResponse.Raw)
	}
	var reviewed service.InvocationLifecycleResponse
	decodeInvocationHTTPData(t, reviewResponse, &reviewed)
	if reviewed.Run.Status != model.InvocationStatusApproved || reviewed.Run.ReviewedArtifactSetHash != detail.ArtifactSetHash {
		t.Fatalf("reviewed=%#v", reviewed)
	}

	applyInput := map[string]any{
		"idempotencyKey": "image-capability-apply", "attempt": detail.Run.LatestAttempt, "artifactSetHash": detail.ArtifactSetHash,
		"target": "client_local_receipt", "targetId": "image-workbench",
		"payload": map[string]any{"surface": "image", "targetKind": "prompt", "targetId": "image-workbench", "artifactIds": []string{output.Artifact.ID}},
	}
	applyResponse := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/invocations/"+preflight.Run.ID+"/apply", ownerToken, applyInput)
	if applyResponse.Code != 0 {
		t.Fatalf("apply response=%s", applyResponse.Raw)
	}
	var applied service.InvocationApplyAttemptSummary
	decodeInvocationHTTPData(t, applyResponse, &applied)
	if applied.Status != "applied" || applied.Target != "client_local_receipt" || applied.TargetID != "image-workbench" || applied.ArtifactSetHash != detail.ArtifactSetHash {
		t.Fatalf("applied=%#v", applied)
	}
	replayResponse := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/invocations/"+preflight.Run.ID+"/apply", ownerToken, applyInput)
	var replayed service.InvocationApplyAttemptSummary
	decodeInvocationHTTPData(t, replayResponse, &replayed)
	if replayResponse.Code != 0 || replayed.ID != applied.ID {
		t.Fatalf("replay=%#v raw=%s", replayed, replayResponse.Raw)
	}
	if foreign := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/invocations/"+preflight.Run.ID+"/apply", foreignToken, applyInput); foreign.Code == 0 {
		t.Fatalf("foreign apply accepted: %s", foreign.Raw)
	}
	claims, err := service.ParseToken(ownerToken)
	if err != nil {
		t.Fatal(err)
	}
	applies, err := repository.ListInvocationApplyAttempts(claims.UserID, preflight.Run.ID)
	if err != nil || len(applies) != 1 {
		t.Fatalf("apply attempts=%#v err=%v", applies, err)
	}
	var receipt map[string]any
	if json.Unmarshal([]byte(applies[0].ReceiptJSON), &receipt) != nil || receipt["surface"] != "image" || receipt["targetKind"] != "prompt" || receipt["targetId"] != "image-workbench" {
		t.Fatalf("receipt=%s", applies[0].ReceiptJSON)
	}
	receiptArtifactIDs, _ := receipt["artifactIds"].([]any)
	if len(receiptArtifactIDs) != 1 || receiptArtifactIDs[0] != output.Artifact.ID {
		t.Fatalf("receipt artifactIds=%#v", receiptArtifactIDs)
	}
}

type invocationRoundTripper func(*http.Request) (*http.Response, error)

func (transport invocationRoundTripper) RoundTrip(request *http.Request) (*http.Response, error) {
	return transport(request)
}

func createImageCapabilityFixtureSkill(t *testing.T) service.ResolvedSkill {
	t.Helper()
	packageValue := service.SkillPackage{
		Manifest: service.SkillManifest{
			Capabilities: []string{"image.prompt.prepare"}, InputArtifactTypes: []string{"source_text"}, OutputArtifactTypes: []string{"asset_brief"},
			SchemaCompatibility: map[string]string{"source_text": ">=1.0 <2.0"}, SideEffects: []string{"none"}, EstimatedCostClass: "none", ExecutorKind: "text_model", RequiredTools: []string{},
		},
		Files: map[string]string{"SKILL.md": "将输入剧本编写为可直接生图的资产提示词；必须保留角色、场景、道具和原对白。"},
		InputContract: service.SkillInputContract{
			RequiredInputs: []string{"script"}, ImagePolicy: service.SkillImagePolicy{Required: false, Min: 0, Max: 0, AllowTextFallback: true, AllowedTypes: []string{}},
			ArtifactInputs: []service.ArtifactInputSpec{{BindingName: "source", ArtifactType: "source_text", Required: true, Min: 1, Max: 1, SchemaConstraint: ">=1.0 <2.0"}},
		},
		OutputContract: service.SkillOutputContract{
			SchemaVersion: "1.0.0",
			Schema: map[string]any{
				"type": "object", "additionalProperties": false, "required": []string{"assetId", "brief", "format"},
				"properties": map[string]any{
					"assetId": map[string]any{"type": "string", "minLength": 1},
					"brief":   map[string]any{"type": "string", "minLength": 1},
					"format":  map[string]any{"type": "string", "minLength": 1},
				},
			},
			ArtifactOutputs: []service.ArtifactOutputSpec{{BindingName: "brief", ArtifactType: "asset_brief", Min: 1, Max: 1, SchemaVersion: "1.0.0"}},
		},
		QualityGateProfile: []string{"schema", "asset"},
	}
	created, err := service.CreateSystemSkill("fixture-admin", "图片资产提示词", "固定剧本 HTTP E2E", service.SkillDraftInput{Version: "1.0.0", Package: packageValue})
	if err != nil {
		t.Fatal(err)
	}
	published, err := service.PublishSkillVersion("fixture-admin", created.Version.ID)
	if err != nil {
		t.Fatal(err)
	}
	recommended, err := service.RecommendPublishedSkillVersion("fixture-admin", published.Skill.ID, published.Version.ID)
	if err != nil {
		t.Fatal(err)
	}
	return recommended
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
