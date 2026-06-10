package service

import (
	"bytes"
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

func writeMultipartField(t *testing.T, writer *multipart.Writer, key string, value string) {
	t.Helper()
	if err := writer.WriteField(key, value); err != nil {
		t.Fatalf("WriteField %s: %v", key, err)
	}
}
