package handler

import (
	"net/http"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

const videoUpscaleMultipartBytes = 501 << 20

func VideoUpscaleCapabilities(w http.ResponseWriter, r *http.Request) {
	if _, ok := videoUpscaleUser(w, r); !ok {
		return
	}
	OK(w, service.VideoUpscaleCapabilities())
}

func CreateVideoUpscaleJob(w http.ResponseWriter, r *http.Request) {
	user, ok := videoUpscaleUser(w, r)
	if !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, videoUpscaleMultipartBytes)
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		Fail(w, "视频超分请求格式不正确或文件超过 500 MB")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		Fail(w, "请选择需要超分的视频")
		return
	}
	defer file.Close()
	result, err := service.CreateVideoUpscaleJob(r.Context(), user.ID, file, service.VideoUpscaleCreateInput{
		Filename: header.Filename, ContentType: header.Header.Get("Content-Type"), Target: r.FormValue("target"), ProjectID: r.FormValue("projectId"), CanvasID: r.FormValue("canvasId"), SourceNodeID: r.FormValue("sourceNodeId"), SourceAssetID: r.FormValue("sourceAssetId"),
	})
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func VideoUpscaleJob(w http.ResponseWriter, r *http.Request, jobID string) {
	user, ok := videoUpscaleUser(w, r)
	if !ok {
		return
	}
	result, _, err := service.GetUserVideoUpscaleJob(user.ID, jobID)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func RetryVideoUpscaleJob(w http.ResponseWriter, r *http.Request, jobID string) {
	user, ok := videoUpscaleUser(w, r)
	if !ok {
		return
	}
	result, err := service.RetryVideoUpscaleJob(r.Context(), user.ID, jobID)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func videoUpscaleUser(w http.ResponseWriter, r *http.Request) (model.AuthUser, bool) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return model.AuthUser{}, false
	}
	return user, true
}
