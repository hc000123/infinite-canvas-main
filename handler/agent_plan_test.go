package handler_test

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
	"github.com/gin-gonic/gin"
)

func TestAgentPlanHTTPRunsAuthenticatedPlanThroughRealRouter(t *testing.T) {
	app := setupInvocationHTTPRouter(t)
	if err := service.EnsureAgentSeeds(); err != nil {
		t.Fatal(err)
	}
	ownerToken := registerAndLoginInvocationHTTPUser(t, app, "agent-plan-owner")
	strangerToken := registerAndLoginInvocationHTTPUser(t, app, "agent-plan-stranger")

	createdArtifact := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/artifacts", ownerToken, map[string]any{
		"artifactType": "source_text", "schemaVersion": "1.0.0", "projectId": "project-http", "episodeId": "episode-http",
		"payload": map[string]any{"text": "HTTP 原始剧本"},
	})
	if createdArtifact.Code != 0 {
		t.Fatalf("create Artifact response=%s", createdArtifact.Raw)
	}
	var artifact service.ArtifactEnvelope
	decodeInvocationHTTPData(t, createdArtifact, &artifact)

	createBody := map[string]any{
		"projectId": "project-http", "episodeId": "episode-http",
		"agentId": "agent-system-preproduction", "agentVersionId": "agent-version-system-preproduction-1.0.0",
		"goal": "先优化剧本，再提取资产", "idempotencyKey": "agent-plan-http-secret-key",
		"sourceArtifactRefs": []map[string]any{{"bindingName": "source_text", "artifactId": artifact.Artifact.ID, "contentHash": artifact.Artifact.ContentHash}},
	}
	created := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/agent-plans", ownerToken, createBody)
	if created.Code != 0 {
		t.Fatalf("create Plan response=%s", created.Raw)
	}
	var plan service.AgentPlanDetail
	decodeInvocationHTTPData(t, created, &plan)
	if plan.Plan.Status != model.AgentPlanDraft || plan.Plan.CurrentRevision != 1 || len(plan.Steps) != 2 {
		t.Fatalf("plan=%#v", plan)
	}
	for _, forbidden := range []string{"agent-plan-http-secret-key", "requestHash", "sourceArtifactRefsJson", "planSnapshotJson", "inputBindingsJson", "parametersJson"} {
		if strings.Contains(created.Raw, forbidden) {
			t.Fatalf("create exposed %q: %s", forbidden, created.Raw)
		}
	}
	revised := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/agent-plans/"+plan.Plan.ID+"/revisions", ownerToken, map[string]any{
		"agentVersionId": plan.Plan.AgentVersionID, "goal": "先优化剧本，再提取完整资产",
		"sourceArtifactRefs": createBody["sourceArtifactRefs"],
	})
	if revised.Code != 0 {
		t.Fatalf("revision response=%s", revised.Raw)
	}
	decodeInvocationHTTPData(t, revised, &plan)
	if plan.Plan.CurrentRevision != 2 || plan.Plan.Status != model.AgentPlanDraft || plan.Plan.Goal != "先优化剧本，再提取完整资产" {
		t.Fatalf("revised plan=%#v", plan)
	}

	ownerDetail := invocationHTTPCall(t, app, http.MethodGet, "/api/v1/agent-plans/"+plan.Plan.ID, ownerToken, nil)
	if ownerDetail.Code != 0 {
		t.Fatalf("owner detail response=%s", ownerDetail.Raw)
	}
	strangerDetail := invocationHTTPCall(t, app, http.MethodGet, "/api/v1/agent-plans/"+plan.Plan.ID, strangerToken, nil)
	if strangerDetail.Code == 0 {
		t.Fatalf("stranger detail succeeded: %s", strangerDetail.Raw)
	}

	preflightResponse := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/agent-plans/"+plan.Plan.ID+"/preflight", ownerToken, nil)
	if preflightResponse.Code != 0 {
		t.Fatalf("preflight response=%s", preflightResponse.Raw)
	}
	var preflight service.AgentPlanPreflightResult
	decodeInvocationHTTPData(t, preflightResponse, &preflight)
	if preflight.Plan.Status != model.AgentPlanAwaitingConfirmation || preflight.Plan.ConfirmationFingerprint == "" || len(preflight.ConfirmationRequirements) == 0 {
		t.Fatalf("preflight=%#v", preflight)
	}
	codes := make([]string, 0, len(preflight.ConfirmationRequirements))
	for _, requirement := range preflight.ConfirmationRequirements {
		codes = append(codes, requirement.Code)
	}

	for name, body := range map[string]map[string]any{
		"wrong fingerprint": {"revision": 2, "fingerprint": "sha256:wrong", "requirementCodes": codes},
		"stale revision":    {"revision": 1, "fingerprint": preflight.Plan.ConfirmationFingerprint, "requirementCodes": codes},
	} {
		response := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/agent-plans/"+plan.Plan.ID+"/confirm", ownerToken, body)
		if response.Code == 0 {
			t.Fatalf("%s confirmation succeeded: %s", name, response.Raw)
		}
	}
	confirmed := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/agent-plans/"+plan.Plan.ID+"/confirm", ownerToken, map[string]any{
		"revision": 2, "fingerprint": preflight.Plan.ConfirmationFingerprint, "requirementCodes": codes,
	})
	if confirmed.Code != 0 {
		t.Fatalf("confirm response=%s", confirmed.Raw)
	}

	continued := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/agent-plans/"+plan.Plan.ID+"/continue", ownerToken, nil)
	if continued.Code != 0 {
		t.Fatalf("continue response=%s", continued.Raw)
	}
	var first service.AgentPlanContinueResult
	decodeInvocationHTTPData(t, continued, &first)
	if first.Invocation == nil || first.Invocation.Run.Status != model.InvocationStatusQueued || first.Invocation.Run.AgentPlanID != plan.Plan.ID {
		t.Fatalf("continued=%#v", first)
	}
	replayed := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/agent-plans/"+plan.Plan.ID+"/continue", ownerToken, nil)
	var replay service.AgentPlanContinueResult
	decodeInvocationHTTPData(t, replayed, &replay)
	if replayed.Code != 0 || replay.Invocation == nil || replay.Invocation.Run.ID != first.Invocation.Run.ID {
		t.Fatalf("replay=%#v raw=%s", replay, replayed.Raw)
	}
	if response := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/agent-plans/"+plan.Plan.ID+"/continue", strangerToken, nil); response.Code == 0 {
		t.Fatalf("stranger continue succeeded: %s", response.Raw)
	}

	cancelled := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/agent-plans/"+plan.Plan.ID+"/cancel", ownerToken, nil)
	var cancelledPlan service.AgentPlanDetail
	decodeInvocationHTTPData(t, cancelled, &cancelledPlan)
	if cancelled.Code != 0 || cancelledPlan.Plan.Status != model.AgentPlanCancelled {
		t.Fatalf("cancelled=%#v raw=%s", cancelledPlan, cancelled.Raw)
	}
}

func TestAgentPlanHTTPRegistersSevenRoutes(t *testing.T) {
	app := setupInvocationHTTPRouter(t)
	ginApp, ok := app.(*gin.Engine)
	if !ok {
		t.Fatalf("router type=%T", app)
	}
	want := map[string]bool{
		"POST /api/v1/agent-plans": true, "GET /api/v1/agent-plans/:id": true,
		"POST /api/v1/agent-plans/:id/revisions": true, "POST /api/v1/agent-plans/:id/preflight": true,
		"POST /api/v1/agent-plans/:id/confirm": true, "POST /api/v1/agent-plans/:id/continue": true,
		"POST /api/v1/agent-plans/:id/cancel": true,
	}
	for _, route := range ginApp.Routes() {
		delete(want, fmt.Sprintf("%s %s", route.Method, route.Path))
	}
	if len(want) != 0 {
		t.Fatalf("missing routes=%v", want)
	}
}
