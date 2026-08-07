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

func TestArkSeedance25ProxyUsesLocalCapabilitiesBeforeEndpointRouting(t *testing.T) {
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
		"model": "doubao-seedance-2-5",
		"content": [{"type":"text","text":"编辑短视频"},{"type":"video_url","video_url":{"url":"asset://video-id"},"role":"reference_video"}],
		"duration": 30,
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
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", rec.Code, rec.Body.String())
	}
	if credits := rec.Header().Get("X-AI-Task-Credits"); credits != "30" {
		t.Fatalf("task credits = %q, want 30", credits)
	}
	if user, ok, err := repository.GetUserByID("user-seedance-25"); err != nil || !ok || user.Credits != 70 {
		t.Fatalf("user = %#v ok=%v err=%v, want balance 70", user, ok, err)
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
		{name: "Ark Seedance 2.5 full duration", path: "/videos", body: `{"duration":30}`, modelName: "doubao-seedance-2-5", protocol: string(model.ModelProtocolVolcengineArk), want: 30},
		{name: "Ark Seedance 2.5 capped duration", path: "/videos", body: `{"duration":999}`, modelName: "doubao-seedance-2-5", protocol: string(model.ModelProtocolVolcengineArk), want: 30},
		{name: "Ark Seedance 2.0 keeps default limit", path: "/videos", body: `{"duration":30}`, modelName: "doubao-seedance-2-0", protocol: string(model.ModelProtocolVolcengineArk), want: maxAIRequestCount},
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
			AvailableModels:   []string{"doubao-seedance-2-5"},
			DefaultVideoModel: "doubao-seedance-2-5",
			ModelCosts:        []model.ModelCost{{Model: "doubao-seedance-2-5", Credits: 1}},
		}},
		Private: model.PrivateSetting{Channels: []model.ModelChannel{{
			Protocol:         string(model.ModelProtocolVolcengineArk),
			Name:             "ark-seedance-25",
			BaseURL:          upstreamURL,
			APIKey:           "backend-key",
			Models:           []string{"doubao-seedance-2-5"},
			EndpointMappings: []model.ModelEndpointMapping{{Model: "doubao-seedance-2-5", EndpointID: "ep-25"}},
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
