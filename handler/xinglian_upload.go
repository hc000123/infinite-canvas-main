package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/basketikun/infinite-canvas/service"
)

func SignXinglianUpload(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Model       string `json:"model"`
		Filename    string `json:"filename"`
		ContentType string `json:"contentType"`
		Size        int64  `json:"size"`
		Type        string `json:"type"`
	}
	if json.NewDecoder(r.Body).Decode(&input) != nil || strings.TrimSpace(input.Model) == "" {
		Fail(w, "星链云上传参数无效")
		return
	}
	channel, err := service.SelectModelChannel(input.Model)
	if err != nil || !service.IsXinglianCloudProtocol(channel.Protocol) {
		Fail(w, "星链云视频渠道不可用")
		return
	}
	result, err := service.SignXinglianUpload(r.Context(), channel, service.XinglianUploadSignInput{Filename: input.Filename, ContentType: input.ContentType, Size: input.Size, Type: input.Type})
	if err != nil {
		Fail(w, err.Error())
		return
	}
	OK(w, result)
}

func CompleteXinglianUpload(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Model    string `json:"model"`
		Key      string `json:"key"`
		Filename string `json:"filename"`
		Type     string `json:"type"`
	}
	if json.NewDecoder(r.Body).Decode(&input) != nil || strings.TrimSpace(input.Model) == "" {
		Fail(w, "星链云上传参数无效")
		return
	}
	channel, err := service.SelectModelChannel(input.Model)
	if err != nil || !service.IsXinglianCloudProtocol(channel.Protocol) {
		Fail(w, "星链云视频渠道不可用")
		return
	}
	result, err := service.CompleteXinglianUpload(r.Context(), channel, service.XinglianUploadCompleteInput{Key: input.Key, Filename: input.Filename, Type: input.Type})
	if err != nil {
		Fail(w, err.Error())
		return
	}
	OK(w, result)
}
