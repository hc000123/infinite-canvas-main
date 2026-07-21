package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/basketikun/infinite-canvas/service"
)

func TestEnsureWorkflowRunReturnsStandardResponse(t *testing.T) {
	setupWorkflowHandlerTestDB(t)
	request := httptest.NewRequest(http.MethodPost, "/api/v1/workflow-runs", strings.NewReader(`{"projectId":"project-1","episodeId":"episode-1","scriptSnapshot":"第一场","scriptConfirmed":true}`))
	request = request.WithContext(service.WithUser(context.Background(), model.AuthUser{ID: "user-1", Role: model.UserRoleUser}))
	recorder := httptest.NewRecorder()

	EnsureWorkflowRun(recorder, request)

	var payload struct {
		Code int             `json:"code"`
		Data json.RawMessage `json:"data"`
		Msg  string          `json:"msg"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("response json error: %v", err)
	}
	if payload.Code != 0 || payload.Msg != "ok" || len(payload.Data) == 0 {
		t.Fatalf("payload=%#v", payload)
	}
}

func TestWorkflowRunDoesNotExposeAnotherUserRecord(t *testing.T) {
	setupWorkflowHandlerTestDB(t)
	detail, err := service.EnsureWorkflowRun("user-owner", service.EnsureWorkflowRunInput{ProjectID: "project-1", EpisodeID: "episode-1", ScriptSnapshot: "第一场", ScriptConfirmed: true})
	if err != nil {
		t.Fatalf("EnsureWorkflowRun returned error: %v", err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/v1/workflow-runs/"+detail.Run.ID, nil)
	request = request.WithContext(service.WithUser(context.Background(), model.AuthUser{ID: "user-other", Role: model.UserRoleUser}))
	recorder := httptest.NewRecorder()

	WorkflowRun(recorder, request, detail.Run.ID)

	if !strings.Contains(recorder.Body.String(), `"code":1`) || !strings.Contains(recorder.Body.String(), "工作流不存在") {
		t.Fatalf("body=%s", recorder.Body.String())
	}
	if strings.Contains(recorder.Body.String(), "scriptSnapshot") {
		t.Fatalf("response leaked owner workflow: %s", recorder.Body.String())
	}
}

func setupWorkflowHandlerTestDB(t *testing.T) {
	t.Helper()
	oldDriver := config.Cfg.StorageDriver
	oldDSN := config.Cfg.DatabaseDSN
	config.Cfg.StorageDriver = "sqlite"
	config.Cfg.DatabaseDSN = filepath.Join(t.TempDir(), "handler.db")
	repository.ResetForTest()
	t.Cleanup(func() {
		config.Cfg.StorageDriver = oldDriver
		config.Cfg.DatabaseDSN = oldDSN
		repository.ResetForTest()
	})
}
