package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

func TestXinglianDirectUploadProxiesSignAndCompleteWithoutExposingAPIKey(t *testing.T) {
	setupAIHandlerTestDB(t)
	requests := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		if r.Header.Get("Authorization") != "Bearer xinglian-key" {
			t.Fatalf("authorization = %q", r.Header.Get("Authorization"))
		}
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/direct-upload/sign":
			var input map[string]any
			_ = json.NewDecoder(r.Body).Decode(&input)
			if input["filename"] != "人物.png" || input["content_type"] != "image/png" || input["size"] != float64(12) || input["type"] != "image" {
				t.Fatalf("sign input = %#v", input)
			}
			_, _ = w.Write([]byte(`{"method":"PUT","upload_url":"https://bucket.example.com/signed","public_url":"https://files.example.com/users/1/image.png","key":"users/1/image.png","headers":{"Content-Type":"image/png"}}`))
		case "/api/direct-upload/complete":
			var input map[string]any
			_ = json.NewDecoder(r.Body).Decode(&input)
			if input["key"] != "users/1/image.png" || input["filename"] != "人物.png" || input["type"] != "image" {
				t.Fatalf("complete input = %#v", input)
			}
			_, _ = w.Write([]byte(`{"recorded":true,"key":"users/1/image.png","url":"https://files.example.com/users/1/image.png"}`))
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer upstream.Close()

	channel := model.ModelChannel{ID: "xinglian-cloud", Protocol: "xinglian-cloud", Name: "星链云", BaseURL: upstream.URL + "/v1", APIKey: "xinglian-key", Models: []string{"sd2.5-720p-ax2"}, Capabilities: []string{"video"}, Enabled: true}
	saveVideoLifecycleHandlerSettings(t, "sd2.5-720p-ax2", 0, channel)
	ctx := service.WithUser(t.Context(), model.AuthUser{ID: "xinglian-user", Username: "xinglian", Role: model.UserRoleUser})

	signRequest := httptest.NewRequest(http.MethodPost, "/api/v1/xinglian/uploads/sign", strings.NewReader(`{"model":"sd2.5-720p-ax2","filename":"人物.png","contentType":"image/png","size":12,"type":"image"}`)).WithContext(ctx)
	signResponse := httptest.NewRecorder()
	SignXinglianUpload(signResponse, signRequest)
	signPayload := readJSONMap(t, signResponse.Body.Bytes())
	signData, _ := signPayload["data"].(map[string]any)
	if signPayload["code"] != float64(0) || signData["uploadUrl"] != "https://bucket.example.com/signed" || signData["publicUrl"] != "https://files.example.com/users/1/image.png" {
		t.Fatalf("sign response = %#v", signPayload)
	}
	if strings.Contains(signResponse.Body.String(), "xinglian-key") {
		t.Fatalf("sign response leaked API key: %s", signResponse.Body.String())
	}

	completeRequest := httptest.NewRequest(http.MethodPost, "/api/v1/xinglian/uploads/complete", strings.NewReader(`{"model":"sd2.5-720p-ax2","key":"users/1/image.png","filename":"人物.png","type":"image"}`)).WithContext(ctx)
	completeResponse := httptest.NewRecorder()
	CompleteXinglianUpload(completeResponse, completeRequest)
	completePayload := readJSONMap(t, completeResponse.Body.Bytes())
	completeData, _ := completePayload["data"].(map[string]any)
	if completePayload["code"] != float64(0) || completeData["url"] != "https://files.example.com/users/1/image.png" || requests != 2 {
		t.Fatalf("complete response = %#v requests=%d", completePayload, requests)
	}
}
