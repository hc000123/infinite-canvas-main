package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/basketikun/infinite-canvas/service"
)

func TestCopyAIResponseStreamsSSEBeforeEOF(t *testing.T) {
	upstream, upstreamWriter := io.Pipe()
	writer := newObservingAIResponseWriter()
	request := httptest.NewRequest(http.MethodPost, "https://example.invalid/v1/responses", nil)
	done := make(chan struct{})
	var archived []byte
	go func() {
		defer close(done)
		copyAIResponseWithTransform(writer, request, func(*http.Request) (*http.Response, error) {
			return &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"text/event-stream; charset=utf-8"}}, Body: upstream}, nil
		}, nil, func(status int, contentType string) {
			writer.Header().Set("X-Test-Started", contentType)
		}, nil, func(_ int, payload []byte, contentType string) {
			archived = append([]byte(nil), payload...)
			if contentType != "application/json" {
				t.Errorf("archive content type=%q", contentType)
			}
		})
	}()
	first := "event: response.output_text.delta\ndata: {\"delta\":\"首包\"}\n\n"
	if _, err := upstreamWriter.Write([]byte(first)); err != nil {
		t.Fatal(err)
	}
	select {
	case <-writer.flushed:
		if writer.bodyString() != first {
			t.Fatalf("first body=%q", writer.bodyString())
		}
	case <-time.After(300 * time.Millisecond):
		_ = upstreamWriter.Close()
		<-done
		t.Fatal("first SSE event was buffered until upstream EOF")
	}
	_, _ = upstreamWriter.Write([]byte("event: response.completed\ndata: {\"response\":{\"usage\":{\"input_tokens\":2,\"output_tokens\":1}}}\n\ndata: [DONE]\n\n"))
	_ = upstreamWriter.Close()
	<-done
	if !strings.Contains(string(archived), `"outputText":"首包"`) || strings.Contains(string(archived), `event: response.output_text.delta`) {
		t.Fatalf("archive=%s", archived)
	}
	if writer.Header().Get("X-Test-Started") != "text/event-stream; charset=utf-8" {
		t.Fatalf("start callback header=%q", writer.Header().Get("X-Test-Started"))
	}
}

func TestCopyAIResponseDoesNotAppendJSONAfterStreamFailure(t *testing.T) {
	writer := newObservingAIResponseWriter()
	request := httptest.NewRequest(http.MethodPost, "https://example.invalid/v1/responses", nil)
	failures, successes := 0, 0
	copyAIResponseWithTransform(writer, request, func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"text/event-stream"}}, Body: io.NopCloser(&failingAIStreamReader{})}, nil
	}, func(string, []byte) {
		failures++
	}, nil, nil, func(int, []byte, string) {
		successes++
	})
	if failures != 1 || successes != 0 {
		t.Fatalf("failures=%d successes=%d", failures, successes)
	}
	if body := writer.bodyString(); body != "data: {\"delta\":\"partial\"}\n\n" || strings.Contains(body, `"code":1`) {
		t.Fatalf("stream body=%q", body)
	}
}

type observingAIResponseWriter struct {
	header  http.Header
	body    bytes.Buffer
	status  int
	flushed chan struct{}
	mu      sync.Mutex
}

func newObservingAIResponseWriter() *observingAIResponseWriter {
	return &observingAIResponseWriter{header: http.Header{}, flushed: make(chan struct{}, 1)}
}

func (writer *observingAIResponseWriter) Header() http.Header    { return writer.header }
func (writer *observingAIResponseWriter) WriteHeader(status int) { writer.status = status }
func (writer *observingAIResponseWriter) Write(body []byte) (int, error) {
	writer.mu.Lock()
	defer writer.mu.Unlock()
	return writer.body.Write(body)
}
func (writer *observingAIResponseWriter) Flush() {
	select {
	case writer.flushed <- struct{}{}:
	default:
	}
}
func (writer *observingAIResponseWriter) bodyString() string {
	writer.mu.Lock()
	defer writer.mu.Unlock()
	return writer.body.String()
}

type failingAIStreamReader struct{ sent bool }

func (reader *failingAIStreamReader) Read(body []byte) (int, error) {
	if reader.sent {
		return 0, errors.New("upstream stream interrupted")
	}
	reader.sent = true
	return copy(body, "data: {\"delta\":\"partial\"}\n\n"), nil
}

func TestBuildArkVideoCreateRequestKeepsSeedanceControls(t *testing.T) {
	source := []byte(`{
		"model": "doubao-seedance-2-0-260128",
		"prompt": "小猫对着镜头打哈欠",
		"duration": 10,
		"ratio": "9:16",
		"resolution": "1080p",
		"generate_audio": true,
		"watermark": false,
		"seed": 42
	}`)

	body, contentType, err := service.BuildArkVideoCreateRequest(source, "application/json")
	if err != nil {
		t.Fatalf("buildArkVideoCreateRequest returned error: %v", err)
	}
	if contentType != "application/json" {
		t.Fatalf("content type = %q, want application/json", contentType)
	}

	payload := readJSONMap(t, body)
	if payload["duration"] != float64(10) {
		t.Fatalf("duration = %#v, want 10", payload["duration"])
	}
	if payload["ratio"] != "9:16" {
		t.Fatalf("ratio = %#v, want 9:16", payload["ratio"])
	}
	if payload["resolution"] != "1080p" {
		t.Fatalf("resolution = %#v, want 1080p", payload["resolution"])
	}
	if payload["generate_audio"] != true {
		t.Fatalf("generate_audio = %#v, want true", payload["generate_audio"])
	}
	if payload["watermark"] != false {
		t.Fatalf("watermark = %#v, want false", payload["watermark"])
	}
	if payload["seed"] != float64(42) {
		t.Fatalf("seed = %#v, want 42", payload["seed"])
	}
}

func TestCloudVideoProxyIgnoresFrontendVolcengineKey(t *testing.T) {
	setupAIHandlerTestDB(t)
	allowCustomChannel := false
	upstreamCalled := false
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalled = true
		if !strings.HasSuffix(r.URL.Path, "/contents/generations/tasks") {
			t.Fatalf("unexpected upstream path: %s", r.URL.Path)
		}
		if auth := r.Header.Get("Authorization"); auth != "Bearer backend-key" {
			t.Fatalf("authorization = %q, want backend key", auth)
		}
		body, _ := io.ReadAll(r.Body)
		if strings.Contains(string(body), "frontend-key") || strings.Contains(string(body), "_volcengine_api_key") {
			t.Fatalf("upstream body contains frontend supplier key: %s", string(body))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"task-cloud-boundary","status":"queued"}`))
	}))
	defer upstream.Close()
	saveAIHandlerSettings(t, allowCustomChannel, upstream.URL)

	body := []byte(`{
		"model": "ep-test",
		"prompt": "生成一个短视频",
		"content": [{"type":"text","text":"生成一个短视频"}],
		"_volcengine_api_key": "frontend-key",
		"_volcengine_base_url": "https://frontend.invalid/api/v3"
	}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/videos", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(service.WithUser(req.Context(), model.AuthUser{ID: "user-cloud-boundary", Username: "cloud-boundary", Role: model.UserRoleUser}))
	rec := httptest.NewRecorder()

	proxyAIRequest(rec, req, "/videos")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", rec.Code, rec.Body.String())
	}
	if !upstreamCalled {
		t.Fatal("upstream was not called")
	}
}

func TestArkSeedance25EndpointProxyReservesMaximumEditCredits(t *testing.T) {
	setupAIHandlerTestDB(t)
	type capturedRequest struct {
		method        string
		path          string
		authorization string
		contentType   string
		body          []byte
		err           error
	}
	requests := make(chan capturedRequest, 1)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		requests <- capturedRequest{method: r.Method, path: r.URL.Path, authorization: r.Header.Get("Authorization"), contentType: r.Header.Get("Content-Type"), body: body, err: err}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"task-seedance-25","status":"queued"}`))
	}))
	defer upstream.Close()
	saveArk25HandlerSettings(t, upstream.URL)
	now := time.Now().Format(time.RFC3339)
	if _, err := repository.SaveUser(model.User{ID: "user-seedance-25", Username: "seedance-25", Role: model.UserRoleUser, Status: model.UserStatusActive, Credits: 100, AffCode: "SEEDANCE25", CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatal(err)
	}

	body := []byte(`{
		"model": "ep-25",
		"content": [{"type":"text","text":"编辑短视频"},{"type":"video_url","video_url":{"url":"asset://video-id"},"role":"reference_video"}],
		"duration": 1,
		"_seedance_billing_duration": 1,
		"ratio": "16:9",
		"_seedance_task_mode": "edit",
		"resolution": "480p"
	}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/videos", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(service.WithUser(req.Context(), model.AuthUser{ID: "user-seedance-25", Username: "seedance-25", Role: model.UserRoleUser}))
	rec := httptest.NewRecorder()

	proxyAIRequest(rec, req, "/videos")

	upstreamCalled := false
	var captured capturedRequest
	select {
	case captured = <-requests:
		upstreamCalled = true
	default:
	}
	if !upstreamCalled {
		t.Fatal("upstream was not called")
	}
	if captured.err != nil {
		t.Fatalf("read upstream body: %v", captured.err)
	}
	if captured.method != http.MethodPost || captured.path != "/contents/generations/tasks" {
		t.Fatalf("upstream request = %s %s", captured.method, captured.path)
	}
	if captured.authorization != "Bearer backend-key" || captured.contentType != "application/json" {
		t.Fatalf("upstream headers authorization=%q content-type=%q", captured.authorization, captured.contentType)
	}
	upstreamPayload := readJSONMap(t, captured.body)
	if upstreamPayload["model"] != "ep-25" || upstreamPayload["duration"] != float64(-1) || upstreamPayload["ratio"] != "adaptive" || upstreamPayload["resolution"] != "480p" {
		t.Fatalf("upstream payload = %#v", upstreamPayload)
	}
	if _, ok := upstreamPayload["_seedance_task_mode"]; ok {
		t.Fatalf("private task mode leaked upstream: %#v", upstreamPayload)
	}
	if _, ok := upstreamPayload["_seedance_billing_duration"]; ok {
		t.Fatalf("private billing duration leaked upstream: %#v", upstreamPayload)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", rec.Code, rec.Body.String())
	}
	if credits := rec.Header().Get("X-AI-Task-Credits"); credits != "30" {
		t.Fatalf("task credits = %q, want 30", credits)
	}
	if user, ok, err := repository.GetUserByID("user-seedance-25"); err != nil || !ok || user.Credits != 70 {
		t.Fatalf("user = %#v ok=%v err=%v, want balance 70", user, ok, err)
	}
	if task, ok, err := repository.GetAITask(rec.Header().Get("X-AI-Task-ID")); err != nil || !ok || task.Model != "doubao-seedance-2-5" || task.Credits != 30 {
		t.Fatalf("task = %#v ok=%v err=%v, want logical Seedance 2.5 with 30 credits", task, ok, err)
	}
	responsePayload := readJSONMap(t, rec.Body.Bytes())
	if responsePayload["id"] != "task-seedance-25" || responsePayload["status"] != "queued" {
		t.Fatalf("response status=%d payload=%#v", rec.Code, responsePayload)
	}
}

func TestNormalizeImageGenerationPayloadArchivesRemoteURLs(t *testing.T) {
	payload := []byte(`{"created":1,"data":[{"url":"https://cdn.example.com/generated.webp"}]}`)
	normalized, err := normalizeImageGenerationPayload(payload, func(rawURL string) ([]byte, string, error) {
		if rawURL != "https://cdn.example.com/generated.webp" {
			t.Fatalf("unexpected image URL %q", rawURL)
		}
		return []byte("image-bytes"), "image/webp", nil
	})
	if err != nil {
		t.Fatalf("normalizeImageGenerationPayload returned error: %v", err)
	}
	var result struct {
		Data []map[string]any `json:"data"`
	}
	if err := json.Unmarshal(normalized, &result); err != nil {
		t.Fatalf("invalid normalized JSON: %v", err)
	}
	if result.Data[0]["url"] != nil {
		t.Fatalf("remote URL was not removed: %#v", result.Data[0])
	}
	if result.Data[0]["b64_json"] != "data:image/webp;base64,aW1hZ2UtYnl0ZXM=" {
		t.Fatalf("unexpected archived image: %#v", result.Data[0]["b64_json"])
	}
}

func TestLegacyLocalArkVideoPayloadUsesBackendChannel(t *testing.T) {
	setupAIHandlerTestDB(t)
	upstreamCalled := false
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalled = true
		if auth := r.Header.Get("Authorization"); auth != "Bearer backend-key" {
			t.Fatalf("authorization = %q, want backend key", auth)
		}
		body, _ := io.ReadAll(r.Body)
		if strings.Contains(string(body), "frontend-key") || strings.Contains(string(body), "_volcengine_api_key") {
			t.Fatalf("upstream body contains frontend supplier key: %s", string(body))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"task-backend-only","status":"queued"}`))
	}))
	defer upstream.Close()
	saveAIHandlerSettings(t, true, upstream.URL)

	body := []byte(`{
		"model": "ep-test",
		"prompt": "生成一个短视频",
		"_volcengine_api_key": "frontend-key",
		"_volcengine_base_url": "http://127.0.0.1:1/api/v3"
	}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/videos", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(service.WithUser(req.Context(), model.AuthUser{ID: "user-local-boundary", Username: "local-boundary", Role: model.UserRoleUser}))
	rec := httptest.NewRecorder()

	proxyAIRequest(rec, req, "/videos")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", rec.Code, rec.Body.String())
	}
	if !upstreamCalled {
		t.Fatal("backend channel upstream was not called")
	}
}

func TestVideoPreflightChecksBackendArkChannel(t *testing.T) {
	setupAIHandlerTestDB(t)
	upstreamCalled := false
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalled = true
		if r.URL.Path != "/contents/generations/tasks/__infinite_canvas_probe__" {
			t.Fatalf("path = %s, want ark preflight probe", r.URL.Path)
		}
		if auth := r.Header.Get("Authorization"); auth != "Bearer backend-key" {
			t.Fatalf("authorization = %q, want backend key", auth)
		}
		http.Error(w, `{"error":{"message":"task not found"}}`, http.StatusNotFound)
	}))
	defer upstream.Close()
	saveAIHandlerSettings(t, false, upstream.URL)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/videos/preflight?model=ep-test", nil)
	req = req.WithContext(service.WithUser(req.Context(), model.AuthUser{ID: "user-video-preflight", Username: "video-preflight", Role: model.UserRoleUser}))
	rec := httptest.NewRecorder()

	AIVideoPreflight(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", rec.Code, rec.Body.String())
	}
	if !upstreamCalled {
		t.Fatal("upstream was not called")
	}
	if !strings.Contains(rec.Body.String(), `"protocol":"volcengine-ark"`) {
		t.Fatalf("body = %s, want ark protocol", rec.Body.String())
	}
	for _, want := range []string{`"channelName":"ark-backend"`, `"baseUrl":"` + upstream.URL + `"`, `"endpointId":"ep-test"`} {
		if !strings.Contains(rec.Body.String(), want) {
			t.Fatalf("body = %s, want %s", rec.Body.String(), want)
		}
	}
	if strings.Contains(rec.Body.String(), "backend-key") {
		t.Fatalf("preflight response leaked backend key: %s", rec.Body.String())
	}
}

func TestJimengVideoProxySubmitsThroughCLIChannel(t *testing.T) {
	setupAIHandlerTestDB(t)
	cliPath := writeFakeJimengCLI(t)
	outputDir := t.TempDir()
	saveJimengHandlerSettings(t, cliPath, outputDir)

	body := []byte(`{
		"model": "seedance2.0fast",
		"prompt": "一只猫在霓虹街道奔跑",
		"duration": 6,
		"ratio": "9:16",
		"resolution": "720p"
	}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/videos", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(service.WithUser(req.Context(), model.AuthUser{ID: "user-jimeng", Username: "jimeng", Role: model.UserRoleUser}))
	rec := httptest.NewRecorder()

	proxyAIRequest(rec, req, "/videos")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", rec.Code, rec.Body.String())
	}
	payload := readJSONMap(t, rec.Body.Bytes())
	if payload["id"] != "jimeng-submit-1" || payload["status"] != "running" {
		t.Fatalf("payload = %#v, want jimeng running task", payload)
	}
	if rec.Header().Get("X-AI-Upstream-Task-ID") != "jimeng-submit-1" {
		t.Fatalf("upstream header = %q, want jimeng submit id", rec.Header().Get("X-AI-Upstream-Task-ID"))
	}
}

func TestJimengVideoProxySubmitsAllMultipartModes(t *testing.T) {
	setupAIHandlerTestDB(t)
	cliPath := writeFakeJimengCLI(t)
	saveJimengHandlerSettings(t, cliPath, t.TempDir())
	png := append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0}, 32)...)
	tests := []struct {
		mode   string
		files  []handlerJimengUpload
		wantID string
	}{
		{mode: "text2video", wantID: "jimeng-submit-1"},
		{mode: "image2video", files: []handlerJimengUpload{{field: "input_image[]", name: "first.png", contentType: "image/png", body: png, role: "first_frame"}}, wantID: "jimeng-image2video"},
		{mode: "frames2video", files: []handlerJimengUpload{{field: "input_image[]", name: "first.png", contentType: "image/png", body: png, role: "first_frame"}, {field: "input_image[]", name: "last.png", contentType: "image/png", body: png, role: "last_frame"}}, wantID: "jimeng-frames2video"},
		{mode: "multiframe2video", files: []handlerJimengUpload{{field: "input_image[]", name: "1.png", contentType: "image/png", body: png}, {field: "input_image[]", name: "2.png", contentType: "image/png", body: png}, {field: "input_image[]", name: "3.png", contentType: "image/png", body: png}}, wantID: "jimeng-multiframe2video"},
		{mode: "multimodal2video", files: []handlerJimengUpload{{field: "input_image[]", name: "image.png", contentType: "image/png", body: png}, {field: "input_video[]", name: "clip.mp4", contentType: "video/mp4", body: []byte("\x00\x00\x00\x18ftypmp42video")}, {field: "input_audio[]", name: "voice.mp3", contentType: "audio/mpeg", body: []byte("ID3audio")}}, wantID: "jimeng-multimodal2video"},
	}
	for _, tt := range tests {
		t.Run(tt.mode, func(t *testing.T) {
			body, contentType := buildHandlerJimengMultipart(t, tt.mode, tt.files)
			req := httptest.NewRequest(http.MethodPost, "/api/v1/videos", bytes.NewReader(body))
			req.Header.Set("Content-Type", contentType)
			req = req.WithContext(service.WithUser(req.Context(), model.AuthUser{ID: "user-jimeng-" + tt.mode, Username: "jimeng", Role: model.UserRoleUser}))
			rec := httptest.NewRecorder()
			proxyAIRequest(rec, req, "/videos")
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d body=%s", rec.Code, rec.Body.String())
			}
			if payload := readJSONMap(t, rec.Body.Bytes()); payload["id"] != tt.wantID {
				t.Fatalf("payload = %#v, want id %s", payload, tt.wantID)
			}
		})
	}
}

func TestJimengVideoProxyRefundsRejectedMultipartTask(t *testing.T) {
	setupAIHandlerTestDB(t)
	cliPath := writeFakeJimengCLI(t)
	saveJimengHandlerSettingsWithCredits(t, cliPath, t.TempDir(), 4)
	now := time.Now().Format(time.RFC3339)
	_, err := repository.SaveUser(model.User{ID: "user-jimeng-refund", Username: "jimeng-refund", Role: model.UserRoleUser, Status: model.UserStatusActive, Credits: 24, AffCode: "JMREFUND", CreatedAt: now, UpdatedAt: now})
	if err != nil {
		t.Fatal(err)
	}
	body, contentType := buildHandlerJimengMultipart(t, "image2video", nil)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/videos", bytes.NewReader(body))
	req.Header.Set("Content-Type", contentType)
	req = req.WithContext(service.WithUser(req.Context(), model.AuthUser{ID: "user-jimeng-refund", Username: "jimeng-refund", Role: model.UserRoleUser}))
	rec := httptest.NewRecorder()
	proxyAIRequest(rec, req, "/videos")
	if !strings.Contains(rec.Body.String(), "图生视频需要恰好 1 张图片") {
		t.Fatalf("body = %s", rec.Body.String())
	}
	user, ok, err := repository.GetUserByID("user-jimeng-refund")
	if err != nil || !ok || user.Credits != 24 {
		t.Fatalf("user = %#v ok=%v err=%v, want refunded balance 24", user, ok, err)
	}
}

type handlerJimengUpload struct {
	field       string
	name        string
	contentType string
	body        []byte
	role        string
}

func buildHandlerJimengMultipart(t *testing.T, mode string, files []handlerJimengUpload) ([]byte, string) {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for key, value := range map[string]string{"model": "seedance2.0fast", "dreamina_mode": mode, "prompt": "镜头推进", "duration": "6", "ratio": "9:16", "resolution": "720p"} {
		if err := writer.WriteField(key, value); err != nil {
			t.Fatal(err)
		}
	}
	for _, file := range files {
		header := textproto.MIMEHeader{}
		header.Set("Content-Disposition", `form-data; name="`+file.field+`"; filename="`+file.name+`"`)
		header.Set("Content-Type", file.contentType)
		part, err := writer.CreatePart(header)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := part.Write(file.body); err != nil {
			t.Fatal(err)
		}
		if file.field == "input_image[]" {
			if err := writer.WriteField("input_image_role[]", file.role); err != nil {
				t.Fatal(err)
			}
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return body.Bytes(), writer.FormDataContentType()
}

func TestXinglianVideoProxySubmitsAndFetchesSD2Task(t *testing.T) {
	setupAIHandlerTestDB(t)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer xinglian-key" {
			t.Fatalf("authorization = %q", r.Header.Get("Authorization"))
		}
		switch r.URL.Path {
		case "/v1/video/submit/generate":
			payload := readJSONMap(t, mustReadAll(t, r.Body))
			if payload["model"] != "sd2-720p-fast" || payload["duration"] != float64(6) {
				t.Fatalf("submit payload = %#v", payload)
			}
			_, _ = w.Write([]byte(`{"id":"task-xinglian","status":"queued"}`))
		case "/v1/video/fetch/task-xinglian":
			_, _ = w.Write([]byte(`{"id":"task-xinglian","status":"completed","metadata":{"url":"https://cdn.example.com/xinglian.mp4"}}`))
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer upstream.Close()
	saveXinglianHandlerSettings(t, upstream.URL+"/v1")

	request := httptest.NewRequest(http.MethodPost, "/api/v1/videos", strings.NewReader(`{"model":"sd2-720p-fast","prompt":"一只猫在草地奔跑","duration":6,"ratio":"9:16","generate_audio":true}`))
	request.Header.Set("Content-Type", "application/json")
	request = request.WithContext(service.WithUser(request.Context(), model.AuthUser{ID: "user-xinglian", Username: "xinglian", Role: model.UserRoleUser}))
	response := httptest.NewRecorder()

	proxyAIRequest(response, request, "/videos")
	if response.Code != http.StatusOK {
		t.Fatalf("submit status = %d body=%s", response.Code, response.Body.String())
	}
	if payload := readJSONMap(t, response.Body.Bytes()); payload["id"] != "task-xinglian" || payload["status"] != "queued" {
		t.Fatalf("submit response = %#v", payload)
	}

	fetchRequest := httptest.NewRequest(http.MethodGet, "/api/v1/videos/task-xinglian?model=sd2-720p-fast", nil)
	fetchRequest = fetchRequest.WithContext(request.Context())
	fetchResponse := httptest.NewRecorder()
	proxyAIGetRequest(fetchResponse, fetchRequest, "/videos/task-xinglian")
	if fetchResponse.Code != http.StatusOK {
		t.Fatalf("fetch status = %d body=%s", fetchResponse.Code, fetchResponse.Body.String())
	}
	if payload := readJSONMap(t, fetchResponse.Body.Bytes()); payload["status"] != "completed" || payload["video_url"] != "https://cdn.example.com/xinglian.mp4" {
		t.Fatalf("fetch response = %#v", payload)
	}
}

func TestGeekNowVideoProxyCreatesNormalizedTask(t *testing.T) {
	setupAIHandlerTestDB(t)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1/videos" {
			t.Fatalf("request = %s %s", r.Method, r.URL.Path)
		}
		if authorization := r.Header.Get("Authorization"); authorization != "Bearer geeknow-key" {
			t.Fatalf("authorization = %q", authorization)
		}
		payload := readJSONMap(t, mustReadAll(t, r.Body))
		if payload["model"] != "grok-imagine-video" || payload["prompt"] != "一只猫在草地奔跑" || payload["seconds"] != "6" || payload["aspect_ratio"] != "9:16" || payload["resolution"] != "1080P" {
			t.Fatalf("create payload = %#v", payload)
		}
		if _, exists := payload["duration"]; exists {
			t.Fatalf("unadapted duration leaked upstream: %#v", payload)
		}
		_, _ = w.Write([]byte(`{"data":{"task_id":"task-1","status":"pending","model":"grok-imagine-video"}}`))
	}))
	defer upstream.Close()
	saveGeekNowHandlerSettings(t, upstream.URL+"/v1")

	request := httptest.NewRequest(http.MethodPost, "/api/v1/videos", strings.NewReader(`{"model":"grok-imagine-video","prompt":"一只猫在草地奔跑","duration":6,"ratio":"9:16","resolution":"1080p"}`))
	request.Header.Set("Content-Type", "application/json")
	request = request.WithContext(service.WithUser(request.Context(), model.AuthUser{ID: "user-geeknow", Username: "geeknow", Role: model.UserRoleUser}))
	response := httptest.NewRecorder()

	proxyAIRequest(response, request, "/videos")
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", response.Code, response.Body.String())
	}
	if payload := readJSONMap(t, response.Body.Bytes()); payload["id"] != "task-1" || payload["status"] != "queued" {
		t.Fatalf("response = %#v", payload)
	}
	if response.Header().Get("X-AI-Task-Status") != string(model.AITaskStatusQueued) || response.Header().Get("X-AI-Upstream-Task-ID") != "task-1" {
		t.Fatalf("task headers = %#v", response.Header())
	}
	task, ok, err := repository.GetAITask(response.Header().Get("X-AI-Task-ID"))
	if err != nil || !ok || task.Status != model.AITaskStatusQueued || task.UpstreamTaskID != "task-1" {
		t.Fatalf("saved task = %#v ok=%v err=%v", task, ok, err)
	}
}

func TestGeekNowVideoProxyRefundsTerminalCreateResultOnce(t *testing.T) {
	for _, status := range []model.AITaskStatus{model.AITaskStatusFailed, model.AITaskStatusCancelled} {
		t.Run(string(status), func(t *testing.T) {
			setupAIHandlerTestDB(t)
			taskID := "task-" + string(status)
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_, _ = w.Write([]byte(`{"data":{"task_id":"` + taskID + `","status":"` + string(status) + `","error":{"code":"Rejected","message":"创建失败"}}}`))
			}))
			defer upstream.Close()
			saveGeekNowHandlerSettingsWithCredits(t, upstream.URL+"/v1", 4)
			now := time.Now().Format(time.RFC3339)
			if _, err := repository.SaveUser(model.User{ID: "user-geeknow-terminal", Username: "geeknow-terminal", Role: model.UserRoleUser, Status: model.UserStatusActive, Credits: 10, AffCode: "GKNOWEND", CreatedAt: now, UpdatedAt: now}); err != nil {
				t.Fatal(err)
			}

			request := httptest.NewRequest(http.MethodPost, "/api/v1/videos", strings.NewReader(`{"model":"grok-imagine-video","prompt":"创建终止状态测试"}`))
			request.Header.Set("Content-Type", "application/json")
			request = request.WithContext(service.WithUser(request.Context(), model.AuthUser{ID: "user-geeknow-terminal", Username: "geeknow-terminal", Role: model.UserRoleUser}))
			response := httptest.NewRecorder()
			proxyAIRequest(response, request, "/videos")

			if response.Code != http.StatusOK {
				t.Fatalf("status = %d body=%s", response.Code, response.Body.String())
			}
			if got := response.Header().Get("X-AI-Task-Status"); got != string(status) {
				t.Fatalf("task status header = %q, want %q", got, status)
			}
			task, ok, err := repository.GetAITask(response.Header().Get("X-AI-Task-ID"))
			if err != nil || !ok || task.Status != status || task.CreditsRefunded != 4 || task.RefundedAt == "" {
				t.Fatalf("task = %#v ok=%v err=%v", task, ok, err)
			}
			user, ok, err := repository.GetUserByID("user-geeknow-terminal")
			if err != nil || !ok || user.Credits != 10 {
				t.Fatalf("user = %#v ok=%v err=%v", user, ok, err)
			}
			if refunds, err := repository.CountCreditLogsByRelatedIDAndType(task.ID, model.CreditLogTypeAIRefund); err != nil || refunds != 1 {
				t.Fatalf("refund logs = %d err=%v", refunds, err)
			}
			if err := service.SyncArkVideoAITaskStatus(taskID, response.Body.Bytes()); err != nil {
				t.Fatalf("repeat SyncArkVideoAITaskStatus returned error: %v", err)
			}
			if refunds, err := repository.CountCreditLogsByRelatedIDAndType(task.ID, model.CreditLogTypeAIRefund); err != nil || refunds != 1 {
				t.Fatalf("refund logs after repeat = %d err=%v", refunds, err)
			}
			user, _, _ = repository.GetUserByID("user-geeknow-terminal")
			if user.Credits != 10 {
				t.Fatalf("credits after repeat = %d", user.Credits)
			}
		})
	}
}

func TestGeekNowVideoProxyQueriesTask(t *testing.T) {
	setupAIHandlerTestDB(t)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/v1/videos/task-1" {
			t.Fatalf("request = %s %s", r.Method, r.URL.Path)
		}
		if authorization := r.Header.Get("Authorization"); authorization != "Bearer geeknow-key" {
			t.Fatalf("authorization = %q", authorization)
		}
		_, _ = w.Write([]byte(`{"data":{"task_id":"task-1","status":"completed","output":{"url":"https://cdn.example.com/task-1.mp4"}}}`))
	}))
	defer upstream.Close()
	saveGeekNowHandlerSettings(t, upstream.URL+"/v1")
	seedGeekNowAITask(t)

	request := httptest.NewRequest(http.MethodGet, "/api/v1/videos/task-1?model=grok-imagine-video", nil)
	request = request.WithContext(service.WithUser(request.Context(), model.AuthUser{ID: "user-geeknow", Username: "geeknow", Role: model.UserRoleUser}))
	response := httptest.NewRecorder()

	proxyAIGetRequest(response, request, "/videos/task-1")
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", response.Code, response.Body.String())
	}
	if payload := readJSONMap(t, response.Body.Bytes()); payload["id"] != "task-1" || payload["status"] != "succeeded" || payload["video_url"] != "https://cdn.example.com/task-1.mp4" {
		t.Fatalf("response = %#v", payload)
	}
	task, ok, err := repository.GetAITaskByUpstreamTaskID("task-1")
	if err != nil || !ok || task.Status != model.AITaskStatusSucceeded {
		t.Fatalf("synced task = %#v ok=%v err=%v", task, ok, err)
	}
}

func TestGeekNowVideoProxyQueriesTaskThroughPersistedChannel(t *testing.T) {
	setupAIHandlerTestDB(t)
	geekNowQueries := 0
	geekNow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/videos":
			_, _ = w.Write([]byte(`{"data":{"task_id":"task-bound","status":"pending"}}`))
		case r.Method == http.MethodGet && r.URL.Path == "/v1/videos/task-bound":
			geekNowQueries++
			_, _ = w.Write([]byte(`{"data":{"task_id":"task-bound","status":"completed","output":{"url":"https://cdn.example.com/task-bound.mp4"}}}`))
		default:
			t.Fatalf("unexpected GeekNow request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer geekNow.Close()
	saveGeekNowHandlerSettings(t, geekNow.URL+"/v1")

	createRequest := httptest.NewRequest(http.MethodPost, "/api/v1/videos", strings.NewReader(`{"model":"grok-imagine-video","prompt":"渠道绑定测试"}`))
	createRequest.Header.Set("Content-Type", "application/json")
	createRequest = createRequest.WithContext(service.WithUser(createRequest.Context(), model.AuthUser{ID: "user-geeknow", Username: "geeknow", Role: model.UserRoleUser}))
	createResponse := httptest.NewRecorder()
	proxyAIRequest(createResponse, createRequest, "/videos")
	if createResponse.Code != http.StatusOK {
		t.Fatalf("create status = %d body=%s", createResponse.Code, createResponse.Body.String())
	}
	task, ok, err := repository.GetAITask(createResponse.Header().Get("X-AI-Task-ID"))
	if err != nil || !ok {
		t.Fatalf("created task ok=%v err=%v", ok, err)
	}
	taskJSON, _ := json.Marshal(task)
	if channelID := readJSONMap(t, taskJSON)["channelId"]; channelID != "geeknow-video" {
		t.Fatalf("task channelId = %#v, want geeknow-video", channelID)
	}

	ordinaryQueries := 0
	ordinary := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ordinaryQueries++
		_, _ = w.Write([]byte(`{"id":"task-bound","status":"ordinary-openai"}`))
	}))
	defer ordinary.Close()
	saveCompetingGeekNowHandlerSettings(t, geekNow.URL+"/v1", ordinary.URL)

	queryRequest := httptest.NewRequest(http.MethodGet, "/api/v1/videos/task-bound?model=grok-imagine-video", nil)
	queryRequest = queryRequest.WithContext(createRequest.Context())
	queryResponse := httptest.NewRecorder()
	proxyAIGetRequest(queryResponse, queryRequest, "/videos/task-bound")
	if queryResponse.Code != http.StatusOK {
		t.Fatalf("query status = %d body=%s", queryResponse.Code, queryResponse.Body.String())
	}
	if payload := readJSONMap(t, queryResponse.Body.Bytes()); payload["status"] != "succeeded" {
		t.Fatalf("query response = %#v", payload)
	}
	if geekNowQueries != 1 || ordinaryQueries != 0 {
		t.Fatalf("GeekNow queries=%d ordinary queries=%d", geekNowQueries, ordinaryQueries)
	}
}

func TestOpenAIVideoProxyPersistsLifecycleChannelWithoutChangingBody(t *testing.T) {
	setupAIHandlerTestDB(t)
	const responseBody = `{"id":"task-openai-bound","status":"queued","vendor_field":"keep-me"}`
	ordinaryQueries := 0
	ordinary := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/videos":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(responseBody))
		case r.Method == http.MethodGet && r.URL.Path == "/v1/videos/task-openai-bound":
			ordinaryQueries++
			_, _ = w.Write([]byte(`{"id":"task-openai-bound","status":"completed"}`))
		default:
			t.Fatalf("unexpected ordinary request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer ordinary.Close()
	saveOpenAIVideoHandlerSettings(t, ordinary.URL, "")

	createRequest := httptest.NewRequest(http.MethodPost, "/api/v1/videos", strings.NewReader(`{"model":"shared-openai-video","prompt":"普通 OpenAI 视频"}`))
	createRequest.Header.Set("Content-Type", "application/json")
	createRequest = createRequest.WithContext(service.WithUser(createRequest.Context(), model.AuthUser{ID: "user-openai-video", Username: "openai-video", Role: model.UserRoleUser}))
	createResponse := httptest.NewRecorder()
	proxyAIRequest(createResponse, createRequest, "/videos")
	if createResponse.Code != http.StatusOK || createResponse.Body.String() != responseBody {
		t.Fatalf("create status=%d body=%q", createResponse.Code, createResponse.Body.String())
	}
	if createResponse.Header().Get("X-AI-Upstream-Task-ID") != "task-openai-bound" || createResponse.Header().Get("X-AI-Task-Status") != "queued" {
		t.Fatalf("create headers = %#v", createResponse.Header())
	}
	task, ok, err := repository.GetAITask(createResponse.Header().Get("X-AI-Task-ID"))
	if err != nil || !ok || task.ChannelID != "ordinary-openai-video" || task.UpstreamTaskID != "task-openai-bound" || task.Status != model.AITaskStatusQueued {
		t.Fatalf("task = %#v ok=%v err=%v", task, ok, err)
	}

	geekNowQueries := 0
	geekNow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		geekNowQueries++
		_, _ = w.Write([]byte(`{"data":{"task_id":"task-openai-bound","status":"completed"}}`))
	}))
	defer geekNow.Close()
	saveOpenAIVideoHandlerSettings(t, ordinary.URL, geekNow.URL+"/v1")
	queryRequest := httptest.NewRequest(http.MethodGet, "/api/v1/videos/task-openai-bound?model=shared-openai-video", nil)
	queryRequest = queryRequest.WithContext(createRequest.Context())
	queryResponse := httptest.NewRecorder()
	proxyAIGetRequest(queryResponse, queryRequest, "/videos/task-openai-bound")
	if queryResponse.Code != http.StatusOK || !strings.Contains(queryResponse.Body.String(), `"status":"completed"`) {
		t.Fatalf("query status=%d body=%s", queryResponse.Code, queryResponse.Body.String())
	}
	if ordinaryQueries != 1 || geekNowQueries != 0 {
		t.Fatalf("ordinary queries=%d GeekNow queries=%d", ordinaryQueries, geekNowQueries)
	}
}

func TestGeekNowVideoProxyAddsOpenAIVersionPathForCreateAndQuery(t *testing.T) {
	setupAIHandlerTestDB(t)
	paths := []string{}
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/videos":
			_, _ = w.Write([]byte(`{"data":{"task_id":"task-no-v1","status":"pending"}}`))
		case r.Method == http.MethodGet && r.URL.Path == "/v1/videos/task-no-v1":
			_, _ = w.Write([]byte(`{"data":{"task_id":"task-no-v1","status":"completed"}}`))
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer upstream.Close()
	saveGeekNowHandlerSettings(t, upstream.URL)

	createRequest := httptest.NewRequest(http.MethodPost, "/api/v1/videos", strings.NewReader(`{"model":"grok-imagine-video","prompt":"URL 版本路径测试"}`))
	createRequest.Header.Set("Content-Type", "application/json")
	createRequest = createRequest.WithContext(service.WithUser(createRequest.Context(), model.AuthUser{ID: "user-geeknow", Username: "geeknow", Role: model.UserRoleUser}))
	createResponse := httptest.NewRecorder()
	proxyAIRequest(createResponse, createRequest, "/videos")
	if createResponse.Code != http.StatusOK {
		t.Fatalf("create status = %d body=%s", createResponse.Code, createResponse.Body.String())
	}

	queryRequest := httptest.NewRequest(http.MethodGet, "/api/v1/videos/task-no-v1?model=grok-imagine-video", nil)
	queryRequest = queryRequest.WithContext(createRequest.Context())
	queryResponse := httptest.NewRecorder()
	proxyAIGetRequest(queryResponse, queryRequest, "/videos/task-no-v1")
	if queryResponse.Code != http.StatusOK || !strings.Contains(queryResponse.Body.String(), `"status":"succeeded"`) {
		t.Fatalf("query status = %d body=%s", queryResponse.Code, queryResponse.Body.String())
	}
	if len(paths) != 2 || paths[0] != "/v1/videos" || paths[1] != "/v1/videos/task-no-v1" {
		t.Fatalf("paths = %#v", paths)
	}
}

func TestGeekNowVideoProxyDownloadsContentFromQueriedURL(t *testing.T) {
	setupAIHandlerTestDB(t)
	paths := []string{}
	var upstream *httptest.Server
	upstream = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		if authorization := r.Header.Get("Authorization"); authorization != "Bearer geeknow-key" {
			t.Fatalf("authorization = %q for %s", authorization, r.URL.Path)
		}
		switch r.URL.Path {
		case "/v1/videos/task-1":
			_, _ = w.Write([]byte(`{"data":{"task_id":"task-1","status":"completed","output":{"url":"` + upstream.URL + `/v1/media/task-1.mp4"}}}`))
		case "/v1/media/task-1.mp4":
			w.Header().Set("Content-Type", "video/mp4")
			_, _ = w.Write([]byte("fake-geeknow-video"))
		case "/v1/videos/task-1/content":
			t.Fatal("content proxy guessed the OpenAI /content endpoint instead of querying the task")
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer upstream.Close()
	saveGeekNowHandlerSettings(t, upstream.URL+"/v1")
	seedGeekNowAITask(t)

	request := httptest.NewRequest(http.MethodGet, "/api/v1/videos/task-1/content?model=grok-imagine-video", nil)
	request = request.WithContext(service.WithUser(request.Context(), model.AuthUser{ID: "user-geeknow", Username: "geeknow", Role: model.UserRoleUser}))
	response := httptest.NewRecorder()

	proxyAIGetRequest(response, request, "/videos/task-1/content")
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", response.Code, response.Body.String())
	}
	if response.Body.String() != "fake-geeknow-video" || response.Header().Get("Content-Type") != "video/mp4" {
		t.Fatalf("content type=%q body=%q", response.Header().Get("Content-Type"), response.Body.String())
	}
	if len(paths) != 2 || paths[0] != "/v1/videos/task-1" || paths[1] != "/v1/media/task-1.mp4" {
		t.Fatalf("request paths = %#v", paths)
	}
}

func TestGeekNowVideoProxyUsesOwnedLocalTaskForCollidingUpstreamID(t *testing.T) {
	setupAIHandlerTestDB(t)
	ordinaryQueries := 0
	ordinary := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ordinaryQueries++
		_, _ = w.Write([]byte(`{"id":"shared-upstream-task","status":"completed"}`))
	}))
	defer ordinary.Close()
	geekNowQueries := 0
	var geekNow *httptest.Server
	geekNow = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/videos/shared-upstream-task":
			geekNowQueries++
			_, _ = w.Write([]byte(`{"data":{"task_id":"shared-upstream-task","status":"completed","output":{"url":"` + geekNow.URL + `/v1/media/shared.mp4"}}}`))
		case "/v1/media/shared.mp4":
			w.Header().Set("Content-Type", "video/mp4")
			_, _ = w.Write([]byte("owned-video"))
		default:
			t.Fatalf("unexpected GeekNow path: %s", r.URL.Path)
		}
	}))
	defer geekNow.Close()
	saveCollidingVideoHandlerSettings(t, ordinary.URL, geekNow.URL+"/v1")

	ordinaryTask := seedBoundVideoAITask(t, "user-ordinary-owner", "ordinary-openai-video", "shared-upstream-task")
	geekNowTask := seedBoundVideoAITask(t, "user-geeknow-owner", "geeknow-video", "shared-upstream-task")
	ordinaryTask.CreatedAt = "2099-01-01T00:00:00Z"
	geekNowTask.CreatedAt = "2020-01-01T00:00:00Z"
	_, _ = repository.SaveAITask(ordinaryTask)
	_, _ = repository.SaveAITask(geekNowTask)

	forgedRequest := httptest.NewRequest(http.MethodGet, "/api/v1/videos/shared-upstream-task?model=shared-collision-video", nil)
	forgedRequest.Header.Set("X-AI-Task-ID", geekNowTask.ID)
	forgedRequest = forgedRequest.WithContext(service.WithUser(forgedRequest.Context(), model.AuthUser{ID: "user-ordinary-owner", Username: "ordinary-owner", Role: model.UserRoleUser}))
	forgedResponse := httptest.NewRecorder()
	proxyAIGetRequest(forgedResponse, forgedRequest, "/videos/shared-upstream-task")
	if payload := readJSONMap(t, forgedResponse.Body.Bytes()); payload["code"] != float64(1) {
		t.Fatalf("forged response = %#v", payload)
	}
	if ordinaryQueries != 0 || geekNowQueries != 0 {
		t.Fatalf("forged request reached upstream: ordinary=%d GeekNow=%d", ordinaryQueries, geekNowQueries)
	}

	queryRequest := httptest.NewRequest(http.MethodGet, "/api/v1/videos/shared-upstream-task?model=shared-collision-video", nil)
	queryRequest.Header.Set("X-AI-Task-ID", geekNowTask.ID)
	queryRequest = queryRequest.WithContext(service.WithUser(queryRequest.Context(), model.AuthUser{ID: "user-geeknow-owner", Username: "geeknow-owner", Role: model.UserRoleUser}))
	queryResponse := httptest.NewRecorder()
	proxyAIGetRequest(queryResponse, queryRequest, "/videos/shared-upstream-task")
	if payload := readJSONMap(t, queryResponse.Body.Bytes()); payload["status"] != "succeeded" {
		t.Fatalf("query response = %#v", payload)
	}
	if ordinaryQueries != 0 || geekNowQueries != 1 {
		t.Fatalf("query upstreams: ordinary=%d GeekNow=%d", ordinaryQueries, geekNowQueries)
	}

	contentRequest := httptest.NewRequest(http.MethodGet, "/api/v1/videos/shared-upstream-task/content?model=shared-collision-video", nil)
	contentRequest.Header.Set("X-AI-Task-ID", geekNowTask.ID)
	contentRequest = contentRequest.WithContext(queryRequest.Context())
	contentResponse := httptest.NewRecorder()
	proxyAIGetRequest(contentResponse, contentRequest, "/videos/shared-upstream-task/content")
	if contentResponse.Body.String() != "owned-video" {
		t.Fatalf("content = %q", contentResponse.Body.String())
	}

	ordinarySaved, _, _ := repository.GetAITask(ordinaryTask.ID)
	geekNowSaved, _, _ := repository.GetAITask(geekNowTask.ID)
	if ordinarySaved.Status != model.AITaskStatusQueued || ordinarySaved.FinishedAt != "" {
		t.Fatalf("ordinary task changed: %#v", ordinarySaved)
	}
	if geekNowSaved.Status != model.AITaskStatusSucceeded || geekNowSaved.FinishedAt == "" {
		t.Fatalf("GeekNow task not updated: %#v", geekNowSaved)
	}
}

func TestVideoProxyUsesOwnedLocalTaskAcrossProtocolChannels(t *testing.T) {
	tests := []struct {
		name       string
		modelName  string
		upstreamID string
		channel    func(*testing.T, string) model.ModelChannel
	}{
		{
			name: "ark", modelName: "collision-ark", upstreamID: "shared-ark-task",
			channel: func(t *testing.T, upstreamID string) model.ModelChannel {
				upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					if r.URL.Path != "/contents/generations/tasks/"+upstreamID {
						t.Fatalf("Ark path = %s", r.URL.Path)
					}
					_, _ = w.Write([]byte(`{"id":"` + upstreamID + `","status":"succeeded"}`))
				}))
				t.Cleanup(upstream.Close)
				return model.ModelChannel{ID: "collision-ark-channel", Protocol: string(model.ModelProtocolVolcengineArk), Name: "碰撞 Ark", BaseURL: upstream.URL, APIKey: "ark-key", Models: []string{"collision-ark"}, Enabled: true}
			},
		},
		{
			name: "jimeng", modelName: "collision-jimeng", upstreamID: "jimeng-submit-1",
			channel: func(t *testing.T, _ string) model.ModelChannel {
				return model.ModelChannel{ID: "collision-jimeng-channel", Protocol: string(model.ModelProtocolJimengCLI), Name: "碰撞即梦", CLIPath: writeFakeJimengCLI(t), OutputDir: t.TempDir(), Models: []string{"collision-jimeng"}, Enabled: true}
			},
		},
		{
			name: "xinglian", modelName: "collision-xinglian", upstreamID: "shared-xinglian-task",
			channel: func(t *testing.T, upstreamID string) model.ModelChannel {
				upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					if r.URL.Path != "/v1/video/fetch/"+upstreamID {
						t.Fatalf("Xinglian path = %s", r.URL.Path)
					}
					_, _ = w.Write([]byte(`{"id":"` + upstreamID + `","status":"completed"}`))
				}))
				t.Cleanup(upstream.Close)
				return model.ModelChannel{ID: "collision-xinglian-channel", Protocol: string(model.ModelProtocolXinglianCloud), Name: "碰撞星链", BaseURL: upstream.URL + "/v1", APIKey: "xinglian-key", Models: []string{"collision-xinglian"}, Enabled: true}
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			setupAIHandlerTestDB(t)
			targetChannel := tt.channel(t, tt.upstreamID)
			decoyChannel := model.ModelChannel{ID: "decoy-" + tt.name, Protocol: "openai", Name: "错误渠道", BaseURL: "https://example.invalid/v1", APIKey: "decoy", Models: []string{tt.modelName}, Enabled: true}
			saveVideoLifecycleHandlerSettings(t, tt.modelName, 0, targetChannel, decoyChannel)

			target := seedProtocolVideoAITask(t, "owner-"+tt.name, targetChannel, tt.modelName, tt.upstreamID, 0)
			decoy := seedProtocolVideoAITask(t, "decoy-owner-"+tt.name, decoyChannel, tt.modelName, tt.upstreamID, 0)
			target.CreatedAt = "2020-01-01T00:00:00Z"
			decoy.CreatedAt = "2099-01-01T00:00:00Z"
			_, _ = repository.SaveAITask(target)
			_, _ = repository.SaveAITask(decoy)

			request := httptest.NewRequest(http.MethodGet, "/api/v1/videos/"+tt.upstreamID+"?model="+tt.modelName, nil)
			request.Header.Set("X-AI-Task-ID", target.ID)
			request = request.WithContext(service.WithUser(request.Context(), model.AuthUser{ID: target.UserID, Username: "owner", Role: model.UserRoleUser}))
			response := httptest.NewRecorder()
			proxyAIGetRequest(response, request, "/videos/"+tt.upstreamID)
			if response.Code != http.StatusOK {
				t.Fatalf("status = %d body=%s", response.Code, response.Body.String())
			}

			targetSaved, _, _ := repository.GetAITask(target.ID)
			decoySaved, _, _ := repository.GetAITask(decoy.ID)
			if targetSaved.Status != model.AITaskStatusSucceeded {
				t.Fatalf("target status = %q, want succeeded", targetSaved.Status)
			}
			if decoySaved.Status != model.AITaskStatusQueued {
				t.Fatalf("decoy status = %q, want queued", decoySaved.Status)
			}
		})
	}
}

func TestOpenAIVideoProxySyncsOwnedLocalLifecycle(t *testing.T) {
	setupAIHandlerTestDB(t)
	requests := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		switch r.URL.Path {
		case "/v1/videos/task-running":
			_, _ = w.Write([]byte(`{"id":"task-running","status":"running"}`))
		case "/v1/videos/task-succeeded":
			_, _ = w.Write([]byte(`{"id":"task-succeeded","status":"completed","video_url":"https://example.com/video.mp4"}`))
		case "/v1/videos/task-failed":
			_, _ = w.Write([]byte(`{"id":"task-failed","status":"failed","error":{"code":"Rejected","message":"生成失败"}}`))
		case "/v1/videos/task-content/content":
			w.Header().Set("Content-Type", "video/mp4")
			_, _ = w.Write([]byte("ordinary-video"))
		default:
			t.Fatalf("unexpected OpenAI path: %s", r.URL.Path)
		}
	}))
	defer upstream.Close()
	channel := model.ModelChannel{ID: "ordinary-lifecycle", Protocol: "openai", Name: "普通 OpenAI 生命周期", BaseURL: upstream.URL, APIKey: "ordinary-key", Models: []string{"ordinary-lifecycle-video"}, Enabled: true}
	saveVideoLifecycleHandlerSettings(t, "ordinary-lifecycle-video", 4, channel)
	saveHandlerTestUser(t, "ordinary-owner", 20)

	tasks := map[string]model.AITask{}
	for _, taskID := range []string{"task-running", "task-succeeded", "task-failed", "task-content"} {
		tasks[taskID] = seedProtocolVideoAITask(t, "ordinary-owner", channel, "ordinary-lifecycle-video", taskID, 4)
	}
	if charged, err := service.ConsumeUserCreditsForTask("ordinary-owner", "ordinary-lifecycle-video", 4, "/videos", tasks["task-failed"].ID); err != nil || !charged {
		t.Fatalf("consume charged=%v err=%v", charged, err)
	}

	for _, tt := range []struct {
		taskID string
		want   model.AITaskStatus
	}{{"task-running", model.AITaskStatusRunning}, {"task-succeeded", model.AITaskStatusSucceeded}, {"task-failed", model.AITaskStatusFailed}} {
		request := httptest.NewRequest(http.MethodGet, "/api/v1/videos/"+tt.taskID+"?model=ordinary-lifecycle-video", nil)
		request.Header.Set("X-AI-Task-ID", tasks[tt.taskID].ID)
		request = request.WithContext(service.WithUser(request.Context(), model.AuthUser{ID: "ordinary-owner", Username: "ordinary", Role: model.UserRoleUser}))
		response := httptest.NewRecorder()
		proxyAIGetRequest(response, request, "/videos/"+tt.taskID)
		if response.Code != http.StatusOK {
			t.Fatalf("%s status=%d body=%s", tt.taskID, response.Code, response.Body.String())
		}
		saved, _, _ := repository.GetAITask(tasks[tt.taskID].ID)
		if saved.Status != tt.want {
			t.Fatalf("%s status=%q want=%q", tt.taskID, saved.Status, tt.want)
		}
	}
	failed, _, _ := repository.GetAITask(tasks["task-failed"].ID)
	user, _, _ := repository.GetUserByID("ordinary-owner")
	if failed.CreditsRefunded != 4 || failed.RefundedAt == "" || user.Credits != 20 {
		t.Fatalf("failed=%#v credits=%d", failed, user.Credits)
	}

	contentRequest := httptest.NewRequest(http.MethodGet, "/api/v1/videos/task-content/content?model=ordinary-lifecycle-video", nil)
	contentRequest.Header.Set("X-AI-Task-ID", tasks["task-content"].ID)
	contentRequest = contentRequest.WithContext(service.WithUser(contentRequest.Context(), model.AuthUser{ID: "ordinary-owner", Username: "ordinary", Role: model.UserRoleUser}))
	contentResponse := httptest.NewRecorder()
	proxyAIGetRequest(contentResponse, contentRequest, "/videos/task-content/content")
	contentTask, _, _ := repository.GetAITask(tasks["task-content"].ID)
	if contentResponse.Body.String() != "ordinary-video" || contentTask.FinishedAt == "" {
		t.Fatalf("content=%q task=%#v", contentResponse.Body.String(), contentTask)
	}

	beforeForged := requests
	forged := httptest.NewRequest(http.MethodGet, "/api/v1/videos/task-running?model=ordinary-lifecycle-video", nil)
	forged.Header.Set("X-AI-Task-ID", tasks["task-running"].ID)
	forged = forged.WithContext(service.WithUser(forged.Context(), model.AuthUser{ID: "forged-user", Username: "forged", Role: model.UserRoleUser}))
	forgedResponse := httptest.NewRecorder()
	proxyAIGetRequest(forgedResponse, forged, "/videos/task-running")
	if payload := readJSONMap(t, forgedResponse.Body.Bytes()); payload["code"] != float64(1) || requests != beforeForged {
		t.Fatalf("forged response=%#v requests=%d want=%d", payload, requests, beforeForged)
	}
}

func TestTerminalVideoCreateRefundUsesKnownLocalTaskDespiteCollision(t *testing.T) {
	tests := []struct {
		name      string
		modelName string
		channel   func(string) model.ModelChannel
		response  string
	}{
		{name: "openai", modelName: "terminal-openai", channel: func(baseURL string) model.ModelChannel {
			return model.ModelChannel{ID: "terminal-openai-channel", Protocol: "openai", Name: "普通 OpenAI", BaseURL: baseURL, APIKey: "openai-key", Models: []string{"terminal-openai"}, Enabled: true}
		}, response: `{"id":"shared-terminal-task","status":"failed","error":{"message":"创建失败"}}`},
		{name: "geeknow", modelName: "grok-imagine-video", channel: func(baseURL string) model.ModelChannel {
			return model.ModelChannel{ID: "geeknow-video", Protocol: "openai", Name: "GeekNow 视频", BaseURL: baseURL, APIKey: "geeknow-key", Models: []string{"grok-imagine-video"}, Capabilities: []string{"video", "video_query"}, Enabled: true}
		}, response: `{"data":{"task_id":"shared-terminal-task","status":"failed","error":{"message":"创建失败"}}}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			setupAIHandlerTestDB(t)
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_, _ = w.Write([]byte(tt.response))
			}))
			defer upstream.Close()
			channel := tt.channel(upstream.URL)
			saveVideoLifecycleHandlerSettings(t, tt.modelName, 4, channel)
			saveHandlerTestUser(t, "terminal-owner-"+tt.name, 20)
			decoyChannel := model.ModelChannel{ID: "terminal-decoy-" + tt.name, Protocol: "openai", Name: "旧任务渠道"}
			decoy := seedProtocolVideoAITask(t, "terminal-decoy-owner-"+tt.name, decoyChannel, tt.modelName, "shared-terminal-task", 0)
			decoy.CreatedAt = "2099-01-01T00:00:00Z"
			_, _ = repository.SaveAITask(decoy)

			request := httptest.NewRequest(http.MethodPost, "/api/v1/videos", strings.NewReader(`{"model":"`+tt.modelName+`","prompt":"即时失败"}`))
			request.Header.Set("Content-Type", "application/json")
			request = request.WithContext(service.WithUser(request.Context(), model.AuthUser{ID: "terminal-owner-" + tt.name, Username: "terminal", Role: model.UserRoleUser}))
			response := httptest.NewRecorder()
			proxyAIRequest(response, request, "/videos")
			if response.Code != http.StatusOK {
				t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
			}
			task, ok, err := repository.GetAITask(response.Header().Get("X-AI-Task-ID"))
			user, _, _ := repository.GetUserByID("terminal-owner-" + tt.name)
			if err != nil || !ok || task.Status != model.AITaskStatusFailed || task.CreditsRefunded != 4 || task.RefundedAt == "" || user.Credits != 20 {
				t.Fatalf("task=%#v ok=%v err=%v credits=%d", task, ok, err, user.Credits)
			}
		})
	}
}

func TestGeekNowVideoContentFollowsCrossOriginRedirectWithoutLeakingKey(t *testing.T) {
	cdnRequests := 0
	cdn := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cdnRequests++
		if authorization := r.Header.Get("Authorization"); authorization != "" {
			t.Fatalf("CDN authorization leaked: %q", authorization)
		}
		w.Header().Set("Content-Type", "video/mp4")
		_, _ = w.Write([]byte("redirected-geeknow-video"))
	}))
	defer cdn.Close()

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if authorization := r.Header.Get("Authorization"); authorization != "Bearer geeknow-key" {
			t.Fatalf("GeekNow authorization = %q", authorization)
		}
		http.Redirect(w, r, cdn.URL+"/task-redirect.mp4", http.StatusFound)
	}))
	defer upstream.Close()

	response := httptest.NewRecorder()
	channel := model.ModelChannel{ID: "geeknow-video", BaseURL: upstream.URL + "/v1", APIKey: "geeknow-key"}
	proxyGeekNowVideoContentWithRequester(response, context.Background(), channel, upstream.URL+"/v1/videos/task-redirect/content", newNoRedirectGeekNowTestRequester())

	if cdnRequests != 1 || response.Body.String() != "redirected-geeknow-video" {
		t.Fatalf("cdn requests=%d content=%q", cdnRequests, response.Body.String())
	}
}

func TestGeekNowVideoContentDoesNotSendKeyToDirectThirdPartyURL(t *testing.T) {
	cdnRequests := 0
	cdn := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cdnRequests++
		if authorization := r.Header.Get("Authorization"); authorization != "" {
			t.Fatalf("CDN authorization leaked: %q", authorization)
		}
		w.Header().Set("Content-Type", "video/mp4")
		_, _ = w.Write([]byte("direct-geeknow-video"))
	}))
	defer cdn.Close()

	response := httptest.NewRecorder()
	channel := model.ModelChannel{ID: "geeknow-video", BaseURL: "https://www.geeknow.top/v1", APIKey: "geeknow-key"}
	proxyGeekNowVideoContentWithRequester(response, context.Background(), channel, cdn.URL+"/task-direct.mp4", newNoRedirectGeekNowTestRequester())

	if cdnRequests != 1 || response.Body.String() != "direct-geeknow-video" {
		t.Fatalf("cdn requests=%d content=%q", cdnRequests, response.Body.String())
	}
}

func TestGeekNowVideoContentProductionRequesterRejectsDirectPrivateURL(t *testing.T) {
	response, err := requestGeekNowVideoContent(context.Background(), "http://127.0.0.1/private.mp4", "")
	if response != nil {
		_ = response.Body.Close()
	}
	if err == nil {
		t.Fatal("production requester accepted a loopback video URL")
	}
}

func TestGeekNowVideoContentRejectsCrossOriginPrivateRedirectBeforeRequest(t *testing.T) {
	privateRequests := 0
	private := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		privateRequests++
		w.Header().Set("Content-Type", "video/mp4")
		_, _ = w.Write([]byte("private-video"))
	}))
	defer private.Close()
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if authorization := r.Header.Get("Authorization"); authorization != "Bearer geeknow-key" {
			t.Fatalf("GeekNow authorization = %q", authorization)
		}
		http.Redirect(w, r, private.URL+"/private.mp4", http.StatusFound)
	}))
	defer upstream.Close()

	response := httptest.NewRecorder()
	channel := model.ModelChannel{ID: "geeknow-video", BaseURL: upstream.URL + "/v1", APIKey: "geeknow-key"}
	proxyGeekNowVideoContent(response, context.Background(), channel, upstream.URL+"/v1/videos/task-private/content")

	if privateRequests != 0 || strings.Contains(response.Body.String(), "private-video") {
		t.Fatalf("private requests=%d body=%q", privateRequests, response.Body.String())
	}
}

func newNoRedirectGeekNowTestRequester() geekNowVideoContentRequester {
	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	return func(ctx context.Context, rawURL string, authorization string) (*http.Response, error) {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
		if err != nil {
			return nil, err
		}
		if authorization != "" {
			request.Header.Set("Authorization", authorization)
		}
		return client.Do(request)
	}
}

func TestJimengVideoProxyDownloadsContentThroughCLIChannel(t *testing.T) {
	setupAIHandlerTestDB(t)
	cliPath := writeFakeJimengCLI(t)
	outputDir := t.TempDir()
	saveJimengHandlerSettings(t, cliPath, outputDir)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/videos/jimeng-submit-1/content?model=seedance2.0fast", nil)
	req = req.WithContext(service.WithUser(req.Context(), model.AuthUser{ID: "user-jimeng", Username: "jimeng", Role: model.UserRoleUser}))
	rec := httptest.NewRecorder()

	proxyAIGetRequest(rec, req, "/videos/jimeng-submit-1/content")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", rec.Code, rec.Body.String())
	}
	if rec.Body.String() != "fake-video" {
		t.Fatalf("content = %q, want fake video", rec.Body.String())
	}
	if contentType := rec.Header().Get("Content-Type"); !strings.HasPrefix(contentType, "video/") && contentType != "application/octet-stream" {
		t.Fatalf("content type = %q, want video content", contentType)
	}
}

func TestNormalizeArkVideoTaskResponseKeepsTaskDetails(t *testing.T) {
	source := []byte(`{
		"id": "cgt-2026-test",
		"status": "failed",
		"content": { "video_url": "https://example.com/video.mp4" },
		"error": { "code": "TaskFailed", "message": "生成失败原因" },
		"created_at": 1700000000,
		"updated_at": 1700000100,
		"execution_expires_after": 172800,
		"seed": 42,
		"resolution": "1080p",
		"ratio": "16:9",
		"duration": 5,
		"generate_audio": true,
		"watermark": false
	}`)

	body, err := service.NormalizeArkVideoTaskResponse(source)
	if err != nil {
		t.Fatalf("normalizeArkVideoTaskResponse returned error: %v", err)
	}

	payload := readJSONMap(t, body)
	if payload["status"] != "failed" {
		t.Fatalf("status = %#v, want failed", payload["status"])
	}
	if payload["video_url"] != "https://example.com/video.mp4" {
		t.Fatalf("video_url = %#v", payload["video_url"])
	}
	if payload["created_at"] != float64(1700000000) || payload["updated_at"] != float64(1700000100) {
		t.Fatalf("timestamps = %#v/%#v", payload["created_at"], payload["updated_at"])
	}
	if payload["execution_expires_after"] != float64(172800) {
		t.Fatalf("execution_expires_after = %#v", payload["execution_expires_after"])
	}
	if payload["video_url_expires_at"] != float64(1700172900) {
		t.Fatalf("video_url_expires_at = %#v", payload["video_url_expires_at"])
	}
	if payload["seed"] != float64(42) || payload["resolution"] != "1080p" || payload["ratio"] != "16:9" || payload["duration"] != float64(5) {
		t.Fatalf("task params were not preserved: %#v", payload)
	}
	if payload["generate_audio"] != true || payload["watermark"] != false {
		t.Fatalf("boolean params were not preserved: %#v", payload)
	}

	taskError, ok := payload["error"].(map[string]any)
	if !ok {
		t.Fatalf("error payload = %#v", payload["error"])
	}
	if taskError["code"] != "TaskFailed" || taskError["message"] != "生成失败原因" {
		t.Fatalf("error payload = %#v", taskError)
	}
}

func TestNormalizeArkVideoTaskResponseReadsNestedEnvelope(t *testing.T) {
	source := []byte(`{
		"data": {
			"task_id": "cgt-nested",
			"status": "succeeded",
			"output": [
				{
					"url": "https://example.com/nested.mp4",
					"last_frame_url": "https://example.com/last.png"
				}
			],
			"created_at": "1700000000",
			"execution_expires_after": "3600",
			"generate_audio": "true"
		}
	}`)

	body, err := service.NormalizeArkVideoTaskResponse(source)
	if err != nil {
		t.Fatalf("normalizeArkVideoTaskResponse returned error: %v", err)
	}

	payload := readJSONMap(t, body)
	if payload["id"] != "cgt-nested" || payload["status"] != "completed" || payload["raw_status"] != "succeeded" {
		t.Fatalf("task identity/status = %#v", payload)
	}
	if payload["video_url"] != "https://example.com/nested.mp4" || payload["last_frame_url"] != "https://example.com/last.png" {
		t.Fatalf("task media urls = %#v", payload)
	}
	if payload["video_url_expires_at"] != float64(1700003600) || payload["generate_audio"] != true {
		t.Fatalf("task typed fields = %#v", payload)
	}
	if url := service.ArkTaskVideoURL(source); url != "https://example.com/nested.mp4" {
		t.Fatalf("ArkTaskVideoURL = %q", url)
	}
}

func TestUpstreamErrorMessageKeepsArkPrivacyError(t *testing.T) {
	body := []byte(`{"error":{"code":"InputImageSensitiveContentDetected.PrivacyInformation","message":"The request failed because the input image may contain real person."}}`)

	message := upstreamErrorMessage(body, "AI 接口请求失败")
	if message != "输入图片疑似包含真人或隐私信息，火山 Ark 已拒绝本次生成。请更换参考图，或先完成素材加白后再试。（InputImageSensitiveContentDetected.PrivacyInformation）" {
		t.Fatalf("message = %q", message)
	}
}

func TestUpstreamErrorMessageKeepsGenericErrorMessage(t *testing.T) {
	body := []byte(`{"error":{"code":"BadRequest","message":"invalid prompt"}}`)

	message := upstreamErrorMessage(body, "AI 接口请求失败")
	if message != "BadRequest：invalid prompt" {
		t.Fatalf("message = %q", message)
	}
}

func TestValidateProxyDownloadURLRejectsUnsafeTargets(t *testing.T) {
	tests := []string{
		"file:///etc/passwd",
		"http://127.0.0.1/video.mp4",
		"http://localhost/video.mp4",
		"http://10.0.0.1/video.mp4",
		"http://169.254.169.254/latest/meta-data/",
	}
	for _, rawURL := range tests {
		if err := validateProxyDownloadURL(context.Background(), rawURL); err == nil {
			t.Fatalf("validateProxyDownloadURL(%q) returned nil", rawURL)
		}
	}
}

func TestValidateProxyDownloadURLAllowsPublicIP(t *testing.T) {
	if err := validateProxyDownloadURL(context.Background(), "https://8.8.8.8/video.mp4"); err != nil {
		t.Fatalf("validateProxyDownloadURL returned error: %v", err)
	}
}

func TestReadLimitedAIRequestBodyRejectsOversizedBody(t *testing.T) {
	_, err := readLimitedAIRequestBody(io.LimitReader(zeroReader{}, 9), 8)
	if err == nil {
		t.Fatal("readLimitedAIRequestBody returned nil error for oversized body")
	}
}

func TestReadAIRequestUsageUsesRequestBillingUnit(t *testing.T) {
	tests := []struct {
		name        string
		path        string
		requestKind string
		body        string
		contentType string
		want        int
	}{
		{name: "video duration", path: "/videos", body: `{"duration":6}`, contentType: "application/json", want: 6},
		{name: "video seconds", path: "/videos", body: `{"seconds":10}`, contentType: "application/json", want: 10},
		{name: "image count", path: "/images/generations", body: `{"n":4}`, contentType: "application/json", want: 4},
		{name: "text call", path: "/chat/completions", body: `{"n":4}`, contentType: "application/json", want: 1},
		{name: "image chat adapter count", path: "/chat/completions", requestKind: "image", body: `{"n":4}`, contentType: "application/json", want: 4},
		{name: "invalid video duration", path: "/videos", body: `{"duration":0}`, contentType: "application/json", want: 1},
		{name: "capped video duration", path: "/videos", body: `{"duration":999}`, contentType: "application/json", want: maxAIRequestCount},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := readAIRequestUsage(tt.path, tt.requestKind, []byte(tt.body), tt.contentType); got != tt.want {
				t.Fatalf("usage = %d, want %d", got, tt.want)
			}
		})
	}
}

func TestReadAIRequestUsageForModelUsesArkSeedance25Limit(t *testing.T) {
	tests := []struct {
		name      string
		path      string
		body      string
		modelName string
		protocol  string
		want      int
	}{
		{name: "Ark Seedance 2.5 automatic edit reserves maximum", path: "/videos", body: `{"_seedance_task_mode":"edit","duration":-1}`, modelName: "doubao-seedance-2-5", protocol: string(model.ModelProtocolVolcengineArk), want: 30},
		{name: "Ark Seedance 2.5 edit ignores forged duration and billing", path: "/videos", body: `{"_seedance_task_mode":"edit","_seedance_billing_duration":1,"duration":1}`, modelName: "doubao-seedance-2-5", protocol: string(model.ModelProtocolVolcengineArk), want: 30},
		{name: "Ark Seedance 2.5 edit without billing reserves maximum", path: "/videos", body: `{"_seedance_task_mode":"edit","duration":30}`, modelName: "doubao-seedance-2-5", protocol: string(model.ModelProtocolVolcengineArk), want: 30},
		{name: "Ark Seedance 2.5 generate defaults invalid duration", path: "/videos", body: `{"_seedance_task_mode":"generate","duration":-1}`, modelName: "doubao-seedance-2-5", protocol: string(model.ModelProtocolVolcengineArk), want: 6},
		{name: "Ark Seedance 2.5 extend defaults invalid duration", path: "/videos", body: `{"_seedance_task_mode":"extend","duration":-1}`, modelName: "doubao-seedance-2-5", protocol: string(model.ModelProtocolVolcengineArk), want: 6},
		{name: "Ark Seedance 2.5 raises one second duration", path: "/videos", body: `{"duration":1}`, modelName: "doubao-seedance-2-5", protocol: string(model.ModelProtocolVolcengineArk), want: 4},
		{name: "Ark Seedance 2.5 raises three second duration", path: "/videos", body: `{"duration":3}`, modelName: "doubao-seedance-2-5", protocol: string(model.ModelProtocolVolcengineArk), want: 4},
		{name: "Ark Seedance 2.5 truncates fractional duration", path: "/videos", body: `{"duration":14.9}`, modelName: "doubao-seedance-2-5", protocol: string(model.ModelProtocolVolcengineArk), want: 14},
		{name: "Ark Seedance 2.5 truncates fractional duration before minimum", path: "/videos", body: `{"duration":3.9}`, modelName: "doubao-seedance-2-5", protocol: string(model.ModelProtocolVolcengineArk), want: 4},
		{name: "Ark duration zero takes precedence over seconds", path: "/videos", body: `{"duration":0,"seconds":1}`, modelName: "doubao-seedance-2-5", protocol: string(model.ModelProtocolVolcengineArk), want: 6},
		{name: "Ark invalid duration takes precedence over seconds", path: "/videos", body: `{"duration":"invalid","seconds":10}`, modelName: "doubao-seedance-2-5", protocol: string(model.ModelProtocolVolcengineArk), want: 6},
		{name: "Ark empty duration falls back to seconds", path: "/videos", body: `{"duration":" ","seconds":10}`, modelName: "doubao-seedance-2-5", protocol: string(model.ModelProtocolVolcengineArk), want: 10},
		{name: "Ark seconds alias uses minimum duration", path: "/videos", body: `{"seconds":1}`, modelName: "doubao-seedance-2-5", protocol: string(model.ModelProtocolVolcengineArk), want: 4},
		{name: "Ark Seedance 2.5 generate ignores private duration", path: "/videos", body: `{"_seedance_task_mode":"generate","_seedance_billing_duration":1,"duration":30}`, modelName: "doubao-seedance-2-5", protocol: string(model.ModelProtocolVolcengineArk), want: 30},
		{name: "Ark Seedance 2.5 generate caps duration", path: "/videos", body: `{"_seedance_task_mode":"generate","duration":999}`, modelName: "doubao-seedance-2-5", protocol: string(model.ModelProtocolVolcengineArk), want: 30},
		{name: "Ark dated Seedance 2.5 alias keeps maximum", path: "/videos", body: `{"duration":30}`, modelName: "doubao-seedance-2-5-260628", protocol: string(model.ModelProtocolVolcengineArk), want: 30},
		{name: "Ark Seedance 2.0 keeps default limit", path: "/videos", body: `{"duration":30}`, modelName: "doubao-seedance-2-0", protocol: string(model.ModelProtocolVolcengineArk), want: maxAIRequestCount},
		{name: "Ark Seedance 2.0 generate defaults invalid duration", path: "/videos", body: `{"_seedance_task_mode":"generate","duration":-1}`, modelName: "doubao-seedance-2-0", protocol: string(model.ModelProtocolVolcengineArk), want: 6},
		{name: "Ark Seedance 2.0 raises two second duration", path: "/videos", body: `{"duration":2}`, modelName: "doubao-seedance-2-0", protocol: string(model.ModelProtocolVolcengineArk), want: 4},
		{name: "OpenAI video keeps one second duration", path: "/videos", body: `{"duration":1}`, modelName: "video-model", protocol: string(model.ModelProtocolOpenAI), want: 1},
		{name: "Jimeng Seedance 2.5 keeps default limit", path: "/videos", body: `{"duration":30}`, modelName: "doubao-seedance-2-5", protocol: string(model.ModelProtocolJimengCLI), want: maxAIRequestCount},
		{name: "image count keeps default limit", path: "/images/generations", body: `{"n":999}`, modelName: "doubao-seedance-2-5", protocol: string(model.ModelProtocolVolcengineArk), want: maxAIRequestCount},
		{name: "Ark Seedance 2.50 keeps default limit", path: "/videos", body: `{"duration":30}`, modelName: "doubao-seedance-2-50", protocol: string(model.ModelProtocolVolcengineArk), want: maxAIRequestCount},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := readAIRequestUsageForModel(tt.path, "", []byte(tt.body), "application/json", tt.modelName, tt.protocol); got != tt.want {
				t.Fatalf("usage = %d, want %d", got, tt.want)
			}
		})
	}
}

func TestReadAIRequestUsageForModelSupportsMultipartAutomaticEdit(t *testing.T) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	writeMultipartField(t, writer, "_seedance_task_mode", "edit")
	writeMultipartField(t, writer, "_seedance_billing_duration", "1")
	writeMultipartField(t, writer, "duration", "1")
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if got := readAIRequestUsageForModel("/videos", "", body.Bytes(), writer.FormDataContentType(), "doubao-seedance-2-5", string(model.ModelProtocolVolcengineArk)); got != 30 {
		t.Fatalf("multipart usage = %d, want 30", got)
	}
}

func TestReadAIRequestUsageForModelKeepsMultipartDurationAliasPrecedence(t *testing.T) {
	tests := []struct {
		name   string
		fields map[string]string
		want   int
	}{
		{name: "zero duration", fields: map[string]string{"duration": "0", "seconds": "1"}, want: 6},
		{name: "invalid duration", fields: map[string]string{"duration": "invalid", "seconds": "10"}, want: 6},
		{name: "empty duration", fields: map[string]string{"duration": " ", "seconds": "10"}, want: 10},
		{name: "seconds only", fields: map[string]string{"seconds": "1"}, want: 4},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var body bytes.Buffer
			writer := multipart.NewWriter(&body)
			for key, value := range tt.fields {
				writeMultipartField(t, writer, key, value)
			}
			if err := writer.Close(); err != nil {
				t.Fatal(err)
			}
			if got := readAIRequestUsageForModel("/videos", "", body.Bytes(), writer.FormDataContentType(), "doubao-seedance-2-5", string(model.ModelProtocolVolcengineArk)); got != tt.want {
				t.Fatalf("multipart usage = %d, want %d", got, tt.want)
			}
		})
	}
}

func writeMultipartField(t *testing.T, writer *multipart.Writer, key string, value string) {
	t.Helper()
	if err := writer.WriteField(key, value); err != nil {
		t.Fatalf("WriteField %s: %v", key, err)
	}
}

func TestValidateProxyVideoContentResponseRejectsOversizedAndNonVideo(t *testing.T) {
	if err := validateProxyVideoContentResponse(&http.Response{ContentLength: maxVideoDownloadBytes + 1}); err == nil {
		t.Fatal("validateProxyVideoContentResponse accepted oversized response")
	}
	response := &http.Response{Header: http.Header{"Content-Type": {"text/html"}}}
	if err := validateProxyVideoContentResponse(response); err == nil {
		t.Fatal("validateProxyVideoContentResponse accepted non-video response")
	}
}

type zeroReader struct{}

func (zeroReader) Read(p []byte) (int, error) {
	for i := range p {
		p[i] = 0
	}
	return len(p), nil
}

func readJSONMap(t *testing.T, body []byte) map[string]any {
	t.Helper()
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	return payload
}

func mustReadAll(t *testing.T, reader io.Reader) []byte {
	t.Helper()
	body, err := io.ReadAll(reader)
	if err != nil {
		t.Fatal(err)
	}
	return body
}

func setupAIHandlerTestDB(t *testing.T) {
	t.Helper()
	tmp := t.TempDir()
	oldStorageDriver := config.Cfg.StorageDriver
	oldDatabaseDSN := config.Cfg.DatabaseDSN
	t.Cleanup(func() {
		config.Cfg.StorageDriver = oldStorageDriver
		config.Cfg.DatabaseDSN = oldDatabaseDSN
		repository.ResetForTest()
	})
	config.Cfg.StorageDriver = "sqlite"
	config.Cfg.DatabaseDSN = filepath.Join(tmp, "test.db")
	repository.ResetForTest()
}

func saveAIHandlerSettings(t *testing.T, allowCustomChannel bool, upstreamURL string) {
	t.Helper()
	now := time.Now().Format(time.RFC3339)
	_, err := repository.SaveSettings(model.Settings{
		Public: model.PublicSetting{
			ModelChannel: model.PublicModelChannelSetting{
				AllowCustomChannel: &allowCustomChannel,
				AvailableModels:    []string{"ep-test"},
				DefaultVideoModel:  "ep-test",
				ModelCosts:         []model.ModelCost{{Model: "ep-test", Credits: 0}},
			},
		},
		Private: model.PrivateSetting{
			Channels: []model.ModelChannel{{
				Protocol: string(model.ModelProtocolVolcengineArk),
				Name:     "ark-backend",
				BaseURL:  upstreamURL,
				APIKey:   "backend-key",
				Models:   []string{"ep-test"},
				Weight:   1,
				Enabled:  true,
			}},
		},
	}, now)
	if err != nil {
		t.Fatalf("SaveSettings returned error: %v", err)
	}
}

func saveArk25HandlerSettings(t *testing.T, upstreamURL string) {
	t.Helper()
	now := time.Now().Format(time.RFC3339)
	_, err := repository.SaveSettings(model.Settings{
		Public: model.PublicSetting{ModelChannel: model.PublicModelChannelSetting{
			AvailableModels:   []string{"doubao-seedance-2-0", "doubao-seedance-2-5"},
			DefaultVideoModel: "doubao-seedance-2-0",
			ModelCosts:        []model.ModelCost{{Model: "doubao-seedance-2-0", Credits: 2}, {Model: "doubao-seedance-2-5", Credits: 1}},
		}},
		Private: model.PrivateSetting{Channels: []model.ModelChannel{{
			Protocol:         string(model.ModelProtocolVolcengineArk),
			Name:             "ark-seedance-25",
			BaseURL:          upstreamURL,
			APIKey:           "backend-key",
			Models:           []string{"doubao-seedance-2-0", "doubao-seedance-2-5"},
			EndpointMappings: []model.ModelEndpointMapping{{Model: "doubao-seedance-2-0", EndpointID: "ep-20"}, {Model: "doubao-seedance-2-5", EndpointID: "ep-25"}},
			Weight:           1,
			Enabled:          true,
		}}},
	}, now)
	if err != nil {
		t.Fatalf("SaveSettings returned error: %v", err)
	}
}

func saveJimengHandlerSettings(t *testing.T, cliPath string, outputDir string) {
	saveJimengHandlerSettingsWithCredits(t, cliPath, outputDir, 0)
}

func saveJimengHandlerSettingsWithCredits(t *testing.T, cliPath string, outputDir string, credits int) {
	t.Helper()
	now := time.Now().Format(time.RFC3339)
	_, err := repository.SaveSettings(model.Settings{
		Public: model.PublicSetting{
			ModelChannel: model.PublicModelChannelSetting{
				AvailableModels:   []string{"seedance2.0fast"},
				DefaultVideoModel: "seedance2.0fast",
				ModelCosts:        []model.ModelCost{{Model: "seedance2.0fast", Credits: credits}},
			},
		},
		Private: model.PrivateSetting{
			Channels: []model.ModelChannel{{
				Protocol:  string(model.ModelProtocolJimengCLI),
				Name:      "jimeng-cli",
				CLIPath:   cliPath,
				OutputDir: outputDir,
				Models:    []string{"seedance2.0fast"},
				Enabled:   true,
			}},
		},
	}, now)
	if err != nil {
		t.Fatalf("SaveSettings returned error: %v", err)
	}
}

func saveXinglianHandlerSettings(t *testing.T, upstreamURL string) {
	t.Helper()
	now := time.Now().Format(time.RFC3339)
	_, err := repository.SaveSettings(model.Settings{
		Public: model.PublicSetting{ModelChannel: model.PublicModelChannelSetting{
			AvailableModels:   []string{"sd2-720p-fast"},
			DefaultVideoModel: "sd2-720p-fast",
			ModelCosts:        []model.ModelCost{{Model: "sd2-720p-fast", Credits: 0}},
		}},
		Private: model.PrivateSetting{Channels: []model.ModelChannel{{
			Protocol: string(model.ModelProtocolXinglianCloud),
			Name:     "星链云",
			BaseURL:  upstreamURL,
			APIKey:   "xinglian-key",
			Models:   []string{"sd2-720p-fast"},
			Weight:   1,
			Enabled:  true,
		}}},
	}, now)
	if err != nil {
		t.Fatalf("SaveSettings returned error: %v", err)
	}
}

func saveGeekNowHandlerSettings(t *testing.T, upstreamURL string) {
	saveGeekNowHandlerSettingsWithCredits(t, upstreamURL, 0)
}

func saveGeekNowHandlerSettingsWithCredits(t *testing.T, upstreamURL string, credits int) {
	t.Helper()
	now := time.Now().Format(time.RFC3339)
	_, err := repository.SaveSettings(model.Settings{
		Public: model.PublicSetting{ModelChannel: model.PublicModelChannelSetting{
			AvailableModels:   []string{"grok-imagine-video"},
			DefaultVideoModel: "grok-imagine-video",
			ModelCosts:        []model.ModelCost{{Model: "grok-imagine-video", Credits: credits}},
		}},
		Private: model.PrivateSetting{Channels: []model.ModelChannel{{
			ID:           "geeknow-video",
			Protocol:     "openai",
			Name:         "GeekNow 视频",
			BaseURL:      upstreamURL,
			APIKey:       "geeknow-key",
			Models:       []string{"grok-imagine-video"},
			Capabilities: []string{"video", "video_query"},
			Weight:       1,
			Enabled:      true,
		}}},
	}, now)
	if err != nil {
		t.Fatalf("SaveSettings returned error: %v", err)
	}
}

func saveCompetingGeekNowHandlerSettings(t *testing.T, geekNowURL string, ordinaryURL string) {
	t.Helper()
	now := time.Now().Format(time.RFC3339)
	_, err := repository.SaveSettings(model.Settings{
		Public: model.PublicSetting{ModelChannel: model.PublicModelChannelSetting{
			AvailableModels:   []string{"grok-imagine-video"},
			DefaultVideoModel: "grok-imagine-video",
			ModelCosts:        []model.ModelCost{{Model: "grok-imagine-video", Credits: 0}},
		}},
		Private: model.PrivateSetting{Channels: []model.ModelChannel{
			{ID: "ordinary-openai", Protocol: "openai", Name: "普通 OpenAI", BaseURL: ordinaryURL, APIKey: "ordinary-key", Models: []string{"grok-imagine-video"}, Capabilities: []string{"video"}, Weight: 100, Enabled: true},
			{ID: "geeknow-video", Protocol: "openai", Name: "GeekNow 视频", BaseURL: geekNowURL, APIKey: "geeknow-key", Models: []string{"grok-imagine-video"}, Capabilities: []string{"video", "video_query"}, Weight: 1, Enabled: true},
		}},
	}, now)
	if err != nil {
		t.Fatalf("SaveSettings returned error: %v", err)
	}
}

func saveOpenAIVideoHandlerSettings(t *testing.T, ordinaryURL string, geekNowURL string) {
	t.Helper()
	channels := []model.ModelChannel{{ID: "ordinary-openai-video", Protocol: "openai", Name: "普通 OpenAI 视频", BaseURL: ordinaryURL, APIKey: "ordinary-key", Models: []string{"shared-openai-video"}, Weight: 1, Enabled: true}}
	if geekNowURL != "" {
		channels = append([]model.ModelChannel{{ID: "geeknow-video", Protocol: "openai", Name: "GeekNow 视频", BaseURL: geekNowURL, APIKey: "geeknow-key", Models: []string{"shared-openai-video"}, Capabilities: []string{"video", "video_query"}, Weight: 100, Enabled: true}}, channels...)
	}
	_, err := repository.SaveSettings(model.Settings{
		Public:  model.PublicSetting{ModelChannel: model.PublicModelChannelSetting{AvailableModels: []string{"shared-openai-video"}, DefaultVideoModel: "shared-openai-video", ModelCosts: []model.ModelCost{{Model: "shared-openai-video", Credits: 0}}}},
		Private: model.PrivateSetting{Channels: channels},
	}, time.Now().Format(time.RFC3339))
	if err != nil {
		t.Fatalf("SaveSettings returned error: %v", err)
	}
}

func saveCollidingVideoHandlerSettings(t *testing.T, ordinaryURL string, geekNowURL string) {
	t.Helper()
	_, err := repository.SaveSettings(model.Settings{
		Public: model.PublicSetting{ModelChannel: model.PublicModelChannelSetting{AvailableModels: []string{"shared-collision-video"}, DefaultVideoModel: "shared-collision-video", ModelCosts: []model.ModelCost{{Model: "shared-collision-video", Credits: 0}}}},
		Private: model.PrivateSetting{Channels: []model.ModelChannel{
			{ID: "ordinary-openai-video", Protocol: "openai", Name: "普通 OpenAI 视频", BaseURL: ordinaryURL, APIKey: "ordinary-key", Models: []string{"shared-collision-video"}, Weight: 1, Enabled: true},
			{ID: "geeknow-video", Protocol: "openai", Name: "GeekNow 视频", BaseURL: geekNowURL, APIKey: "geeknow-key", Models: []string{"shared-collision-video"}, Capabilities: []string{"video", "video_query"}, Weight: 1, Enabled: true},
		}},
	}, time.Now().Format(time.RFC3339))
	if err != nil {
		t.Fatal(err)
	}
}

func saveVideoLifecycleHandlerSettings(t *testing.T, modelName string, credits int, channels ...model.ModelChannel) {
	t.Helper()
	_, err := repository.SaveSettings(model.Settings{
		Public:  model.PublicSetting{ModelChannel: model.PublicModelChannelSetting{AvailableModels: []string{modelName}, DefaultVideoModel: modelName, ModelCosts: []model.ModelCost{{Model: modelName, Credits: credits}}}},
		Private: model.PrivateSetting{Channels: channels},
	}, time.Now().Format(time.RFC3339))
	if err != nil {
		t.Fatal(err)
	}
}

func saveHandlerTestUser(t *testing.T, id string, credits int) {
	t.Helper()
	now := time.Now().Format(time.RFC3339)
	if _, err := repository.SaveUser(model.User{ID: id, Username: id, Role: model.UserRoleUser, Status: model.UserStatusActive, Credits: credits, AffCode: strings.ToUpper(id), CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatal(err)
	}
}

func seedProtocolVideoAITask(t *testing.T, userID string, channel model.ModelChannel, modelName string, upstreamTaskID string, credits int) model.AITask {
	t.Helper()
	task, err := service.CreateAITask(service.CreateAITaskInput{UserID: userID, ChannelID: channel.ID, Model: modelName, Credits: credits, Path: "/videos", TaskType: "video_create", Provider: channel.Name, Protocol: channel.Protocol})
	if err != nil {
		t.Fatal(err)
	}
	if err := service.MarkAITaskArkCreated(task.ID, []byte(`{"id":"`+upstreamTaskID+`","status":"queued"}`)); err != nil {
		t.Fatal(err)
	}
	saved, _, _ := repository.GetAITask(task.ID)
	return saved
}

func seedBoundVideoAITask(t *testing.T, userID string, channelID string, upstreamTaskID string) model.AITask {
	t.Helper()
	task, err := service.CreateAITask(service.CreateAITaskInput{UserID: userID, ChannelID: channelID, Model: "shared-collision-video", Path: "/videos", TaskType: "video_create", Provider: channelID, Protocol: "openai"})
	if err != nil {
		t.Fatal(err)
	}
	if err := service.MarkAITaskArkCreated(task.ID, []byte(`{"id":"`+upstreamTaskID+`","status":"queued"}`)); err != nil {
		t.Fatal(err)
	}
	saved, _, _ := repository.GetAITask(task.ID)
	return saved
}

func seedGeekNowAITask(t *testing.T) {
	t.Helper()
	task, err := service.CreateAITask(service.CreateAITaskInput{
		UserID: "user-geeknow", TaskType: "video_create", Provider: "GeekNow 视频", Protocol: "openai",
		Model: "grok-imagine-video", Path: "/videos", RequestBody: []byte(`{"model":"grok-imagine-video"}`), ContentType: "application/json",
	})
	if err != nil {
		t.Fatalf("CreateAITask returned error: %v", err)
	}
	if err := service.MarkAITaskArkCreated(task.ID, []byte(`{"id":"task-1","status":"queued","raw_status":"pending"}`)); err != nil {
		t.Fatalf("MarkAITaskArkCreated returned error: %v", err)
	}
}

func writeFakeJimengCLI(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "dreamina")
	script := `#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  version)
    printf '{"version":"test-jimeng"}\n'
    ;;
  user_credit)
    printf '{"credits":100}\n'
    ;;
  text2video)
    printf '{"submit_id":"jimeng-submit-1","gen_status":"querying","model_version":"seedance2.0fast","duration":6,"ratio":"9:16","video_resolution":"720p"}\n'
    ;;
  image2video|frames2video|multiframe2video|multimodal2video)
    printf '{"submit_id":"jimeng-%s","gen_status":"querying","model_version":"seedance2.0fast","duration":6,"ratio":"9:16","video_resolution":"720p"}\n' "$1"
    ;;
  query_result)
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
`
	if err := os.WriteFile(path, []byte(script), 0755); err != nil {
		t.Fatalf("Write fake dreamina: %v", err)
	}
	return path
}
