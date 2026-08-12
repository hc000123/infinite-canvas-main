package handler

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

func TestUploadProjectCacheFileUsesAuthenticatedUser(t *testing.T) {
	oldRoot := config.Cfg.ProjectCacheDir
	config.Cfg.ProjectCacheDir = t.TempDir()
	t.Cleanup(func() { config.Cfg.ProjectCacheDir = oldRoot })
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	header := textproto.MIMEHeader{}
	header.Set("Content-Disposition", `form-data; name="file"; filename="a.png"`)
	header.Set("Content-Type", "image/png")
	part, err := writer.CreatePart(header)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = part.Write([]byte("\x89PNG\r\n\x1a\ncontent"))
	contextJSON, _ := json.Marshal(service.ProjectCacheContext{ProjectID: "p1", ProjectName: "A"})
	_ = writer.WriteField("context", string(contextJSON))
	_ = writer.Close()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/project-cache/files", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	request = request.WithContext(service.WithUser(request.Context(), model.AuthUser{ID: "u1"}))
	response := httptest.NewRecorder()
	UploadProjectCacheFile(response, request)
	if response.Code != http.StatusOK || !bytes.Contains(response.Body.Bytes(), []byte(`"code":0`)) {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	matches, _ := filepath.Glob(filepath.Join(config.Cfg.ProjectCacheDir, "users", "*", "projects", "*", "manifest.json"))
	if len(matches) != 1 {
		t.Fatalf("manifest count=%d", len(matches))
	}
}

func TestProjectCachesRejectsAnonymousRequest(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/v1/project-cache/projects", nil)
	response := httptest.NewRecorder()
	ProjectCaches(response, request)
	if !bytes.Contains(response.Body.Bytes(), []byte("未登录")) {
		t.Fatalf("body=%s", response.Body.String())
	}
}

func TestProjectCacheFileCannotBeReadByAnotherUser(t *testing.T) {
	oldRoot := config.Cfg.ProjectCacheDir
	config.Cfg.ProjectCacheDir = t.TempDir()
	t.Cleanup(func() { config.Cfg.ProjectCacheDir = oldRoot })
	archived, err := service.ArchiveProjectCacheFile(config.Cfg.ProjectCacheDir, "u1", service.ProjectCacheArchiveInput{Context: service.ProjectCacheContext{ProjectID: "p1"}, Filename: "a.png", MIMEType: "image/png", Reader: strings.NewReader("a")})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/v1/project-cache/files/"+archived.File.ID, nil)
	request = request.WithContext(service.WithUser(request.Context(), model.AuthUser{ID: "u2"}))
	response := httptest.NewRecorder()
	ProjectCacheFile(response, request, archived.File.ID)
	if !bytes.Contains(response.Body.Bytes(), []byte(`"code":1`)) || !bytes.Contains(response.Body.Bytes(), []byte("缓存文件不存在")) {
		t.Fatalf("other user read file: %s", response.Body.String())
	}
}

func TestProjectCachePackageReturnsZipHeaders(t *testing.T) {
	oldRoot := config.Cfg.ProjectCacheDir
	config.Cfg.ProjectCacheDir = t.TempDir()
	t.Cleanup(func() { config.Cfg.ProjectCacheDir = oldRoot })
	if _, err := service.ArchiveProjectCacheFile(config.Cfg.ProjectCacheDir, "u1", service.ProjectCacheArchiveInput{Context: service.ProjectCacheContext{ProjectID: "p1", ProjectName: "A"}, Filename: "a.png", MIMEType: "image/png", Reader: strings.NewReader("a")}); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/v1/project-cache/projects/p1/package", strings.NewReader(`{"snapshot":{"project":{},"canvases":[],"scripts":{},"storyboards":{},"assets":[]}}`))
	request.Header.Set("Content-Type", "application/json")
	request = request.WithContext(service.WithUser(request.Context(), model.AuthUser{ID: "u1"}))
	response := httptest.NewRecorder()
	DownloadProjectCachePackage(response, request, "p1")
	if response.Header().Get("Content-Type") != "application/zip" || !strings.Contains(response.Header().Get("Content-Disposition"), "attachment") {
		t.Fatalf("headers=%v body=%s", response.Header(), response.Body.String())
	}
}

func TestProjectCachePackageDoesNotReturnPartialZipWhenMediaReadFails(t *testing.T) {
	oldRoot := config.Cfg.ProjectCacheDir
	config.Cfg.ProjectCacheDir = t.TempDir()
	t.Cleanup(func() { config.Cfg.ProjectCacheDir = oldRoot })
	archived, err := service.ArchiveProjectCacheFile(config.Cfg.ProjectCacheDir, "u1", service.ProjectCacheArchiveInput{Context: service.ProjectCacheContext{ProjectID: "p1", ProjectName: "A"}, Filename: "a.png", MIMEType: "image/png", Reader: strings.NewReader("a")})
	if err != nil {
		t.Fatal(err)
	}
	mediaPath := filepath.Join(archived.ProjectPath, archived.File.RelativePath)
	if err := os.Remove(mediaPath); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(mediaPath, 0755); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/v1/project-cache/projects/p1/package", strings.NewReader(`{"snapshot":{"project":{},"canvases":[],"scripts":{},"storyboards":{},"assets":[]}}`))
	request.Header.Set("Content-Type", "application/json")
	request = request.WithContext(service.WithUser(request.Context(), model.AuthUser{ID: "u1"}))
	response := httptest.NewRecorder()
	DownloadProjectCachePackage(response, request, "p1")
	if response.Header().Get("Content-Type") == "application/zip" || !bytes.Contains(response.Body.Bytes(), []byte(`"code":1`)) {
		t.Fatalf("headers=%v body=%q", response.Header(), response.Body.String())
	}
}

func TestProjectCacheSelectionReturnsZipHeaders(t *testing.T) {
	oldRoot := config.Cfg.ProjectCacheDir
	config.Cfg.ProjectCacheDir = t.TempDir()
	t.Cleanup(func() { config.Cfg.ProjectCacheDir = oldRoot })
	archived, err := service.ArchiveProjectCacheFile(config.Cfg.ProjectCacheDir, "u1", service.ProjectCacheArchiveInput{Context: service.ProjectCacheContext{ProjectID: "p1", ProjectName: "A"}, Filename: "a.png", MIMEType: "image/png", Reader: strings.NewReader("a")})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/v1/project-cache/projects/p1/package/selection", strings.NewReader(`{"fileIds":["`+archived.File.ID+`"]}`))
	request.Header.Set("Content-Type", "application/json")
	request = request.WithContext(service.WithUser(request.Context(), model.AuthUser{ID: "u1"}))
	response := httptest.NewRecorder()
	DownloadProjectCacheSelection(response, request, "p1")
	if response.Header().Get("Content-Type") != "application/zip" || !strings.Contains(response.Header().Get("Content-Disposition"), "attachment") {
		t.Fatalf("headers=%v body=%s", response.Header(), response.Body.String())
	}
	if _, err := zip.NewReader(bytes.NewReader(response.Body.Bytes()), int64(response.Body.Len())); err != nil {
		t.Fatalf("invalid zip: %v", err)
	}
}
