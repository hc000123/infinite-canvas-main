package handler

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/basketikun/infinite-canvas/service"
)

func TestUserJimengLoginHandlersUseAuthenticatedUserHome(t *testing.T) {
	setupAIHandlerTestDB(t)
	root := filepath.Join(t.TempDir(), "dreamina-home")
	t.Setenv("DREAMINA_HOME", root)
	logPath := filepath.Join(t.TempDir(), "home.log")
	cliPath := writeJimengHomeLoggingCLI(t, logPath)
	saveJimengHandlerSettings(t, cliPath, t.TempDir())
	user := model.AuthUser{ID: "handler-user-login", Username: "jimeng", Role: model.UserRoleUser}

	startReq := httptest.NewRequest(http.MethodPost, "/api/v1/jimeng-login/start", strings.NewReader(`{"model":"seedance2.0fast"}`))
	startReq.Header.Set("Content-Type", "application/json")
	startReq = startReq.WithContext(service.WithUser(startReq.Context(), user))
	startRec := httptest.NewRecorder()
	UserStartJimengLogin(startRec, startReq)
	if startRec.Code != http.StatusOK {
		t.Fatalf("start status = %d body=%s", startRec.Code, startRec.Body.String())
	}
	if !strings.Contains(startRec.Body.String(), `"userCode":"ABCD-EFGH"`) {
		t.Fatalf("start body = %s, want device flow", startRec.Body.String())
	}

	checkReq := httptest.NewRequest(http.MethodPost, "/api/v1/jimeng-login/check", strings.NewReader(`{"model":"seedance2.0fast","deviceCode":"device-code-user"}`))
	checkReq.Header.Set("Content-Type", "application/json")
	checkReq = checkReq.WithContext(service.WithUser(checkReq.Context(), user))
	checkRec := httptest.NewRecorder()
	UserCheckJimengLogin(checkRec, checkReq)
	if checkRec.Code != http.StatusOK {
		t.Fatalf("check status = %d body=%s", checkRec.Code, checkRec.Body.String())
	}
	if !strings.Contains(checkRec.Body.String(), `"loginReady":true`) {
		t.Fatalf("check body = %s, want ready", checkRec.Body.String())
	}

	wantHome := service.JimengUserHomeDir(model.ModelChannel{}, user.ID)
	wantLog := "start:" + wantHome + "\ncheck:" + wantHome
	if body, err := os.ReadFile(logPath); err != nil || strings.TrimSpace(string(body)) != wantLog {
		t.Fatalf("home log = %q err=%v, want %q", strings.TrimSpace(string(body)), err, wantLog)
	}
}

func TestAIVideoPreflightUsesAuthenticatedJimengHome(t *testing.T) {
	setupAIHandlerTestDB(t)
	root := filepath.Join(t.TempDir(), "dreamina-home")
	t.Setenv("DREAMINA_HOME", root)
	logPath := filepath.Join(t.TempDir(), "home.log")
	cliPath := writeJimengHomeLoggingCLI(t, logPath)
	saveJimengHandlerSettings(t, cliPath, t.TempDir())
	user := model.AuthUser{ID: "handler-user-preflight", Username: "jimeng", Role: model.UserRoleUser}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/videos/preflight?model=seedance2.0fast", nil)
	req = req.WithContext(service.WithUser(req.Context(), user))
	rec := httptest.NewRecorder()
	AIVideoPreflight(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"loginReady":true`) {
		t.Fatalf("body = %s, want login-ready jimeng preflight", rec.Body.String())
	}
	wantHome := service.JimengUserHomeDir(model.ModelChannel{}, user.ID)
	if body, err := os.ReadFile(logPath); err != nil || strings.TrimSpace(string(body)) != "credit:"+wantHome {
		t.Fatalf("home log = %q err=%v, want credit home %q", strings.TrimSpace(string(body)), err, wantHome)
	}
}

func TestJimengVideoProxyUsesAuthenticatedUserHomeForSubmitAndDownload(t *testing.T) {
	setupAIHandlerTestDB(t)
	root := filepath.Join(t.TempDir(), "dreamina-home")
	t.Setenv("DREAMINA_HOME", root)
	logPath := filepath.Join(t.TempDir(), "home.log")
	cliPath := writeJimengHomeLoggingCLI(t, logPath)
	saveJimengHandlerSettings(t, cliPath, t.TempDir())
	user := model.AuthUser{ID: "handler-user-video", Username: "jimeng", Role: model.UserRoleUser}

	body := []byte(`{"model":"seedance2.0fast","prompt":"一只猫在霓虹街道奔跑","duration":6,"ratio":"9:16","resolution":"720p"}`)
	submitReq := httptest.NewRequest(http.MethodPost, "/api/v1/videos", bytes.NewReader(body))
	submitReq.Header.Set("Content-Type", "application/json")
	submitReq = submitReq.WithContext(service.WithUser(submitReq.Context(), user))
	submitRec := httptest.NewRecorder()
	proxyAIRequest(submitRec, submitReq, "/videos")
	if submitRec.Code != http.StatusOK {
		t.Fatalf("submit status = %d body=%s", submitRec.Code, submitRec.Body.String())
	}

	contentReq := httptest.NewRequest(http.MethodGet, "/api/v1/videos/jimeng-submit-1/content?model=seedance2.0fast", nil)
	contentReq = contentReq.WithContext(service.WithUser(contentReq.Context(), user))
	contentRec := httptest.NewRecorder()
	proxyAIGetRequest(contentRec, contentReq, "/videos/jimeng-submit-1/content")
	if contentRec.Code != http.StatusOK {
		t.Fatalf("content status = %d body=%s", contentRec.Code, contentRec.Body.String())
	}

	wantHome := service.JimengUserHomeDir(model.ModelChannel{}, user.ID)
	wantLog := "submit:" + wantHome + "\nquery:" + wantHome
	if body, err := os.ReadFile(logPath); err != nil || strings.TrimSpace(string(body)) != wantLog {
		t.Fatalf("home log = %q err=%v, want %q", strings.TrimSpace(string(body)), err, wantLog)
	}
}

func TestJimengVideoProxyKeepsAdminUsageDataWithUserCLIHome(t *testing.T) {
	setupAIHandlerTestDB(t)
	root := filepath.Join(t.TempDir(), "dreamina-home")
	t.Setenv("DREAMINA_HOME", root)
	logPath := filepath.Join(t.TempDir(), "home.log")
	cliPath := writeJimengHomeLoggingCLI(t, logPath)
	saveJimengHandlerSettingsWithCredits(t, cliPath, t.TempDir(), 5)
	stamp := time.Now().Format(time.RFC3339)
	user := model.AuthUser{ID: "handler-user-usage", Username: "jimeng-usage", Role: model.UserRoleUser}
	if _, err := repository.SaveUser(model.User{ID: user.ID, Username: user.Username, Role: user.Role, Status: model.UserStatusActive, Credits: 100, AffCode: "JMUSAGE", CreatedAt: stamp, UpdatedAt: stamp}); err != nil {
		t.Fatal(err)
	}

	body := []byte(`{"model":"seedance2.0fast","prompt":"一只猫在霓虹街道奔跑","duration":6,"ratio":"9:16","resolution":"720p"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/videos", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(service.WithUser(req.Context(), user))
	rec := httptest.NewRecorder()
	proxyAIRequest(rec, req, "/videos")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", rec.Code, rec.Body.String())
	}

	tasks, err := service.ListAdminAITasks(model.AITaskQuery{ExactUserID: user.ID, Page: 1, PageSize: 10})
	if err != nil {
		t.Fatalf("ListAdminAITasks returned error: %v", err)
	}
	if tasks.Total != 1 || len(tasks.Items) != 1 {
		t.Fatalf("tasks = %#v, want one jimeng task", tasks)
	}
	task := tasks.Items[0]
	if task.Protocol != string(model.ModelProtocolJimengCLI) || task.Model != "seedance2.0fast" || task.Credits <= 0 || task.UpstreamTaskID != "jimeng-submit-1" {
		t.Fatalf("task = %#v, want jimeng usage task", task)
	}
	detail, err := service.GetAdminAITaskDetail(task.ID)
	if err != nil {
		t.Fatalf("GetAdminAITaskDetail returned error: %v", err)
	}
	if len(detail.CreditLogs) != 1 || detail.CreditLogs[0].Amount != -task.Credits || detail.CreditLogs[0].UserID != user.ID {
		t.Fatalf("credit logs = %#v, want jimeng consume log", detail.CreditLogs)
	}
	usage, err := service.GetAdminAIUsageSummary(model.AIUsageQuery{Period: model.AIUsagePeriodMonth, Page: 1, PageSize: 10})
	if err != nil {
		t.Fatalf("GetAdminAIUsageSummary returned error: %v", err)
	}
	if usage.UserTotal != 1 || len(usage.Users) != 1 || usage.Users[0].UserID != user.ID || usage.Users[0].NetCredits != task.Credits {
		t.Fatalf("usage = %#v, want jimeng user usage", usage)
	}
}

func writeJimengHomeLoggingCLI(t *testing.T, logPath string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "dreamina")
	script := strings.ReplaceAll(`#!/bin/sh
case "$1" in
  version)
    printf '{"version":"test-jimeng"}\n'
    ;;
  user_credit)
    printf 'credit:%s\n' "$HOME" > "__LOG__"
    printf '{"credits":100}\n'
    ;;
  login)
    if [ "$2" = "--headless" ]; then
      printf 'start:%s\n' "$HOME" >> "__LOG__"
      printf '{"verification_uri":"https://example.com/activate","user_code":"ABCD-EFGH","device_code":"device-code-user","expires_in":600,"interval":5}\n'
      exit 0
    fi
    if [ "$2" = "checklogin" ]; then
      printf 'check:%s\n' "$HOME" >> "__LOG__"
      printf '{"status":"success","message":"login ok"}\n'
      exit 0
    fi
    echo "unexpected login: $*" >&2
    exit 2
    ;;
  text2video)
    printf 'submit:%s\n' "$HOME" >> "__LOG__"
    printf '{"submit_id":"jimeng-submit-1","gen_status":"querying","model_version":"seedance2.0fast","duration":6,"ratio":"9:16","video_resolution":"720p"}\n'
    ;;
  query_result)
    printf 'query:%s\n' "$HOME" >> "__LOG__"
    download_dir=""
    for arg in "$@"; do
      case "$arg" in
        --download_dir=*) download_dir="${arg#--download_dir=}" ;;
      esac
    done
    if [ -n "$download_dir" ]; then
      mkdir -p "$download_dir"
      printf 'fake-video' > "$download_dir/result.mp4"
      printf '{"submit_id":"jimeng-submit-1","gen_status":"success","downloaded_files":["%s/result.mp4"]}\n' "$download_dir"
    else
      printf '{"submit_id":"jimeng-submit-1","gen_status":"success"}\n'
    fi
    ;;
  *)
    echo "unexpected command: $*" >&2
    exit 2
    ;;
esac
`, "__LOG__", logPath)
	if err := os.WriteFile(path, []byte(script), 0755); err != nil {
		t.Fatalf("write fake cli: %v", err)
	}
	return path
}
