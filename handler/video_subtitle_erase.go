package handler

import (
	"net/http"

	"github.com/basketikun/infinite-canvas/service"
)

const videoSubtitleEraseMultipartBytes = 501 << 20

func VideoSubtitleEraseCapabilities(w http.ResponseWriter, r *http.Request) {
	if _, ok := videoUpscaleUser(w, r); !ok {
		return
	}
	OK(w, service.VideoSubtitleEraseCapabilities())
}

func CreateVideoSubtitleEraseJob(w http.ResponseWriter, r *http.Request) {
	user, ok := videoUpscaleUser(w, r)
	if !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, videoSubtitleEraseMultipartBytes)
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		Fail(w, "字幕擦除请求格式不正确或文件超过 500 MB")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		Fail(w, "请选择需要擦除字幕的视频")
		return
	}
	defer file.Close()
	input := videoSubtitleEraseCreateInputFromRequest(r)
	input.Filename, input.ContentType = header.Filename, header.Header.Get("Content-Type")
	result, err := service.CreateVideoSubtitleEraseJob(r.Context(), user.ID, file, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func videoSubtitleEraseCreateInputFromRequest(r *http.Request) service.VideoSubtitleEraseCreateInput {
	return service.VideoSubtitleEraseCreateInput{
		ProjectID: r.FormValue("projectId"), CanvasID: r.FormValue("canvasId"), SourceNodeID: r.FormValue("sourceNodeId"), SourceAssetID: r.FormValue("sourceAssetId"),
	}
}

func VideoSubtitleEraseJob(w http.ResponseWriter, r *http.Request, jobID string) {
	user, ok := videoUpscaleUser(w, r)
	if !ok {
		return
	}
	result, _, err := service.GetUserVideoSubtitleEraseJob(user.ID, jobID)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func RetryVideoSubtitleEraseJob(w http.ResponseWriter, r *http.Request, jobID string) {
	user, ok := videoUpscaleUser(w, r)
	if !ok {
		return
	}
	result, err := service.RetryVideoSubtitleEraseJob(r.Context(), user.ID, jobID)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}
