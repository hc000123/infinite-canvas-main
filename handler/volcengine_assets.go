package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/basketikun/infinite-canvas/service"
)

const volcengineAssetUploadMaxBytes = 32 * 1024 * 1024

type volcengineAssetStatusRequest struct {
	AssetID     string `json:"assetId"`
	ProjectName string `json:"projectName"`
}

func SubmitVolcengineImageAsset(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, volcengineAssetUploadMaxBytes)
	file, header, err := r.FormFile("file")
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	if err != nil {
		var maxBytesError *http.MaxBytesError
		if errors.As(err, &maxBytesError) {
			Fail(w, "图片大小需小于 30 MB")
			return
		}
		Fail(w, "请选择图片文件")
		return
	}
	defer file.Close()

	result, err := service.SubmitVolcengineImageAsset(r.Context(), file, header, r.FormValue("assetTitle"), r.FormValue("groupId"), r.FormValue("groupName"))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func VolcengineAssetStatus(w http.ResponseWriter, r *http.Request) {
	var request volcengineAssetStatusRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	result, err := service.GetVolcengineAssetStatus(r.Context(), request.AssetID, request.ProjectName)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}
