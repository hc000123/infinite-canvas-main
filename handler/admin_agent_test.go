package handler_test

import (
	"net/http"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/basketikun/infinite-canvas/service"
)

func TestAdminSystemAgentHTTPLifecycle(t *testing.T) {
	app := setupInvocationHTTPRouter(t)
	if err := service.EnsureAgentSeeds(); err != nil {
		t.Fatal(err)
	}
	adminToken := registerAndLoginInvocationHTTPUser(t, app, "agent-admin")
	admin, ok, err := repository.GetUserByUsername("agent-admin")
	if err != nil || !ok {
		t.Fatalf("admin=%#v ok=%v err=%v", admin, ok, err)
	}
	admin.Role = model.UserRoleAdmin
	if _, err := repository.SaveUser(admin); err != nil {
		t.Fatal(err)
	}
	userToken := registerAndLoginInvocationHTTPUser(t, app, "agent-maker")
	if response := invocationHTTPCall(t, app, http.MethodGet, "/api/v1/admin/agents", userToken, nil); response.Code == 0 {
		t.Fatalf("ordinary user listed system Agents: %s", response.Raw)
	}

	listed := invocationHTTPCall(t, app, http.MethodGet, "/api/v1/admin/agents", adminToken, nil)
	if listed.Code != 0 {
		t.Fatalf("list response=%s", listed.Raw)
	}
	var items []service.AgentRegistryItem
	decodeInvocationHTTPData(t, listed, &items)
	var script service.AgentRegistryItem
	for _, item := range items {
		if item.Agent.ID == "agent-system-script" {
			script = item
		}
	}
	if script.RecommendedPackage == nil {
		t.Fatal("script Agent has no recommended package")
	}
	packageValue := *script.RecommendedPackage
	packageValue.RolePrompt += "\nHTTP 管理员版本。"
	packageValue.ContentHash = ""
	created := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/admin/agents/"+script.Agent.ID+"/versions", adminToken, service.AgentDraftInput{Version: "1.0.1", Package: packageValue})
	if created.Code != 0 {
		t.Fatalf("create response=%s", created.Raw)
	}
	var version model.AgentVersion
	decodeInvocationHTTPData(t, created, &version)
	validated := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/admin/agent-versions/"+version.ID+"/validate", adminToken, map[string]any{})
	if validated.Code != 0 {
		t.Fatalf("validate response=%s", validated.Raw)
	}
	published := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/admin/agent-versions/"+version.ID+"/publish", adminToken, map[string]any{})
	if published.Code != 0 {
		t.Fatalf("publish response=%s", published.Raw)
	}
	recommended := invocationHTTPCall(t, app, http.MethodPut, "/api/v1/admin/agents/"+script.Agent.ID+"/recommended-version", adminToken, map[string]any{"agentVersionId": version.ID})
	if recommended.Code != 0 {
		t.Fatalf("recommend response=%s", recommended.Raw)
	}
	detail := invocationHTTPCall(t, app, http.MethodGet, "/api/v1/admin/agent-versions/"+version.ID, adminToken, nil)
	if detail.Code != 0 {
		t.Fatalf("detail response=%s", detail.Raw)
	}
}
