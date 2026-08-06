package service

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestBuildJimengText2VideoArgsFromJSON(t *testing.T) {
	args, err := BuildJimengText2VideoArgs([]byte(`{
		"prompt": "一只猫在霓虹街道奔跑",
		"duration": 6,
		"ratio": "9:16",
		"resolution": "1080p",
		"generate_audio": true,
		"watermark": false
	}`), "application/json", "seedance2.0_vip", 2)
	if err != nil {
		t.Fatalf("BuildJimengText2VideoArgs returned error: %v", err)
	}
	want := []string{"text2video", "--prompt=一只猫在霓虹街道奔跑", "--duration=6", "--ratio=9:16", "--video_resolution=1080p", "--model_version=seedance2.0_vip", "--session=2", "--poll=0"}
	if !equalStringSlices(args, want) {
		t.Fatalf("args = %#v, want %#v", args, want)
	}
}

func TestBuildJimengText2VideoArgsSupportsSeedance25(t *testing.T) {
	args, err := BuildJimengText2VideoArgs([]byte(`{
		"prompt": "长镜头",
		"duration": 30,
		"ratio": "16:9",
		"resolution": "480p"
	}`), "application/json", "seedance2.5", 0)
	if err != nil {
		t.Fatalf("BuildJimengText2VideoArgs returned error: %v", err)
	}
	for _, want := range []string{"--duration=30", "--video_resolution=480p", "--model_version=seedance2.5"} {
		if !jimengArgsContain(args, want) {
			t.Fatalf("args = %#v, want %q", args, want)
		}
	}
}

func TestJimengVIPResolutionSupports4K(t *testing.T) {
	if got := normalizeJimengModelResolution("seedance2.0_vip", "2160p"); got != "4k" {
		t.Fatalf("resolution = %q, want 4k", got)
	}
}

func TestBuildJimengText2VideoArgsRejectsReferenceInputs(t *testing.T) {
	_, err := BuildJimengText2VideoArgs([]byte(`{
		"model": "seedance2.0fast",
		"prompt": "参考图片生成视频",
		"content": [
			{"type": "text", "text": "参考图片生成视频"},
			{"type": "image_url", "image_url": {"url": "asset://image-id"}}
		]
	}`), "application/json", "seedance2.0fast", 0)
	if err == nil || err.Error() != "即梦 CLI 参考生成需要上传图片、视频或音频文件，暂不支持 JSON 或 URL 参考" {
		t.Fatalf("err = %v, want reference rejection", err)
	}
}

func TestJimengUserHomeDirIsPerUser(t *testing.T) {
	t.Setenv("DREAMINA_HOME", filepath.Join(t.TempDir(), "dreamina-home"))
	channel := model.ModelChannel{Protocol: string(model.ModelProtocolJimengCLI)}

	userOne := JimengUserHomeDir(channel, "user-one")
	userTwo := JimengUserHomeDir(channel, "user-two")

	if userOne == "" || userTwo == "" || userOne == userTwo {
		t.Fatalf("user homes = %q / %q, want distinct non-empty dirs", userOne, userTwo)
	}
	if !strings.Contains(userOne, "users") || !strings.Contains(userTwo, "users") {
		t.Fatalf("user homes = %q / %q, want nested user login dirs", userOne, userTwo)
	}
}

func TestNormalizeJimengVideoTaskResponseReadsSubmitResult(t *testing.T) {
	body, err := NormalizeJimengVideoTaskResponse([]byte(`{
		"submit_id": "dreamina-submit-1",
		"gen_status": "querying",
		"model_version": "seedance2.0fast",
		"ratio": "9:16",
		"duration": 6,
		"video_resolution": "720p"
	}`))
	if err != nil {
		t.Fatalf("NormalizeJimengVideoTaskResponse returned error: %v", err)
	}
	payload := readJimengJSONMap(t, body)
	if payload["id"] != "dreamina-submit-1" || payload["status"] != "running" || payload["raw_status"] != "querying" {
		t.Fatalf("task identifiers/status = %#v", payload)
	}
	if payload["resolution"] != "720p" || payload["ratio"] != "9:16" || payload["duration"] != float64(6) {
		t.Fatalf("task controls = %#v", payload)
	}
}

func TestNormalizeJimengVideoTaskResponseReadsDownloadedResult(t *testing.T) {
	body, err := NormalizeJimengVideoTaskResponse([]byte(`{
		"data": {
			"submit_id": "dreamina-submit-2",
			"gen_status": "success",
			"result": {
				"video_url": "https://example.com/video.mp4"
			}
		}
	}`))
	if err != nil {
		t.Fatalf("NormalizeJimengVideoTaskResponse returned error: %v", err)
	}
	payload := readJimengJSONMap(t, body)
	if payload["id"] != "dreamina-submit-2" || payload["status"] != "succeeded" {
		t.Fatalf("task identifiers/status = %#v", payload)
	}
	if payload["video_url"] != "https://example.com/video.mp4" {
		t.Fatalf("video_url = %#v, want nested url", payload["video_url"])
	}
}

func TestNormalizeJimengVideoTaskResponseKeepsFailureReason(t *testing.T) {
	body, err := NormalizeJimengVideoTaskResponse([]byte(`{
		"submit_id": "dreamina-submit-3",
		"gen_status": "fail",
		"fail_reason": "内容审核未通过"
	}`))
	if err != nil {
		t.Fatalf("NormalizeJimengVideoTaskResponse returned error: %v", err)
	}
	payload := readJimengJSONMap(t, body)
	if payload["status"] != "failed" {
		t.Fatalf("status = %#v, want failed", payload["status"])
	}
	taskError, ok := payload["error"].(map[string]any)
	if !ok || taskError["message"] != "内容审核未通过" {
		t.Fatalf("error = %#v, want fail reason", payload["error"])
	}
}

func TestStartJimengLoginParsesHeadlessDeviceFlow(t *testing.T) {
	cliPath := writeJimengLoginFakeCLI(t)
	result, err := StartJimengLogin(context.Background(), model.ModelChannel{Protocol: string(model.ModelProtocolJimengCLI), CLIPath: cliPath})
	if err != nil {
		t.Fatalf("StartJimengLogin returned error: %v", err)
	}
	if result.VerificationURI != "https://example.com/activate" || result.UserCode != "ABCD-EFGH" || result.DeviceCode != "device-code-1" {
		t.Fatalf("result = %#v, want parsed device flow", result)
	}
}

func TestUserJimengLoginUsesPersonalHome(t *testing.T) {
	setupAITaskTestDB(t)
	root := filepath.Join(t.TempDir(), "dreamina-home")
	t.Setenv("DREAMINA_HOME", root)
	logPath := filepath.Join(t.TempDir(), "home.log")
	cliPath := filepath.Join(t.TempDir(), "dreamina")
	script := strings.ReplaceAll(`#!/bin/sh
if [ "$1" = "login" ] && [ "$2" = "--headless" ]; then
  printf 'start:%s\n' "$HOME" >> "__LOG__"
  printf '{"verification_uri":"https://example.com/activate","user_code":"ABCD-EFGH","device_code":"device-code-user","expires_in":600,"interval":5}\n'
  exit 0
fi
if [ "$1" = "login" ] && [ "$2" = "checklogin" ]; then
  printf 'check:%s\n' "$HOME" >> "__LOG__"
  printf '{"status":"success","message":"login ok"}\n'
  exit 0
fi
printf 'unexpected args: %s %s\n' "$1" "$2" >&2
exit 1
`, "__LOG__", logPath)
	if err := os.WriteFile(cliPath, []byte(script), 0755); err != nil {
		t.Fatal(err)
	}
	_, err := repository.SaveSettings(model.Settings{
		Public: model.PublicSetting{ModelChannel: model.PublicModelChannelSetting{DefaultVideoModel: "seedance2.0fast", AvailableModels: []string{"seedance2.0fast"}}},
		Private: model.PrivateSetting{Channels: []model.ModelChannel{{
			Protocol: string(model.ModelProtocolJimengCLI),
			Name:     "即梦 CLI",
			CLIPath:  cliPath,
			Models:   []string{"seedance2.0fast"},
			Enabled:  true,
		}}},
	}, now())
	if err != nil {
		t.Fatal(err)
	}

	result, err := StartUserJimengLogin(context.Background(), model.AuthUser{ID: "user-login", Username: "login"}, "seedance2.0fast")
	if err != nil {
		t.Fatalf("StartUserJimengLogin returned error: %v", err)
	}
	if result.UserCode != "ABCD-EFGH" {
		t.Fatalf("result = %#v, want login device flow", result)
	}
	check, err := CheckUserJimengLogin(context.Background(), model.AuthUser{ID: "user-login", Username: "login"}, "seedance2.0fast", result.DeviceCode)
	if err != nil {
		t.Fatalf("CheckUserJimengLogin returned error: %v", err)
	}
	if !check.LoginReady {
		t.Fatalf("check = %#v, want ready", check)
	}
	home, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("read home log: %v", err)
	}
	wantHome := expectedJimengCLIHome("user-login")
	wantLog := "start:" + wantHome + "\ncheck:" + wantHome
	if strings.TrimSpace(string(home)) != wantLog {
		t.Fatalf("HOME log = %q, want %q", strings.TrimSpace(string(home)), wantLog)
	}
}

func TestPreflightModelChannelForUserUsesPersonalJimengHome(t *testing.T) {
	setupAITaskTestDB(t)
	root := filepath.Join(t.TempDir(), "dreamina-home")
	t.Setenv("DREAMINA_HOME", root)
	logPath := filepath.Join(t.TempDir(), "home.log")
	cliPath := filepath.Join(t.TempDir(), "dreamina")
	script := strings.ReplaceAll(`#!/bin/sh
case "$1" in
  version) printf '{"version":"test-jimeng"}\n' ;;
  user_credit) printf '%s\n' "$HOME" > "__LOG__"; printf '{"credits":100}\n' ;;
  *) echo "unexpected command: $*" >&2; exit 2 ;;
esac
`, "__LOG__", logPath)
	if err := os.WriteFile(cliPath, []byte(script), 0755); err != nil {
		t.Fatal(err)
	}
	_, err := repository.SaveSettings(model.Settings{
		Public: model.PublicSetting{ModelChannel: model.PublicModelChannelSetting{DefaultVideoModel: "seedance2.0fast", AvailableModels: []string{"seedance2.0fast"}}},
		Private: model.PrivateSetting{Channels: []model.ModelChannel{{
			Protocol: string(model.ModelProtocolJimengCLI),
			Name:     "即梦 CLI",
			CLIPath:  cliPath,
			Models:   []string{"seedance2.0fast"},
			Enabled:  true,
		}}},
	}, now())
	if err != nil {
		t.Fatal(err)
	}

	result, err := PreflightModelChannelForUser(context.Background(), model.AuthUser{ID: "user-preflight", Username: "preflight"}, "seedance2.0fast")
	if err != nil {
		t.Fatalf("PreflightModelChannelForUser returned error: %v", err)
	}
	if !result.LoginReady || result.Protocol != string(model.ModelProtocolJimengCLI) {
		t.Fatalf("result = %#v, want jimeng login-ready preflight", result)
	}
	home, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("read home log: %v", err)
	}
	wantHome := expectedJimengCLIHome("user-preflight")
	if strings.TrimSpace(string(home)) != wantHome {
		t.Fatalf("HOME = %q, want %q", strings.TrimSpace(string(home)), wantHome)
	}
}

func expectedJimengCLIHome(userID string) string {
	if runtime.GOOS == "darwin" {
		return os.Getenv("HOME")
	}
	return JimengUserHomeDir(model.ModelChannel{}, userID)
}

func TestParseJimengLoginStartResultReadsHeadlessTextOutput(t *testing.T) {
	result, err := parseJimengLoginStartResult([]byte(`请使用浏览器完成 OAuth Device Flow 登录。
verification_uri: https://jimeng.jianying.com/ai-tool/cli-auth?verification_uri=https%3A%2F%2Fjimeng.jianying.com%2Fpassport%2Fopen%2Fscan_user_code%2F%3Fuser_code%3Dc8bec427f376655363d76ee8eb0decfa
user_code: c8bec427f376655363d76ee8eb0decfa
device_code: 700f0bd669d4a261ddc63979b1916b66
poll_interval: 1s
expires_at: 2026-07-07T15:55:10+08:00
`))
	if err != nil {
		t.Fatalf("parseJimengLoginStartResult returned error: %v", err)
	}
	if result.VerificationURI == "" || result.UserCode != "c8bec427f376655363d76ee8eb0decfa" || result.DeviceCode != "700f0bd669d4a261ddc63979b1916b66" {
		t.Fatalf("result = %#v, want parsed text device flow", result)
	}
	if result.Interval != 1 {
		t.Fatalf("interval = %d, want 1", result.Interval)
	}
}

func TestParseJimengLoginStartResultRecognizesReusedLogin(t *testing.T) {
	result, err := parseJimengLoginStartResult([]byte("已复用当前本地 OAuth 登录态。\n"))
	if err != nil {
		t.Fatalf("parseJimengLoginStartResult returned error: %v", err)
	}
	if !result.LoginReady || result.Message == "" {
		t.Fatalf("result = %#v, want reused login ready", result)
	}
}

func TestCheckJimengLoginUsesDeviceCode(t *testing.T) {
	cliPath := writeJimengLoginFakeCLI(t)
	result, err := CheckJimengLogin(context.Background(), model.ModelChannel{Protocol: string(model.ModelProtocolJimengCLI), CLIPath: cliPath}, "device-code-1")
	if err != nil {
		t.Fatalf("CheckJimengLogin returned error: %v", err)
	}
	if !result.LoginReady || result.Message == "" {
		t.Fatalf("result = %#v, want login ready message", result)
	}
}

func TestCheckJimengLoginRequiresDeviceCode(t *testing.T) {
	_, err := CheckJimengLogin(context.Background(), model.ModelChannel{Protocol: string(model.ModelProtocolJimengCLI), CLIPath: "dreamina"}, "")
	if err == nil || err.Error() != "缺少即梦登录 device_code" {
		t.Fatalf("err = %v, want missing device_code", err)
	}
}

func TestPreflightJimengCLIStartsTimeoutAfterQueueWait(t *testing.T) {
	previousTimeout := jimengPreflightTimeout
	jimengPreflightTimeout = 2 * time.Second
	t.Cleanup(func() { jimengPreflightTimeout = previousTimeout })

	cliPath := filepath.Join(t.TempDir(), "dreamina")
	script := `#!/bin/sh
	sleep 0.3
case "$1" in
  version) printf '{"version":"test-jimeng"}\n' ;;
  user_credit) printf '{"total_credit":100}\n' ;;
  *) exit 1 ;;
esac
`
	if err := os.WriteFile(cliPath, []byte(script), 0755); err != nil {
		t.Fatalf("write fake cli: %v", err)
	}
	channel := model.ModelChannel{
		Protocol:  string(model.ModelProtocolJimengCLI),
		CLIPath:   cliPath,
		OutputDir: t.TempDir(),
		Models:    []string{"seedance2.0mini"},
	}

	start := make(chan struct{})
	errs := make(chan error, 4)
	for range 4 {
		go func() {
			<-start
			_, err := PreflightJimengCLI(context.Background(), channel, "seedance2.0mini")
			errs <- err
		}()
	}
	close(start)
	for range 4 {
		if err := <-errs; err != nil {
			t.Fatalf("concurrent preflight failed while waiting for the CLI queue: %v", err)
		}
	}
}

func readJimengJSONMap(t *testing.T, body []byte) map[string]any {
	t.Helper()
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("Unmarshal JSON: %v", err)
	}
	return payload
}

func writeJimengLoginFakeCLI(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "dreamina")
	script := `#!/bin/sh
if [ "$1" = "login" ] && [ "$2" = "--headless" ]; then
  printf '{"verification_uri":"https://example.com/activate","user_code":"ABCD-EFGH","device_code":"device-code-1","expires_in":600,"interval":5}\n'
  exit 0
fi
if [ "$1" = "login" ] && [ "$2" = "checklogin" ]; then
  printf '{"status":"success","message":"login ready"}\n'
  exit 0
fi
printf 'unexpected args: %s %s %s\n' "$1" "$2" "$3" >&2
exit 1
`
	if err := os.WriteFile(path, []byte(script), 0755); err != nil {
		t.Fatalf("write fake cli: %v", err)
	}
	return path
}

func equalStringSlices(a []string, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for index := range a {
		if a[index] != b[index] {
			return false
		}
	}
	return true
}
