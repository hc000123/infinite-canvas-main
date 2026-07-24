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

func TestListUsersOnlyReturnsOrdinaryUsers(t *testing.T) {
	setupRepositoryTestDB(t)
	db, err := DB()
	if err != nil {
		t.Fatalf("DB returned error: %v", err)
	}
	users := []model.User{
		{ID: "user-list-user", Username: "list-user", Role: model.UserRoleUser, Status: model.UserStatusActive, AffCode: "aff-list-user"},
		{ID: "user-list-admin", Username: "list-admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive, AffCode: "aff-list-admin"},
		{ID: "user-list-super", Username: "list-super", Role: model.UserRoleSuperAdmin, Status: model.UserStatusActive, AffCode: "aff-list-super"},
	}
	if err := db.Create(&users).Error; err != nil {
		t.Fatalf("Create users: %v", err)
	}

	items, total, err := ListUsers(model.Query{Page: 1, PageSize: 10})
	if err != nil || total != 1 || len(items) != 1 || items[0].ID != "user-list-user" {
		t.Fatalf("ListUsers items=%#v total=%d err=%v", items, total, err)
	}
}

func TestListCreditLogsSearchesCurrentUsername(t *testing.T) {
	setupRepositoryTestDB(t)
	db, _ := DB()
	user := model.User{ID: "user-credit-name", Username: "current-name", DisplayName: "当前昵称", Role: model.UserRoleUser, Status: model.UserStatusActive, AffCode: "aff-credit-name"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("Create user: %v", err)
	}
	log := model.CreditLog{ID: "credit-name", UserID: user.ID, Type: model.CreditLogTypeAIConsume, Amount: -3, Balance: 7, CreatedAt: "2026-07-24T10:00:00Z"}
	if err := db.Create(&log).Error; err != nil {
		t.Fatalf("Create log: %v", err)
	}
	items, total, err := ListCreditLogs(model.Query{Keyword: "current-name", Page: 1, PageSize: 10})
	if err != nil || total != 1 || len(items) != 1 || items[0].ID != log.ID {
		t.Fatalf("ListCreditLogs items=%#v total=%d err=%v", items, total, err)
	}
}
