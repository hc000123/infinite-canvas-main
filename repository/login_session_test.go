package repository

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestReplaceLoginSessionLeavesOnlyNewestPointer(t *testing.T) {
	setupRepositoryTestDB(t)
	user := model.User{ID: "user-session", Username: "session-user", Role: model.UserRoleUser, Status: model.UserStatusActive, AffCode: "aff-session"}
	if _, err := SaveUser(user); err != nil {
		t.Fatal(err)
	}
	first := loginSessionFixture("session-1", user.ID)
	if _, _, err := ReplaceLoginSession(first, "首次登录"); err != nil {
		t.Fatal(err)
	}
	second := loginSessionFixture("session-2", user.ID)
	if _, previous, err := ReplaceLoginSession(second, "在其他设备登录"); err != nil || previous == nil || previous.ID != first.ID {
		t.Fatalf("previous=%#v err=%v", previous, err)
	}
	savedUser, ok, err := GetUserByID(user.ID)
	if err != nil || !ok || savedUser.ActiveSessionID != second.ID {
		t.Fatalf("user=%#v ok=%v err=%v", savedUser, ok, err)
	}
	replaced, ok, err := GetLoginSession(first.ID)
	if err != nil || !ok || replaced.Status != model.LoginSessionReplaced || replaced.RevokeReason != "在其他设备登录" {
		t.Fatalf("replaced=%#v ok=%v err=%v", replaced, ok, err)
	}
}

func TestReplaceLoginSessionAcceptsLegacyNullPointer(t *testing.T) {
	setupRepositoryTestDB(t)
	user := model.User{ID: "user-session-legacy", Username: "session-legacy", Role: model.UserRoleUser, Status: model.UserStatusActive, AffCode: "aff-session-legacy"}
	if _, err := SaveUser(user); err != nil {
		t.Fatal(err)
	}
	database, err := DB()
	if err != nil {
		t.Fatal(err)
	}
	if err := database.Exec("UPDATE users SET active_session_id = NULL WHERE id = ?", user.ID).Error; err != nil {
		t.Fatal(err)
	}
	item := loginSessionFixture("session-legacy", user.ID)
	if _, _, err := ReplaceLoginSession(item, ""); err != nil {
		t.Fatal(err)
	}
	savedUser, ok, err := GetUserByID(user.ID)
	if err != nil || !ok || savedUser.ActiveSessionID != item.ID {
		t.Fatalf("user=%#v ok=%v err=%v", savedUser, ok, err)
	}
}

func TestRevokeCurrentLoginSessionClearsMatchingPointer(t *testing.T) {
	setupRepositoryTestDB(t)
	user := model.User{ID: "user-revoke", Username: "revoke-user", Role: model.UserRoleUser, Status: model.UserStatusActive, AffCode: "aff-revoke"}
	if _, err := SaveUser(user); err != nil {
		t.Fatal(err)
	}
	item := loginSessionFixture("session-revoke", user.ID)
	if _, _, err := ReplaceLoginSession(item, ""); err != nil {
		t.Fatal(err)
	}
	revoked, changed, err := RevokeCurrentLoginSession(user.ID, item.ID, model.LoginSessionAdminRevoked, "admin-1", "安全检查", "2026-07-30T01:00:00Z")
	if err != nil || !changed || revoked.Status != model.LoginSessionAdminRevoked || revoked.RevokedBy != "admin-1" {
		t.Fatalf("revoked=%#v changed=%v err=%v", revoked, changed, err)
	}
	savedUser, _, _ := GetUserByID(user.ID)
	if savedUser.ActiveSessionID != "" {
		t.Fatalf("active session=%q", savedUser.ActiveSessionID)
	}
}

func loginSessionFixture(id, userID string) model.LoginSession {
	return model.LoginSession{ID: id, UserID: userID, Status: model.LoginSessionActive, IPAddress: "203.0.113.8", UserAgent: "test", CreatedAt: "2026-07-30T00:00:00Z", LastActiveAt: "2026-07-30T00:00:00Z", AbsoluteExpiresAt: "2026-08-29T00:00:00Z", UpdatedAt: "2026-07-30T00:00:00Z"}
}
