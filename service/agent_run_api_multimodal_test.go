package service

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBuildAPIMultimodalRequestEmbedsPrivateImagesWithoutPaths(t *testing.T) {
	directory := t.TempDir()
	imagePath := filepath.Join(directory, "reference.png")
	if err := os.WriteFile(imagePath, []byte("png-data"), 0600); err != nil {
		t.Fatal(err)
	}
	manifest, _ := json.Marshal(map[string]any{"items": []map[string]any{{"label": "角色阿宁", "kind": "character", "version": "v2", "mime": "image/png", "serverPath": imagePath, "order": 0}}})
	request, err := buildAPIMultimodalRequest(`{"model":"vision","messages":[{"role":"system","content":"规则"},{"role":"user","content":"生成提示词"}]}`, string(manifest))
	if err != nil {
		t.Fatal(err)
	}
	value := string(request)
	if !strings.Contains(value, `"type":"image_url"`) || !strings.Contains(value, "data:image/png;base64,") || !strings.Contains(value, "逐张理解图片") {
		t.Fatalf("request=%s", value)
	}
	if strings.Contains(value, imagePath) || strings.Contains(value, "serverPath") {
		t.Fatalf("private path leaked: %s", value)
	}
}

func TestBuildAPIMultimodalRequestKeepsTextOnlyRequest(t *testing.T) {
	request := `{"model":"text","messages":[{"role":"user","content":"文本"}]}`
	result, err := buildAPIMultimodalRequest(request, `{"items":[],"degraded":true}`)
	if err != nil || string(result) != request {
		t.Fatalf("result=%s err=%v", result, err)
	}
}
