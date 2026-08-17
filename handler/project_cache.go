package handler

import (
	"encoding/json"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/service"
)

func UploadProjectCacheFile(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 201<<20)
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		Fail(w, "缓存请求格式不正确或文件超过 200 MB")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		Fail(w, "请选择缓存文件")
		return
	}
	defer file.Close()
	var context service.ProjectCacheContext
	if err := json.Unmarshal([]byte(r.FormValue("context")), &context); err != nil {
		Fail(w, "缓存分类信息格式不正确")
		return
	}
	mimeType := strings.TrimSpace(header.Header.Get("Content-Type"))
	if mimeType == "" || mimeType == "application/octet-stream" {
		buffer := make([]byte, 512)
		count, _ := file.Read(buffer)
		_, _ = file.Seek(0, 0)
		mimeType = http.DetectContentType(buffer[:count])
	}
	result, err := service.ArchiveProjectCacheFile(config.Cfg.ProjectCacheDir, user.ID, service.ProjectCacheArchiveInput{Context: context, Filename: header.Filename, MIMEType: mimeType, Reader: file})
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func ProjectCaches(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	result, err := service.ListUserProjectCaches(config.Cfg.ProjectCacheDir, user.ID)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func ProjectCache(w http.ResponseWriter, r *http.Request, projectID string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	manifest, summary, err := service.GetUserProjectCache(config.Cfg.ProjectCacheDir, user.ID, projectID)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, map[string]any{"manifest": manifest, "summary": summary})
}

func UpdateProjectCacheStatus(w http.ResponseWriter, r *http.Request, projectID string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input struct {
		Status string `json:"status"`
	}
	if !decodeProjectCacheJSON(w, r, &input) {
		return
	}
	result, err := service.SetUserProjectCacheStatus(config.Cfg.ProjectCacheDir, user.ID, projectID, input.Status)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func MoveProjectCacheFile(w http.ResponseWriter, r *http.Request, fileID string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input service.ProjectCacheContext
	if !decodeProjectCacheJSON(w, r, &input) {
		return
	}
	result, err := service.MoveUserProjectCacheFile(config.Cfg.ProjectCacheDir, user.ID, fileID, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func SetProjectCacheFileFavorite(w http.ResponseWriter, r *http.Request, fileID string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input struct {
		Favorite *bool `json:"favorite"`
	}
	if !decodeProjectCacheJSON(w, r, &input) {
		return
	}
	if input.Favorite == nil {
		Fail(w, "请求参数格式不正确")
		return
	}
	result, err := service.SetUserProjectCacheFileFavorite(config.Cfg.ProjectCacheDir, user.ID, fileID, *input.Favorite)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func DeleteProjectCacheFile(w http.ResponseWriter, r *http.Request, fileID string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	if err := service.DeleteUserProjectCacheFile(config.Cfg.ProjectCacheDir, user.ID, fileID); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func DeleteProjectCache(w http.ResponseWriter, r *http.Request, projectID string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	if err := service.DeleteUserProjectCache(config.Cfg.ProjectCacheDir, user.ID, projectID); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func ProjectCacheFile(w http.ResponseWriter, r *http.Request, fileID string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	path, item, err := service.ResolveUserProjectCacheFile(config.Cfg.ProjectCacheDir, user.ID, fileID)
	if err != nil {
		FailError(w, err)
		return
	}
	w.Header().Set("Content-Type", item.MIMEType)
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": firstDownloadName(item.OriginalName, filepath.Base(path))}))
	http.ServeFile(w, r, path)
}

func PreflightProjectCachePackage(w http.ResponseWriter, r *http.Request, projectID string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	result, err := service.PreflightProjectCachePackage(config.Cfg.ProjectCacheDir, user.ID, projectID)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func DownloadProjectCachePackage(w http.ResponseWriter, r *http.Request, projectID string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input service.ProjectCachePackageInput
	if !decodeProjectCacheJSON(w, r, &input) {
		return
	}
	input.ProjectID = projectID
	preflight, err := service.PreflightProjectCachePackage(config.Cfg.ProjectCacheDir, user.ID, projectID)
	if err != nil {
		FailError(w, err)
		return
	}
	if len(preflight.Missing) > 0 && !input.ContinueOnMissing {
		Fail(w, "项目缓存存在缺失文件，请确认后继续打包")
		return
	}
	temporary, err := os.CreateTemp("", "infinite-canvas-project-cache-*.zip")
	if err != nil {
		FailError(w, err)
		return
	}
	defer os.Remove(temporary.Name())
	defer temporary.Close()
	result, err := service.WriteProjectCachePackage(temporary, config.Cfg.ProjectCacheDir, user.ID, input)
	if err != nil {
		FailError(w, err)
		return
	}
	if _, err := temporary.Seek(0, 0); err != nil {
		FailError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": result.Filename}))
	http.ServeContent(w, r, result.Filename, time.Now(), temporary)
}

func DownloadProjectCacheSelection(w http.ResponseWriter, r *http.Request, projectID string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input service.ProjectCacheSelectionInput
	if !decodeProjectCacheJSON(w, r, &input) {
		return
	}
	input.ProjectID = projectID
	temporary, err := os.CreateTemp("", "infinite-canvas-project-cache-selection-*.zip")
	if err != nil {
		FailError(w, err)
		return
	}
	defer os.Remove(temporary.Name())
	defer temporary.Close()
	result, err := service.WriteProjectCacheSelectionPackage(temporary, config.Cfg.ProjectCacheDir, user.ID, input)
	if err != nil {
		FailError(w, err)
		return
	}
	if _, err := temporary.Seek(0, 0); err != nil {
		FailError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": result.Filename}))
	http.ServeContent(w, r, result.Filename, time.Now(), temporary)
}

func decodeProjectCacheJSON(w http.ResponseWriter, r *http.Request, value any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)
	if err := json.NewDecoder(r.Body).Decode(value); err != nil {
		Fail(w, "请求参数格式不正确")
		return false
	}
	return true
}

func firstDownloadName(value, fallback string) string {
	if strings.TrimSpace(value) != "" {
		return filepath.Base(value)
	}
	return fallback
}
