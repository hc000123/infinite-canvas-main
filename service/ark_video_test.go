package service

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"testing"
)

func TestReadArkLocalVideoConfigJSONStripsPrivateConfig(t *testing.T) {
	body := []byte(`{
		"model": "ep-test",
		"content": [{"type": "text", "text": "生成短视频"}],
		"_volcengine_api_key": "frontend-key",
		"_volcengine_base_url": "https://ark.example.com/api/v3"
	}`)

	apiKey, baseURL, payload, err := ReadArkLocalVideoConfig(body, "application/json")
	if err != nil {
		t.Fatalf("ReadArkLocalVideoConfig returned error: %v", err)
	}

	if apiKey != "frontend-key" || baseURL != "https://ark.example.com/api/v3" {
		t.Fatalf("config = %q/%q", apiKey, baseURL)
	}
	if _, ok := payload[arkLocalAPIKeyField]; ok {
		t.Fatalf("payload still contains api key field: %#v", payload)
	}
	if _, ok := payload[arkLocalBaseURLField]; ok {
		t.Fatalf("payload still contains base url field: %#v", payload)
	}
	if payload["model"] != "ep-test" {
		t.Fatalf("model = %#v", payload["model"])
	}
}

func TestReadArkLocalVideoConfigMultipartBuildsArkPayload(t *testing.T) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	writeMultipartField(t, writer, arkLocalAPIKeyField, "frontend-key")
	writeMultipartField(t, writer, arkLocalBaseURLField, "https://ark.example.com/api/v3")
	writeMultipartField(t, writer, "model", "ep-test")
	writeMultipartField(t, writer, "prompt", "生成短视频")
	writeMultipartField(t, writer, "seconds", "10")
	writeMultipartField(t, writer, "size", "720x1280")
	writeMultipartField(t, writer, "resolution_name", "1080")
	writeMultipartField(t, writer, "generate_audio", "true")
	writeMultipartField(t, writer, "watermark", "false")
	writeMultipartField(t, writer, "seed", "7")
	writeMultipartField(t, writer, "return_last_frame", "true")
	if err := writer.Close(); err != nil {
		t.Fatalf("Close multipart writer: %v", err)
	}

	apiKey, baseURL, payload, err := ReadArkLocalVideoConfig(body.Bytes(), writer.FormDataContentType())
	if err != nil {
		t.Fatalf("ReadArkLocalVideoConfig returned error: %v", err)
	}

	if apiKey != "frontend-key" || baseURL != "https://ark.example.com/api/v3" {
		t.Fatalf("config = %q/%q", apiKey, baseURL)
	}
	if payload["model"] != "ep-test" || payload["duration"] != 10 || payload["ratio"] != "9:16" || payload["resolution"] != "1080p" {
		t.Fatalf("payload controls = %#v", payload)
	}
	if payload["generate_audio"] != true || payload["watermark"] != false || payload["seed"] != 7 || payload["return_last_frame"] != true {
		t.Fatalf("payload booleans/seed = %#v", payload)
	}
	content, ok := payload["content"].([]any)
	if !ok || len(content) != 1 {
		t.Fatalf("content = %#v", payload["content"])
	}
	text, ok := content[0].(map[string]any)
	if !ok || text["type"] != "text" || text["text"] != "生成短视频" {
		t.Fatalf("text content = %#v", content[0])
	}
}

func TestBuildArkVideoCreateRequestBackfillsMediaRoles(t *testing.T) {
	body, _, err := BuildArkVideoCreateRequest([]byte(`{
		"model": "ep-test",
		"content": [
			{"type": "text", "text": "生成短视频"},
			{"type": "image_url", "image_url": {"url": "asset://image-id"}},
			{"type": "video_url", "video_url": {"url": "asset://video-id"}},
			{"type": "audio_url", "audio_url": {"url": "https://example.com/audio.mp3"}}
		]
	}`), "application/json")
	if err != nil {
		t.Fatalf("BuildArkVideoCreateRequest returned error: %v", err)
	}
	payload := readJSONMap(t, body)
	content, ok := payload["content"].([]any)
	if !ok || len(content) != 4 {
		t.Fatalf("content = %#v", payload["content"])
	}
	if role := content[1].(map[string]any)["role"]; role != "reference_image" {
		t.Fatalf("image role = %#v, want reference_image", role)
	}
	if role := content[2].(map[string]any)["role"]; role != "reference_video" {
		t.Fatalf("video role = %#v, want reference_video", role)
	}
	if role := content[3].(map[string]any)["role"]; role != "reference_audio" {
		t.Fatalf("audio role = %#v, want reference_audio", role)
	}
}

func TestBuildArkVideoCreateRequestNormalizesLegacySourceVideoRole(t *testing.T) {
	body, _, err := BuildArkVideoCreateRequest([]byte(`{
		"model": "doubao-seedance-2-0-260128",
		"content": [
			{"type": "text", "text": "编辑参考视频"},
			{"type": "video_url", "video_url": {"url": "asset://video-id"}, "role": "source_video"}
		]
	}`), "application/json")
	if err != nil {
		t.Fatalf("BuildArkVideoCreateRequest returned error: %v", err)
	}
	payload := readJSONMap(t, body)
	content := payload["content"].([]any)
	if role := content[1].(map[string]any)["role"]; role != "reference_video" {
		t.Fatalf("video role = %#v, want reference_video", role)
	}
}

func TestBuildArkVideoCreateRequestRejectsAudioOnlySeedanceInput(t *testing.T) {
	_, _, err := BuildArkVideoCreateRequest([]byte(`{
		"model": "doubao-seedance-2-0-260128",
		"content": [
			{"type": "text", "text": "只参考音频生成"},
			{"type": "audio_url", "audio_url": {"url": "asset://audio-id"}}
		]
	}`), "application/json")
	if err == nil || err.Error() != "Seedance 2.0 不支持纯音频或文本加音频输入，请至少添加图片或视频参考" {
		t.Fatalf("err = %v", err)
	}
}

func TestReadArkLocalVideoConfigMultipartKeepsInputReferenceRole(t *testing.T) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	writeMultipartField(t, writer, arkLocalAPIKeyField, "frontend-key")
	writeMultipartField(t, writer, arkLocalBaseURLField, "https://ark.example.com/api/v3")
	writeMultipartField(t, writer, "model", "ep-test")
	writeMultipartField(t, writer, "prompt", "首尾帧生成")
	writeMultipartField(t, writer, "input_reference_role[]", "first_frame")
	writeMultipartFile(t, writer, "input_reference[]", "first.png", []byte("png-data"))
	if err := writer.Close(); err != nil {
		t.Fatalf("Close multipart writer: %v", err)
	}

	_, _, payload, err := ReadArkLocalVideoConfig(body.Bytes(), writer.FormDataContentType())
	if err != nil {
		t.Fatalf("ReadArkLocalVideoConfig returned error: %v", err)
	}
	content, ok := payload["content"].([]any)
	if !ok || len(content) != 2 {
		t.Fatalf("content = %#v", payload["content"])
	}
	image, ok := content[1].(map[string]any)
	if !ok || image["type"] != "image_url" || image["role"] != "first_frame" {
		t.Fatalf("image content = %#v", content[1])
	}
}

func TestNormalizeArkVideoDurationKeepsSeedanceRange(t *testing.T) {
	cases := map[string]int{
		"":   6,
		"3":  4,
		"4":  4,
		"5":  5,
		"10": 10,
		"16": 15,
	}
	for input, want := range cases {
		if got := normalizeArkVideoDuration(input); got != want {
			t.Fatalf("normalizeArkVideoDuration(%q) = %d, want %d", input, got, want)
		}
	}
}

func TestNormalizeArkVideoControlsKeepOfficialSeedanceLimits(t *testing.T) {
	body, _, err := BuildArkVideoCreateRequest([]byte(`{
		"model": "doubao-seedance-2-0-fast-260128",
		"content": [{"type": "text", "text": "生成短视频"}],
		"ratio": "21:9",
		"resolution": "1080"
	}`), "application/json")
	if err != nil {
		t.Fatalf("BuildArkVideoCreateRequest returned error: %v", err)
	}
	payload := readJSONMap(t, body)
	if payload["ratio"] != "21:9" || payload["resolution"] != "720p" {
		t.Fatalf("payload controls = %#v", payload)
	}
}

func writeMultipartField(t *testing.T, writer *multipart.Writer, key string, value string) {
	t.Helper()
	if err := writer.WriteField(key, value); err != nil {
		t.Fatalf("WriteField %s: %v", key, err)
	}
}

func writeMultipartFile(t *testing.T, writer *multipart.Writer, key string, filename string, data []byte) {
	t.Helper()
	file, err := writer.CreateFormFile(key, filename)
	if err != nil {
		t.Fatalf("CreateFormFile %s: %v", key, err)
	}
	if _, err := file.Write(data); err != nil {
		t.Fatalf("Write file %s: %v", key, err)
	}
}

func readJSONMap(t *testing.T, body []byte) map[string]any {
	t.Helper()
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("Unmarshal JSON: %v", err)
	}
	return payload
}
