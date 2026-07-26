package handler_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

func TestAgentRegistryHTTPIsolatesProjectOwners(t *testing.T) {
	app := setupInvocationHTTPRouter(t)
	ownerToken := registerAndLoginInvocationHTTPUser(t, app, "agent-registry-owner")
	strangerToken := registerAndLoginInvocationHTTPUser(t, app, "agent-registry-stranger")
	body := agentRegistryHTTPCreateBody()

	createdResponse := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/agents", ownerToken, body)
	if createdResponse.Code != 0 || createdResponse.Msg != "ok" {
		t.Fatalf("create response=%s", createdResponse.Raw)
	}
	var created service.AgentVersionDetail
	decodeInvocationHTTPData(t, createdResponse, &created)
	if created.Agent.OwnerType != model.AgentOwnerProject || created.Agent.OwnerProjectID != "project-http" || created.Version.Status != model.AgentVersionDraft {
		t.Fatalf("created=%#v", created)
	}
	versionDetail := invocationHTTPCall(t, app, http.MethodGet, "/api/v1/agent-versions/"+created.Version.ID, ownerToken, nil)
	if versionDetail.Code != 0 || !strings.Contains(versionDetail.Raw, "负责按顺序调度已发布 Skill") {
		t.Fatalf("version detail response=%s", versionDetail.Raw)
	}
	for _, forbidden := range []string{"defaultSkillRefsJSON", "skillAccessPolicyJSON", "modelPolicyJSON", "toolPolicyJSON", "executionPolicyJSON"} {
		if strings.Contains(createdResponse.Raw, forbidden) {
			t.Fatalf("create exposed persistence field %q: %s", forbidden, createdResponse.Raw)
		}
	}

	listResponse := invocationHTTPCall(t, app, http.MethodGet, "/api/v1/agents?projectId=project-http", ownerToken, nil)
	if listResponse.Code != 0 || !strings.Contains(listResponse.Raw, created.Agent.ID) {
		t.Fatalf("owner list response=%s", listResponse.Raw)
	}
	detailResponse := invocationHTTPCall(t, app, http.MethodGet, "/api/v1/agents/"+created.Agent.ID+"?projectId=project-http", ownerToken, nil)
	if detailResponse.Code != 0 {
		t.Fatalf("owner detail response=%s", detailResponse.Raw)
	}

	for _, request := range []struct {
		method string
		target string
		body   any
	}{
		{http.MethodGet, "/api/v1/agents/" + created.Agent.ID + "?projectId=project-http", nil},
		{http.MethodGet, "/api/v1/agent-versions/" + created.Version.ID, nil},
		{http.MethodPatch, "/api/v1/agent-versions/" + created.Version.ID, map[string]any{"version": "1.0.0", "package": body["package"]}},
		{http.MethodPost, "/api/v1/agent-versions/" + created.Version.ID + "/validate", map[string]any{}},
		{http.MethodPost, "/api/v1/agent-versions/" + created.Version.ID + "/publish", map[string]any{}},
	} {
		response := invocationHTTPCall(t, app, request.method, request.target, strangerToken, request.body)
		if response.Code == 0 {
			t.Fatalf("stranger %s %s succeeded: %s", request.method, request.target, response.Raw)
		}
	}

	validated := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/agent-versions/"+created.Version.ID+"/validate", ownerToken, map[string]any{})
	if validated.Code != 0 || !strings.Contains(validated.Raw, "skill-version-system-workflow-script-3.1.0") {
		t.Fatalf("validate response=%s", validated.Raw)
	}
	published := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/agent-versions/"+created.Version.ID+"/publish", ownerToken, map[string]any{})
	if published.Code != 0 || !strings.Contains(published.Raw, `"status":"published"`) {
		t.Fatalf("publish response=%s", published.Raw)
	}
	recommended := invocationHTTPCall(t, app, http.MethodPut, "/api/v1/agents/"+created.Agent.ID+"/recommended-version", ownerToken, map[string]any{"skillVersionId": created.Version.ID})
	if recommended.Code == 0 {
		t.Fatal("recommend accepted the Skill field name instead of agentVersionId")
	}
	recommended = invocationHTTPCall(t, app, http.MethodPut, "/api/v1/agents/"+created.Agent.ID+"/recommended-version", ownerToken, map[string]any{"agentVersionId": created.Version.ID})
	if recommended.Code != 0 || !strings.Contains(recommended.Raw, created.Version.ID) {
		t.Fatalf("recommend response=%s", recommended.Raw)
	}
}

func agentRegistryHTTPCreateBody() map[string]any {
	return map[string]any{
		"projectId": "project-http", "name": "HTTP 前期制作", "summary": "认证 Agent Registry 测试", "tags": []string{"script"}, "version": "1.0.0",
		"package": map[string]any{
			"rolePrompt": "负责按顺序调度已发布 Skill。", "plannerMode": "configured_chain",
			"defaultSkillRefs": []map[string]any{{
				"stepKey": "script", "label": "剧本整理", "capability": "workflow.stage.script",
				"skillId": "skill-system-workflow-script", "skillVersionId": "skill-version-system-workflow-script-3.1.0",
				"required": true, "parameters": map[string]any{}, "expectedOutputType": "production_script",
			}},
			"skillAccessPolicy": map[string]any{
				"allowedSkillIds": []string{"skill-system-workflow-script"}, "allowedCapabilities": []string{"workflow.stage.script"}, "allowedOwnerTypes": []string{"system"},
			},
			"modelPolicy": map[string]any{}, "toolPolicy": map[string]any{"allowedTools": []string{}}, "executionPolicy": map[string]any{"maxSteps": 1},
		},
	}
}
