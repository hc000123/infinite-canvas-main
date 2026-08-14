package handler

import (
	"errors"
	"net/http"
	"strings"

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
	preserveAudio, err := videoUpscalePreserveAudio(r.FormValue("preserveAudio"))
	if err != nil {
		Fail(w, err.Error())
		return
	}
	input := videoUpscaleCreateInputFromRequest(r)
	input.Filename, input.ContentType, input.PreserveAudio, input.PreserveAudioSet = header.Filename, header.Header.Get("Content-Type"), preserveAudio, true
	result, err := service.CreateVideoUpscaleJob(r.Context(), user.ID, file, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func videoUpscaleCreateInputFromRequest(r *http.Request) service.VideoUpscaleCreateInput {
	return service.VideoUpscaleCreateInput{
		Target: r.FormValue("target"), ProjectID: r.FormValue("projectId"), CanvasID: r.FormValue("canvasId"), SourceNodeID: r.FormValue("sourceNodeId"), SourceAssetID: r.FormValue("sourceAssetId"), OutputQualityMode: r.FormValue("outputQualityMode"), FrameInterpolationMode: r.FormValue("frameInterpolationMode"), InterpolationMode: r.FormValue("interpolationMode"),
	}
}

func videoUpscalePreserveAudio(raw string) (bool, error) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "", "true":
		return true, nil
	case "false":
		return false, nil
	default:
		return false, errors.New("保留音频选项不正确")
	}
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
