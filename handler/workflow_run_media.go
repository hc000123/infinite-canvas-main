package handler

import (
	"net/http"

	"github.com/basketikun/infinite-canvas/service"
)

func CreateWorkflowMediaBatch(w http.ResponseWriter, r *http.Request, workflowRunID string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input service.CreateWorkflowMediaBatchInput
	if !decodeWorkflowBody(w, r, &input, 32<<10) {
		return
	}
	result, err := service.CreateUserWorkflowMediaBatch(user.ID, workflowRunID, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func UploadWorkflowMedia(w http.ResponseWriter, r *http.Request, batchID string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 11<<20)
	if err := r.ParseMultipartForm(11 << 20); err != nil {
		Fail(w, "图片请求格式不正确或超过 10MB")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		Fail(w, "缺少图片文件")
		return
	}
	defer file.Close()
	result, err := service.UploadUserWorkflowMedia(user.ID, batchID, file, header, service.WorkflowMediaItemInput{
		AssetID: r.FormValue("assetId"), Label: r.FormValue("label"), Kind: r.FormValue("kind"),
		Version: r.FormValue("version"), Order: service.ParseWorkflowMediaOrder(r.FormValue("order")),
	})
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func WorkflowMediaBatch(w http.ResponseWriter, r *http.Request, batchID string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	result, err := service.GetUserWorkflowMediaBatch(user.ID, batchID)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func DeleteWorkflowMediaBatch(w http.ResponseWriter, r *http.Request, batchID string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	if err := service.DeleteUserWorkflowMediaBatch(user.ID, batchID); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}
