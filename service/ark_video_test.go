package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"testing"
)

func TestReadArkLocalVideoConfigJSONStripsPrivateConfig(t *testing.T) {
	body := []byte(`{
		"model": "ep-test",
		"content": [{"type": "text", "text": "生成短视频"}],
		"_volcengine_api_key": "frontend-key",
		"_volcengine_base_url": "https://ark.example.com/api/v3",
		"_seedance_task_mode": "generate"
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
	if _, ok := payload["_seedance_task_mode"]; ok {
		t.Fatalf("payload still contains private task mode: %#v", payload)
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

func TestBuildArkVideoCreateRequestTruncatesFractionalJSONDuration(t *testing.T) {
	tests := map[string]int{"14.9": 14, "3.9": 4}
	for duration, want := range tests {
		body, _, err := BuildArkVideoCreateRequest([]byte(fmt.Sprintf(`{
			"model": "doubao-seedance-2-5",
			"content": [{"type": "text", "text": "生成短视频"}],
			"duration": %s
		}`, duration)), "application/json")
		if err != nil {
			t.Fatalf("BuildArkVideoCreateRequest duration %s returned error: %v", duration, err)
		}
		if got := readJSONMap(t, body)["duration"]; got != float64(want) {
			t.Fatalf("duration %s normalized to %#v, want %d", duration, got, want)
		}
	}
}

func TestBuildArkVideoCreateRequestKeepsDurationAliasPrecedence(t *testing.T) {
	tests := []struct {
		name       string
		jsonFields string
		formFields map[string]string
		want       float64
	}{
		{name: "zero duration", jsonFields: `"duration":0,"seconds":1`, formFields: map[string]string{"duration": "0", "seconds": "1"}, want: 6},
		{name: "invalid duration", jsonFields: `"duration":"invalid","seconds":10`, formFields: map[string]string{"duration": "invalid", "seconds": "10"}, want: 6},
		{name: "empty duration", jsonFields: `"duration":" ","seconds":10`, formFields: map[string]string{"duration": " ", "seconds": "10"}, want: 10},
		{name: "seconds only", jsonFields: `"seconds":1`, formFields: map[string]string{"seconds": "1"}, want: 4},
	}
	for _, tt := range tests {
		t.Run(tt.name+" JSON", func(t *testing.T) {
			body, _, err := BuildArkVideoCreateRequest([]byte(fmt.Sprintf(`{"model":"doubao-seedance-2-5","content":[{"type":"text","text":"生成短视频"}],%s}`, tt.jsonFields)), "application/json")
			if err != nil {
				t.Fatal(err)
			}
			if got := readJSONMap(t, body)["duration"]; got != tt.want {
				t.Fatalf("JSON duration = %#v, want %v", got, tt.want)
			}
		})
		t.Run(tt.name+" multipart", func(t *testing.T) {
			var form bytes.Buffer
			writer := multipart.NewWriter(&form)
			writeMultipartField(t, writer, "model", "doubao-seedance-2-5")
			writeMultipartField(t, writer, "prompt", "生成短视频")
			for key, value := range tt.formFields {
				writeMultipartField(t, writer, key, value)
			}
			if err := writer.Close(); err != nil {
				t.Fatal(err)
			}
			body, _, err := BuildArkVideoCreateRequest(form.Bytes(), writer.FormDataContentType())
			if err != nil {
				t.Fatal(err)
			}
			if got := readJSONMap(t, body)["duration"]; got != tt.want {
				t.Fatalf("multipart duration = %#v, want %v", got, tt.want)
			}
		})
	}
}

func TestBuildArkVideoCreateRequestForModelUsesLocalSeedance25Capabilities(t *testing.T) {
	body, _, err := BuildArkVideoCreateRequestForModel([]byte(`{
		"model": "doubao-seedance-2-5",
		"content": [{"type": "text", "text": "生成短视频"}],
		"duration": 30,
		"resolution": "480p"
	}`), "application/json", "doubao-seedance-2-5", "ep-25")
	if err != nil {
		t.Fatalf("BuildArkVideoCreateRequestForModel returned error: %v", err)
	}
	payload := readJSONMap(t, body)
	if payload["model"] != "ep-25" || payload["duration"] != float64(30) || payload["resolution"] != "480p" {
		t.Fatalf("payload = %#v", payload)
	}
}

func TestBuildArkVideoCreateRequestAcceptsSeedance25AudioOnly(t *testing.T) {
	body, _, err := BuildArkVideoCreateRequest([]byte(`{
		"model": "seedance_2.5",
		"content": [{"type": "audio_url", "audio_url": {"url": "asset://audio-id"}}]
	}`), "application/json")
	if err != nil {
		t.Fatalf("BuildArkVideoCreateRequest returned error: %v", err)
	}
	if content := readJSONMap(t, body)["content"].([]any); len(content) != 1 {
		t.Fatalf("content = %#v", content)
	}
}

func TestBuildArkVideoCreateRequestKeepsSeedance25EditControls(t *testing.T) {
	body, _, err := BuildArkVideoCreateRequest([]byte(`{
		"model": "doubao seedance-2_5",
		"content": [{"type": "video_url", "video_url": {"url": "asset://video-id"}}],
		"duration": -1,
		"ratio": "adaptive",
		"_seedance_task_mode": "edit"
	}`), "application/json")
	if err != nil {
		t.Fatalf("BuildArkVideoCreateRequest returned error: %v", err)
	}
	payload := readJSONMap(t, body)
	if payload["duration"] != float64(-1) || payload["ratio"] != "adaptive" {
		t.Fatalf("payload controls = %#v", payload)
	}
}

func TestBuildArkVideoCreateRequestDerivesSeedance25EditControlsFromPrivateMode(t *testing.T) {
	body, _, err := BuildArkVideoCreateRequest([]byte(`{
		"model": "doubao-seedance-2-5",
		"content": [{"type": "video_url", "video_url": {"url": "asset://video-id"}}],
		"duration": 12,
		"ratio": "16:9",
		"_seedance_task_mode": "edit"
	}`), "application/json")
	if err != nil {
		t.Fatalf("BuildArkVideoCreateRequest returned error: %v", err)
	}
	payload := readJSONMap(t, body)
	if payload["duration"] != float64(-1) || payload["ratio"] != "adaptive" {
		t.Fatalf("payload controls = %#v", payload)
	}
	if _, ok := payload["_seedance_task_mode"]; ok {
		t.Fatalf("private task mode leaked upstream: %#v", payload)
	}
}

func TestBuildArkVideoCreateRequestDerivesSeedance25ExtendRatio(t *testing.T) {
	body, _, err := BuildArkVideoCreateRequest([]byte(`{
		"model": "doubao-seedance-2-5",
		"content": [{"type": "video_url", "video_url": {"url": "asset://video-id"}}],
		"duration": 24,
		"ratio": "16:9",
		"_seedance_task_mode": "extend"
	}`), "application/json")
	if err != nil {
		t.Fatalf("BuildArkVideoCreateRequest returned error: %v", err)
	}
	payload := readJSONMap(t, body)
	if payload["duration"] != float64(24) || payload["ratio"] != "adaptive" {
		t.Fatalf("payload controls = %#v", payload)
	}
}

func TestBuildArkVideoCreateRequestDefaultsSeedance25NonEditAutomaticDuration(t *testing.T) {
	body, _, err := BuildArkVideoCreateRequest([]byte(`{
		"model": "doubao-seedance-2-5",
		"content": [{"type": "video_url", "video_url": {"url": "asset://video-id"}}],
		"duration": -1,
		"ratio": "16:9",
		"_seedance_task_mode": "extend"
	}`), "application/json")
	if err != nil {
		t.Fatalf("BuildArkVideoCreateRequest returned error: %v", err)
	}
	payload := readJSONMap(t, body)
	if payload["duration"] != float64(6) || payload["ratio"] != "adaptive" {
		t.Fatalf("payload controls = %#v", payload)
	}
	generateBody, _, err := BuildArkVideoCreateRequest([]byte(`{
		"model": "doubao-seedance-2-5",
		"content": [{"type": "text", "text": "生成短视频"}],
		"duration": -1,
		"ratio": "16:9",
		"_seedance_task_mode": "generate"
	}`), "application/json")
	if err != nil {
		t.Fatalf("generate request returned error: %v", err)
	}
	if generatePayload := readJSONMap(t, generateBody); generatePayload["duration"] != float64(6) || generatePayload["ratio"] != "16:9" {
		t.Fatalf("generate payload controls = %#v", generatePayload)
	}
}

func TestBuildArkVideoCreateRequestDerivesSeedance25FrameRatio(t *testing.T) {
	body, _, err := BuildArkVideoCreateRequest([]byte(`{
		"model": "doubao-seedance-2-5",
		"content": [{"type": "image_url", "image_url": {"url": "asset://image-id"}, "role": "first_frame"}],
		"duration": 12,
		"ratio": "16:9",
		"_seedance_task_mode": "generate"
	}`), "application/json")
	if err != nil {
		t.Fatalf("BuildArkVideoCreateRequest returned error: %v", err)
	}
	if payload := readJSONMap(t, body); payload["ratio"] != "adaptive" {
		t.Fatalf("payload controls = %#v", payload)
	}
}

func TestBuildArkVideoCreateRequestKeepsSeedance25GenerateReferenceRatio(t *testing.T) {
	body, _, err := BuildArkVideoCreateRequest([]byte(`{
		"model": "doubao-seedance-2-5",
		"content": [{"type": "image_url", "image_url": {"url": "asset://image-id"}, "role": "reference_image"}],
		"duration": 12,
		"ratio": "16:9",
		"_seedance_task_mode": "generate"
	}`), "application/json")
	if err != nil {
		t.Fatalf("BuildArkVideoCreateRequest returned error: %v", err)
	}
	if payload := readJSONMap(t, body); payload["ratio"] != "16:9" {
		t.Fatalf("payload controls = %#v", payload)
	}
}

func TestBuildArkVideoCreateRequestEnforcesSeedance25ReferenceLimits(t *testing.T) {
	tests := []struct {
		kind      string
		limit     int
		wantError string
	}{
		{kind: "image", limit: 30, wantError: "Seedance 2.5 最多支持 30 张图片"},
		{kind: "video", limit: 10, wantError: "Seedance 2.5 最多支持 10 个视频"},
		{kind: "audio", limit: 10, wantError: "Seedance 2.5 最多支持 10 个音频"},
	}
	for _, test := range tests {
		t.Run(test.kind, func(t *testing.T) {
			if _, _, err := BuildArkVideoCreateRequest(arkSeedanceTestRequest(t, "doubao-seedance-2-5", test.kind, test.limit), "application/json"); err != nil {
				t.Fatalf("limit request returned error: %v", err)
			}
			_, _, err := BuildArkVideoCreateRequest(arkSeedanceTestRequest(t, "doubao-seedance-2-5", test.kind, test.limit+1), "application/json")
			if err == nil || err.Error() != test.wantError {
				t.Fatalf("overflow err = %v, want %q", err, test.wantError)
			}
		})
	}
}

func TestBuildArkVideoCreateRequestRequiresMeaningfulInput(t *testing.T) {
	_, _, err := BuildArkVideoCreateRequest([]byte(`{
		"model": "doubao-seedance-2-5",
		"content": [{"type": "text", "text": "   "}, {"type": "audio_url", "audio_url": {"url": " "}}]
	}`), "application/json")
	if err == nil || err.Error() != "缺少视频提示词或参考素材" {
		t.Fatalf("err = %v", err)
	}
	if _, _, err := BuildArkVideoCreateRequest([]byte(`{
		"model": "doubao-seedance-2-5",
		"content": [{"type": "text", "text": "   "}, {"type": "audio_url", "audio_url": {"url": "asset://audio-id"}}]
	}`), "application/json"); err != nil {
		t.Fatalf("blank text with audio returned error: %v", err)
	}
}

func TestBuildArkVideoCreateRequestKeepsSeedance20Limits(t *testing.T) {
	body, _, err := BuildArkVideoCreateRequest([]byte(`{
		"model": "doubao-seedance-2-0-260128",
		"content": [{"type": "text", "text": "生成短视频"}],
		"duration": 30
	}`), "application/json")
	if err != nil {
		t.Fatalf("BuildArkVideoCreateRequest returned error: %v", err)
	}
	if duration := readJSONMap(t, body)["duration"]; duration != float64(15) {
		t.Fatalf("duration = %#v, want 15", duration)
	}
}

func TestBuildArkVideoCreateRequestDoesNotTreatSeedance250As25(t *testing.T) {
	body, _, err := BuildArkVideoCreateRequest([]byte(`{
		"model": "doubao-seedance-2-50",
		"content": [{"type": "text", "text": "生成短视频"}],
		"duration": 30,
		"resolution": "480p"
	}`), "application/json")
	if err != nil {
		t.Fatalf("BuildArkVideoCreateRequest returned error: %v", err)
	}
	payload := readJSONMap(t, body)
	if payload["duration"] != float64(15) || payload["resolution"] != "720p" {
		t.Fatalf("payload controls = %#v", payload)
	}
}

func TestNormalizeArkVideoResolutionKeepsSeedance25Options(t *testing.T) {
	tests := map[string]string{"480": "480p", "1080": "720p", "4k": "720p"}
	for input, want := range tests {
		if got := normalizeArkVideoResolution(input, "seedance-2.5"); got != want {
			t.Fatalf("normalizeArkVideoResolution(%q) = %q, want %q", input, got, want)
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

func arkSeedanceTestRequest(t *testing.T, modelName string, kind string, count int) []byte {
	t.Helper()
	content := make([]any, 0, count)
	contentType := kind + "_url"
	for index := 0; index < count; index++ {
		content = append(content, map[string]any{"type": contentType, contentType: map[string]string{"url": fmt.Sprintf("asset://%s-%d", kind, index)}})
	}
	body, err := json.Marshal(map[string]any{"model": modelName, "content": content})
	if err != nil {
		t.Fatal(err)
	}
	return body
}
