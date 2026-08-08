package handler

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

func ImageUpscaleCapabilities(w http.ResponseWriter, r *http.Request) {
	if _, ok := imageUpscaleUser(w, r); !ok {
		return
	}
	OK(w, service.ImageUpscaleCapabilities())
}

func CreateImageUpscaleJob(w http.ResponseWriter, r *http.Request) {
	user, ok := imageUpscaleUser(w, r)
	if !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 6<<20)
	if err := r.ParseMultipartForm(6 << 20); err != nil {
		Fail(w, "图片超分请求格式不正确或文件超过 5 MB")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		Fail(w, "请选择需要超分的图片")
		return
	}
	defer file.Close()
	scale, _ := strconv.Atoi(strings.TrimSpace(r.FormValue("scale")))
	result, err := service.CreateImageUpscaleJob(r.Context(), user.ID, file, service.ImageUpscaleCreateInput{
		Filename: header.Filename, ContentType: header.Header.Get("Content-Type"), Scale: scale,
		ProjectID: r.FormValue("projectId"), CanvasID: r.FormValue("canvasId"), SourceNodeID: r.FormValue("sourceNodeId"), SourceAssetID: r.FormValue("sourceAssetId"),
	})
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func ImageUpscaleJob(w http.ResponseWriter, r *http.Request, jobID string) {
	user, ok := imageUpscaleUser(w, r)
	if !ok {
		return
	}
	result, _, err := service.GetUserImageUpscaleJob(user.ID, jobID)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func RetryImageUpscaleJob(w http.ResponseWriter, r *http.Request, jobID string) {
	user, ok := imageUpscaleUser(w, r)
	if !ok {
		return
	}
	result, err := service.RetryImageUpscaleJob(r.Context(), user.ID, jobID)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func imageUpscaleUser(w http.ResponseWriter, r *http.Request) (model.AuthUser, bool) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return model.AuthUser{}, false
	}
	return user, true
}
