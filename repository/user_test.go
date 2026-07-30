package repository

import (
	"encoding/json"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestChangeUserRolePreservesAccountAndWritesAudit(t *testing.T) {
	setupRepositoryTestDB(t)
	db, err := DB()
	if err != nil {
		t.Fatalf("DB returned error: %v", err)
	}
	actor := model.User{ID: "role-super", Username: "role-super", Password: "actor-hash", Role: model.UserRoleSuperAdmin, Status: model.UserStatusActive, AffCode: "aff-role-super"}
	target := model.User{
		ID: "role-user", Username: "role-user", Password: "target-hash", Email: "user@example.com", DisplayName: "原昵称", AvatarURL: "avatar.png",
		Role: model.UserRoleUser, Credits: 88, AffCode: "aff-role-user", AffCount: 3, InviterID: "inviter", LinuxDoID: "linux-do",
		Status: model.UserStatusBan, LastLoginAt: "2026-07-29T10:00:00Z", Extra: `{"kept":true}`, CreatedAt: "2026-07-24T00:00:00Z",
		UpdatedAt: "2026-07-29T00:00:00Z", IPApprovalEnabled: true,
	}
	if err := db.Create(&[]model.User{actor, target}).Error; err != nil {
		t.Fatalf("Create users: %v", err)
	}
	metadata, _ := json.Marshal(map[string]string{"actorId": actor.ID, "fromRole": string(model.UserRoleUser), "toRole": string(model.UserRoleAdmin)})
	activity := model.UserActivityLog{
		ID: "activity-role-promote", UserID: target.ID, Category: model.ActivityCategorySecurity, Action: model.ActivityActionAdminRoleChanged,
		Result: model.ActivityResultSuccess, TargetType: "user", TargetID: target.ID, TargetName: target.Username, Summary: "普通用户已提升为管理员",
		IPAddress: "203.0.113.8", IPAllowed: true, SessionID: "session-role", UserAgent: "test-agent", Metadata: string(metadata), CreatedAt: "2026-07-30T00:00:00Z",
	}

	updated, err := ChangeUserRole(model.AdminRoleChangeInput{
		ActorID: actor.ID, TargetID: target.ID, FromRole: model.UserRoleUser, ToRole: model.UserRoleAdmin,
		UpdatedAt: "2026-07-30T00:00:00Z", Activity: activity,
	})
	if err != nil {
		t.Fatalf("ChangeUserRole: %v", err)
	}
	if updated.Role != model.UserRoleAdmin || updated.UpdatedAt != "2026-07-30T00:00:00Z" {
		t.Fatalf("updated role/time = %q/%q", updated.Role, updated.UpdatedAt)
	}
	if updated.ID != target.ID || updated.Username != target.Username || updated.Password != target.Password || updated.Email != target.Email || updated.DisplayName != target.DisplayName || updated.AvatarURL != target.AvatarURL || updated.Credits != target.Credits || updated.AffCode != target.AffCode || updated.AffCount != target.AffCount || updated.InviterID != target.InviterID || updated.LinuxDoID != target.LinuxDoID || updated.Status != target.Status || updated.LastLoginAt != target.LastLoginAt || updated.Extra != target.Extra || updated.CreatedAt != target.CreatedAt || updated.IPApprovalEnabled != target.IPApprovalEnabled {
		t.Fatalf("account data changed during promotion: %#v", updated)
	}
	var activities []model.UserActivityLog
	if err := db.Where("user_id = ? AND action = ?", target.ID, model.ActivityActionAdminRoleChanged).Find(&activities).Error; err != nil {
		t.Fatalf("list role activities: %v", err)
	}
	if len(activities) != 1 || activities[0].ID != activity.ID || activities[0].Metadata != string(metadata) || activities[0].IPAddress != activity.IPAddress {
		t.Fatalf("role activities = %#v", activities)
	}
}

func TestChangeUserRoleRejectsStaleSourceRoleWithoutAudit(t *testing.T) {
	setupRepositoryTestDB(t)
	db, _ := DB()
	actor := model.User{ID: "role-super", Username: "role-super", Role: model.UserRoleSuperAdmin, Status: model.UserStatusActive, AffCode: "aff-role-super"}
	target := model.User{ID: "role-admin", Username: "role-admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive, AffCode: "aff-role-admin"}
	if err := db.Create(&[]model.User{actor, target}).Error; err != nil {
		t.Fatalf("Create users: %v", err)
	}
	activity := model.UserActivityLog{ID: "activity-stale", UserID: target.ID, Action: model.ActivityActionAdminRoleChanged, CreatedAt: "2026-07-30T00:00:00Z"}
	if _, err := ChangeUserRole(model.AdminRoleChangeInput{ActorID: actor.ID, TargetID: target.ID, FromRole: model.UserRoleUser, ToRole: model.UserRoleAdmin, UpdatedAt: "2026-07-30T00:00:00Z", Activity: activity}); err == nil {
		t.Fatal("stale source role was accepted")
	}
	saved, ok, err := GetUserByID(target.ID)
	if err != nil || !ok || saved.Role != model.UserRoleAdmin {
		t.Fatalf("target changed after rejected transition: %#v ok=%v err=%v", saved, ok, err)
	}
	var count int64
	if err := db.Model(&model.UserActivityLog{}).Where("id = ?", activity.ID).Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("audit persisted after rejected transition: count=%d err=%v", count, err)
	}
}

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
