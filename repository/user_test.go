package repository

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestListCreditLogsSearchesLocalizedTypeLabels(t *testing.T) {
	setupRepositoryTestDB(t)
	db, err := DB()
	if err != nil {
		t.Fatalf("DB returned error: %v", err)
	}
	logs := []model.CreditLog{
		{ID: "consume", UserID: "user-a", Type: model.CreditLogTypeAIConsume, Amount: -10, Balance: 90, CreatedAt: "2026-06-14T10:00:00Z"},
		{ID: "refund", UserID: "user-b", Type: model.CreditLogTypeAIRefund, Amount: 10, Balance: 100, CreatedAt: "2026-06-14T11:00:00Z"},
		{ID: "adjust", UserID: "user-c", Type: model.CreditLogTypeAdminAdjust, Amount: 50, Balance: 150, CreatedAt: "2026-06-14T12:00:00Z"},
	}
	if err := db.Create(&logs).Error; err != nil {
		t.Fatalf("Create credit logs returned error: %v", err)
	}

	cases := []struct {
		keyword string
		wantID  string
	}{
		{keyword: "模型消费", wantID: "consume"},
		{keyword: "失败返还", wantID: "refund"},
		{keyword: "后台调整", wantID: "adjust"},
	}
	for _, item := range cases {
		items, total, err := ListCreditLogs(model.Query{Keyword: item.keyword, Page: 1, PageSize: 10})
		if err != nil {
			t.Fatalf("ListCreditLogs(%q) returned error: %v", item.keyword, err)
		}
		if total != 1 || len(items) != 1 || items[0].ID != item.wantID {
			t.Fatalf("ListCreditLogs(%q) items=%#v total=%d, want %s only", item.keyword, items, total, item.wantID)
		}
	}
}
