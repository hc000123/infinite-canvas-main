package handler_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func TestAgentPlanProcessSmokeRejectsBadConfirmationWithoutCost(t *testing.T) {
	tempDir := t.TempDir()
	binaryPath := filepath.Join(tempDir, "infinite-canvas-test-server")
	build := exec.Command("go", "build", "-o", binaryPath, "..")
	build.Dir = "."
	if output, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build backend: %v\n%s", err, output)
	}
	port := freeAgentPlanProcessPort(t)
	databasePath := filepath.Join(tempDir, "process-smoke.db")
	assetDir := filepath.Join(tempDir, "assets")
	if err := os.MkdirAll(assetDir, 0o755); err != nil {
		t.Fatal(err)
	}

	var processLog bytes.Buffer
	command := exec.Command(binaryPath)
	command.Dir = tempDir
	command.Env = append(os.Environ(),
		"PORT="+port,
		"STORAGE_DRIVER=sqlite",
		"DATABASE_DSN="+databasePath,
		"PUBLIC_ASSET_DIR="+assetDir,
		"WORKFLOW_WORKER_ENABLED=false",
		"ADMIN_USERNAME=process-admin",
		"ADMIN_PASSWORD=process-password-123",
		"JWT_SECRET=process-smoke-secret",
	)
	command.Stdout, command.Stderr = &processLog, &processLog
	if err := command.Start(); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- command.Wait() }()
	stopped := false
	stop := func() {
		if stopped {
			return
		}
		stopped = true
		_ = command.Process.Signal(os.Interrupt)
		select {
		case <-done:
		case <-time.After(5 * time.Second):
			_ = command.Process.Kill()
			<-done
		}
	}
	t.Cleanup(stop)

	baseURL := "http://127.0.0.1:" + port
	waitAgentPlanProcessHealth(t, baseURL, done, &processLog)
	adminLogin := agentPlanProcessCall(t, baseURL, http.MethodPost, "/api/admin/login", "", map[string]any{"username": "process-admin", "password": "process-password-123"})
	if adminLogin.Code != 0 {
		t.Fatalf("admin login=%s", adminLogin.Raw)
	}
	var adminSession model.AuthSession
	decodeAgentPlanProcessData(t, adminLogin, &adminSession)
	allowRegister := true
	settings := model.Settings{
		Public: model.PublicSetting{
			Auth: model.PublicAuthSetting{AllowRegister: &allowRegister},
			ModelChannel: model.PublicModelChannelSetting{
				AvailableModels: []string{"text-test"}, DefaultTextModel: "text-test",
			},
		},
		Private: model.PrivateSetting{Channels: []model.ModelChannel{{
			ID: "process-text", Protocol: string(model.ModelProtocolOpenAI), Name: "process-smoke", BaseURL: "https://example.invalid/v1", APIKey: "never-called", Models: []string{"text-test"}, Capabilities: []string{"text"}, Enabled: true,
		}}},
	}
	if response := agentPlanProcessCall(t, baseURL, http.MethodPost, "/api/admin/settings", adminSession.Token, settings); response.Code != 0 {
		t.Fatalf("save settings=%s", response.Raw)
	}

	username, password := "process-plan-user", "password-123"
	if response := agentPlanProcessCall(t, baseURL, http.MethodPost, "/api/auth/register", "", map[string]any{"username": username, "password": password}); response.Code != 0 {
		t.Fatalf("register=%s", response.Raw)
	}
	login := agentPlanProcessCall(t, baseURL, http.MethodPost, "/api/auth/login", "", map[string]any{"username": username, "password": password})
	if login.Code != 0 {
		t.Fatalf("login=%s", login.Raw)
	}
	var loginResult model.LoginResult
	decodeAgentPlanProcessData(t, login, &loginResult)
	userToken := loginResult.Session.Token

	artifactResponse := agentPlanProcessCall(t, baseURL, http.MethodPost, "/api/v1/artifacts", userToken, map[string]any{
		"artifactType": "source_text", "schemaVersion": "1.0.0", "projectId": "process-project", "episodeId": "process-episode", "payload": map[string]any{"text": "雨夜里，顾川醒来发现自己回到了十年前。"},
	})
	if artifactResponse.Code != 0 {
		t.Fatalf("create Artifact=%s", artifactResponse.Raw)
	}
	var artifact service.ArtifactEnvelope
	decodeAgentPlanProcessData(t, artifactResponse, &artifact)
	planResponse := agentPlanProcessCall(t, baseURL, http.MethodPost, "/api/v1/agent-plans", userToken, map[string]any{
		"projectId": "process-project", "episodeId": "process-episode", "agentId": "agent-system-preproduction", "agentVersionId": "agent-version-system-preproduction-1.0.0",
		"goal": "优化剧本并提取资产", "idempotencyKey": "process-smoke-plan", "sourceArtifactRefs": []map[string]any{{"bindingName": "source_text", "artifactId": artifact.Artifact.ID, "contentHash": artifact.Artifact.ContentHash}},
	})
	if planResponse.Code != 0 {
		t.Fatalf("create Plan=%s", planResponse.Raw)
	}
	var plan service.AgentPlanDetail
	decodeAgentPlanProcessData(t, planResponse, &plan)
	preflightResponse := agentPlanProcessCall(t, baseURL, http.MethodPost, "/api/v1/agent-plans/"+plan.Plan.ID+"/preflight", userToken, nil)
	if preflightResponse.Code != 0 {
		t.Fatalf("preflight=%s", preflightResponse.Raw)
	}
	var preflight service.AgentPlanPreflightResult
	decodeAgentPlanProcessData(t, preflightResponse, &preflight)
	codes := make([]string, 0, len(preflight.ConfirmationRequirements))
	for _, requirement := range preflight.ConfirmationRequirements {
		codes = append(codes, requirement.Code)
	}
	badConfirm := agentPlanProcessCall(t, baseURL, http.MethodPost, "/api/v1/agent-plans/"+plan.Plan.ID+"/confirm", userToken, map[string]any{
		"revision": preflight.Plan.CurrentRevision, "fingerprint": "sha256:intentionally-wrong", "requirementCodes": codes,
	})
	if badConfirm.Code == 0 {
		t.Fatalf("bad confirmation succeeded: %s", badConfirm.Raw)
	}
	stop()

	database, err := gorm.Open(sqlite.Open(databasePath), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	var agentRuns, creditLogs, invocations int64
	if err := database.Model(&model.AgentRun{}).Count(&agentRuns).Error; err != nil {
		t.Fatal(err)
	}
	if err := database.Model(&model.CreditLog{}).Count(&creditLogs).Error; err != nil {
		t.Fatal(err)
	}
	if err := database.Model(&model.InvocationRun{}).Count(&invocations).Error; err != nil {
		t.Fatal(err)
	}
	if agentRuns != 0 || creditLogs != 0 || invocations != 0 {
		t.Fatalf("bad confirmation created work or cost: AgentRuns=%d invocations=%d creditLogs=%d", agentRuns, invocations, creditLogs)
	}
}

func freeAgentPlanProcessPort(t *testing.T) string {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	return fmt.Sprint(listener.Addr().(*net.TCPAddr).Port)
}

func waitAgentPlanProcessHealth(t *testing.T, baseURL string, done <-chan error, processLog *bytes.Buffer) {
	t.Helper()
	deadline := time.Now().Add(20 * time.Second)
	for time.Now().Before(deadline) {
		select {
		case err := <-done:
			t.Fatalf("backend exited before health check: %v\n%s", err, processLog.String())
		default:
		}
		response, err := http.Get(baseURL + "/api/health")
		if err == nil {
			_ = response.Body.Close()
			if response.StatusCode == http.StatusOK {
				return
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("backend did not become healthy\n%s", processLog.String())
}

func agentPlanProcessCall(t *testing.T, baseURL, method, path, token string, body any) invocationHTTPResponse {
	t.Helper()
	var encoded []byte
	if body != nil {
		var err error
		encoded, err = json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
	}
	request, err := http.NewRequest(method, baseURL+path, bytes.NewReader(encoded))
	if err != nil {
		t.Fatal(err)
	}
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	var result invocationHTTPResponse
	decoder := json.NewDecoder(response.Body)
	if err := decoder.Decode(&result); err != nil {
		t.Fatalf("%s %s returned HTTP %d without envelope: %v", method, path, response.StatusCode, err)
	}
	raw, _ := json.Marshal(result)
	result.Raw = string(raw)
	if response.StatusCode != http.StatusOK {
		t.Fatalf("%s %s returned HTTP %d: %s", method, path, response.StatusCode, result.Raw)
	}
	return result
}

func decodeAgentPlanProcessData(t *testing.T, response invocationHTTPResponse, target any) {
	t.Helper()
	if err := json.Unmarshal(response.Data, target); err != nil {
		t.Fatalf("decode %s: %v", response.Raw, err)
	}
}
