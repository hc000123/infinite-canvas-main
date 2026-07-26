package handler_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

func TestWorkflowRegistryHTTPCRUDPreviewExecutionAndIsolation(t *testing.T) {
	app := setupInvocationHTTPRouter(t)
	ownerToken := registerAndLoginInvocationHTTPUser(t, app, "workflow-registry-owner")
	strangerToken := registerAndLoginInvocationHTTPUser(t, app, "workflow-registry-stranger")

	unknown := workflowRegistryHTTPCreateBody()
	unknown["storedSnapshot"] = true
	if response := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/workflows", ownerToken, unknown); response.Code == 0 {
		t.Fatalf("unknown create field accepted: %s", response.Raw)
	}
	createdResponse := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/workflows", ownerToken, workflowRegistryHTTPCreateBody())
	if createdResponse.Code != 0 {
		t.Fatalf("create response=%s", createdResponse.Raw)
	}
	var created service.WorkflowVersionDetail
	decodeInvocationHTTPData(t, createdResponse, &created)
	if created.Workflow.OwnerType != model.WorkflowOwnerProject || created.Version.Status != model.WorkflowVersionDraft || len(created.Package.Nodes) != 1 {
		t.Fatalf("created=%#v", created)
	}
	assertWorkflowHTTPResponseSafe(t, createdResponse.Raw)

	for _, target := range []string{
		"/api/v1/workflows?projectId=project-http",
		"/api/v1/workflows/" + created.Workflow.ID + "?projectId=project-http",
		"/api/v1/workflow-versions/" + created.Version.ID,
	} {
		response := invocationHTTPCall(t, app, http.MethodGet, target, ownerToken, nil)
		if response.Code != 0 || !strings.Contains(response.Raw, created.Workflow.ID) {
			t.Fatalf("owner GET %s response=%s", target, response.Raw)
		}
		assertWorkflowHTTPResponseSafe(t, response.Raw)
	}

	updatedBody := workflowRegistryHTTPDraftBody("1.0.0")
	updatedBody["package"].(map[string]any)["nodes"].([]map[string]any)[0]["name"] = "生产剧本优化"
	updated := invocationHTTPCall(t, app, http.MethodPatch, "/api/v1/workflow-versions/"+created.Version.ID, ownerToken, updatedBody)
	if updated.Code != 0 {
		t.Fatalf("update response=%s", updated.Raw)
	}
	validated := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/workflow-versions/"+created.Version.ID+"/validate", ownerToken, nil)
	if validated.Code != 0 || !strings.Contains(validated.Raw, "skill-version-system-workflow-script-3.1.0") {
		t.Fatalf("validate response=%s", validated.Raw)
	}
	published := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/workflow-versions/"+created.Version.ID+"/publish", ownerToken, nil)
	if published.Code != 0 || !strings.Contains(published.Raw, `"status":"published"`) {
		t.Fatalf("publish response=%s", published.Raw)
	}
	recommended := invocationHTTPCall(t, app, http.MethodPut, "/api/v1/workflows/"+created.Workflow.ID+"/recommended-version", ownerToken, map[string]any{"workflowVersionId": created.Version.ID})
	if recommended.Code != 0 {
		t.Fatalf("recommend response=%s", recommended.Raw)
	}
	if wrong := invocationHTTPCall(t, app, http.MethodPut, "/api/v1/workflows/"+created.Workflow.ID+"/recommended-version", ownerToken, map[string]any{"agentVersionId": created.Version.ID}); wrong.Code == 0 {
		t.Fatalf("wrong recommendation field accepted: %s", wrong.Raw)
	}

	copyResponse := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/workflows/"+created.Workflow.ID+"/copy", ownerToken, map[string]any{"projectId": "project-http", "name": "复制流程"})
	if copyResponse.Code != 0 || !strings.Contains(copyResponse.Raw, "复制流程") {
		t.Fatalf("copy response=%s", copyResponse.Raw)
	}
	newDraft := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/workflows/"+created.Workflow.ID+"/versions", ownerToken, workflowRegistryHTTPDraftBody("1.1.0"))
	if newDraft.Code != 0 || !strings.Contains(newDraft.Raw, `"version":"1.1.0"`) {
		t.Fatalf("new draft response=%s", newDraft.Raw)
	}

	artifactResponse := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/artifacts", ownerToken, map[string]any{
		"artifactType": "source_text", "schemaVersion": "1.0.0", "projectId": "project-http", "episodeId": "episode-http", "payload": map[string]any{"text": "清晨，林秋站在旧公交站。"},
	})
	if artifactResponse.Code != 0 {
		t.Fatalf("artifact response=%s", artifactResponse.Raw)
	}
	var artifact service.ArtifactEnvelope
	decodeInvocationHTTPData(t, artifactResponse, &artifact)
	previewBody := map[string]any{
		"projectId": "project-http", "episodeId": "episode-http",
		"inputArtifactRefs": []map[string]any{{"bindingName": "source", "artifactId": artifact.Artifact.ID, "contentHash": artifact.Artifact.ContentHash}},
		"manualSelections":  map[string]any{}, "projectTags": []string{"short_drama"}, "parameters": map[string]any{"format": "9:16"},
	}
	preview := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/workflow-versions/"+created.Version.ID+"/preview", ownerToken, previewBody)
	if preview.Code != 0 || !strings.Contains(preview.Raw, created.Version.ID) || strings.Contains(preview.Raw, "selectedChannelId") {
		t.Fatalf("preview response=%s", preview.Raw)
	}

	preflightBody := map[string]any{}
	for key, value := range previewBody {
		preflightBody[key] = value
	}
	preflightBody["workflowVersionId"] = created.Version.ID
	preflightBody["idempotencyKey"] = "workflow-http-execution-1"
	preflightResponse := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/workflow-executions/preflight", ownerToken, preflightBody)
	if preflightResponse.Code != 0 || !strings.Contains(preflightResponse.Raw, `"parameters":{"format":"9:16"}`) || !strings.Contains(preflightResponse.Raw, `"inputArtifactRefs"`) {
		t.Fatalf("preflight response=%s", preflightResponse.Raw)
	}
	assertWorkflowHTTPResponseSafe(t, preflightResponse.Raw)
	var preflight service.WorkflowExecutionResponse
	decodeInvocationHTTPData(t, preflightResponse, &preflight)
	confirmed := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/workflow-executions/"+preflight.Run.ID+"/confirm", ownerToken, map[string]any{
		"revision": preflight.Run.Revision, "fingerprint": preflight.Run.ConfirmationFingerprint, "requirementCodes": preflight.ConfirmationRequirements,
	})
	if confirmed.Code != 0 || !strings.Contains(confirmed.Raw, `"invocationId":"invocation-`) {
		t.Fatalf("confirm response=%s", confirmed.Raw)
	}
	detail := invocationHTTPCall(t, app, http.MethodGet, "/api/v1/workflow-executions/"+preflight.Run.ID, ownerToken, nil)
	if detail.Code != 0 {
		t.Fatalf("execution detail=%s", detail.Raw)
	}
	continued := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/workflow-executions/"+preflight.Run.ID+"/continue", ownerToken, nil)
	if continued.Code != 0 {
		t.Fatalf("continue response=%s", continued.Raw)
	}
	cancelled := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/workflow-executions/"+preflight.Run.ID+"/cancel", ownerToken, nil)
	if cancelled.Code != 0 || !strings.Contains(cancelled.Raw, `"status":"cancelled"`) {
		t.Fatalf("cancel response=%s", cancelled.Raw)
	}

	for _, request := range []struct {
		method, target string
		body           any
	}{
		{http.MethodGet, "/api/v1/workflows/" + created.Workflow.ID + "?projectId=project-http", nil},
		{http.MethodGet, "/api/v1/workflow-versions/" + created.Version.ID, nil},
		{http.MethodPost, "/api/v1/workflow-versions/" + created.Version.ID + "/preview", previewBody},
		{http.MethodGet, "/api/v1/workflow-executions/" + preflight.Run.ID, nil},
	} {
		response := invocationHTTPCall(t, app, request.method, request.target, strangerToken, request.body)
		if response.Code == 0 {
			t.Fatalf("stranger %s %s succeeded: %s", request.method, request.target, response.Raw)
		}
	}
}

func workflowRegistryHTTPCreateBody() map[string]any {
	body := workflowRegistryHTTPDraftBody("1.0.0")
	body["projectId"], body["name"], body["summary"], body["tags"] = "project-http", "HTTP 制作流程", "可组合流程测试", []string{"short_drama"}
	return body
}

func workflowRegistryHTTPDraftBody(version string) map[string]any {
	return map[string]any{"version": version, "package": map[string]any{
		"inputArtifactTypes": []string{"source_text"},
		"nodes": []map[string]any{{
			"nodeKey": "script", "name": "剧本优化", "executorType": "skill", "outputArtifactType": "production_script",
			"skillBinding":  map[string]any{"mode": "fixed", "skillId": "skill-system-workflow-script", "skillVersionId": "skill-version-system-workflow-script-3.1.0", "projectTags": []string{}, "candidateSkillIds": []string{}},
			"inputBindings": []map[string]any{{"bindingName": "source_text", "artifactType": "source_text", "source": "workflow_input", "workflowInputName": "source", "required": true}},
			"dependsOn":     []string{}, "confirmationPolicy": map[string]any{}, "retryPolicy": map[string]any{"maxAttempts": 2},
		}},
	}}
}

func assertWorkflowHTTPResponseSafe(t *testing.T, raw string) {
	t.Helper()
	for _, forbidden := range []string{"packageJSON", "tagsJSON", "routePreviewJSON", "inputArtifactRefsJSON", "manualSelectionsJSON", "parametersJSON", "confirmationRequirementsJSON", "outputArtifactRefsJSON", "idempotencyKey", "requestHash", "skillSnapshot", "agentContent"} {
		if strings.Contains(raw, forbidden) {
			t.Fatalf("response exposed %q: %s", forbidden, raw)
		}
	}
}
