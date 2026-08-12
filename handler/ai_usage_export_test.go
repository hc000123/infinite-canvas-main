package handler

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/xuri/excelize/v2"
)

func TestAdminAIUsageExportReturnsWorkbook(t *testing.T) {
	setupAIHandlerTestDB(t)
	stamp := "2026-08-10T10:00:00+08:00"
	user := model.User{ID: "export-user", Username: "export-user", DisplayName: "导出用户", Role: model.UserRoleUser, Status: model.UserStatusActive, Credits: 90, CreatedAt: stamp, UpdatedAt: stamp}
	if _, err := repository.SaveUser(user); err != nil {
		t.Fatal(err)
	}
	if _, err := repository.SaveAITask(model.AITask{ID: "export-task", UserID: user.ID, Kind: "video", Model: "video-model", Status: model.AITaskStatusSucceeded, Credits: 10, GeneratedSeconds: 5, CreatedAt: stamp, UpdatedAt: stamp}); err != nil {
		t.Fatal(err)
	}
	if _, err := repository.SaveCreditLog(model.CreditLog{ID: "export-log", UserID: user.ID, Type: model.CreditLogTypeAIConsume, Amount: -10, RelatedID: "export-task", CreatedAt: stamp}); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/admin/ai-usage-export?startAt=2026-08-01T00:00:00%2B08:00&endAt=2026-09-01T00:00:00%2B08:00", nil)
	recorder := httptest.NewRecorder()
	AdminAIUsageExport(recorder, request)
	if recorder.Header().Get("Content-Type") != "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" {
		t.Fatalf("content type = %q body=%s", recorder.Header().Get("Content-Type"), recorder.Body.String())
	}
	if !strings.Contains(recorder.Header().Get("Content-Disposition"), "attachment") {
		t.Fatal("missing attachment header")
	}
	book, err := excelize.OpenReader(bytes.NewReader(recorder.Body.Bytes()))
	if err != nil {
		t.Fatal(err)
	}
	_ = book.Close()
}
