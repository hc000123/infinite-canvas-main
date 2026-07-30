package service

import (
	"context"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestSecondLoginInvalidatesFirstSession(t *testing.T) {
	setupAuthTestDB(t)
	user := savePasswordUserFixture(t, "single-device", model.UserRoleUser)
	ctx := WithRequestMeta(context.Background(), RequestMeta{IPAddress: "203.0.113.8", UserAgent: "Chrome"})
	first, err := LoginWithRequest(ctx, user.Username, "password123")
	if err != nil {
		t.Fatal(err)
	}
	second, err := LoginWithRequest(ctx, user.Username, "password123")
	if err != nil {
		t.Fatal(err)
	}
	if _, failure := AuthenticateSession(first.Session.Token, "203.0.113.8"); failure == nil || failure.Code != model.AuthCodeSessionReplaced {
		t.Fatalf("first failure=%#v", failure)
	}
	if authenticated, failure := AuthenticateSession(second.Session.Token, "203.0.113.8"); failure != nil || authenticated.User.ID != user.ID {
		t.Fatalf("authenticated=%#v failure=%#v", authenticated, failure)
	}
}

func TestForceLogoutRoleMatrix(t *testing.T) {
	setupAuthTestDB(t)
	user := savePasswordUserFixture(t, "force-user", model.UserRoleUser)
	admin := savePasswordUserFixture(t, "force-admin", model.UserRoleAdmin)
	super := savePasswordUserFixture(t, "force-super", model.UserRoleSuperAdmin)
	ctx := WithRequestMeta(context.Background(), RequestMeta{IPAddress: "203.0.113.8"})
	userSession, err := CreateLoginSession(ctx, user, "", true)
	if err != nil {
		t.Fatal(err)
	}
	adminSession, err := CreateLoginSession(ctx, admin, "", true)
	if err != nil {
		t.Fatal(err)
	}
	superSession, err := CreateLoginSession(ctx, super, "", true)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ForceLogout(ctx, model.PublicUser(admin), user.ID, "安全检查"); err != nil {
		t.Fatalf("admin -> user: %v", err)
	}
	if _, failure := AuthenticateSession(userSession.Token, "203.0.113.8"); failure == nil || failure.Code != model.AuthCodeSessionRevoked || failure.Reason != "安全检查" {
		t.Fatalf("user failure=%#v", failure)
	}
	if _, err := ForceLogout(ctx, model.PublicUser(admin), admin.ID, "越权操作"); err == nil {
		t.Fatal("admin forced administrator offline")
	}
	if _, err := ForceLogout(ctx, model.PublicUser(super), admin.ID, "权限调整"); err != nil {
		t.Fatalf("super -> admin: %v", err)
	}
	if _, failure := AuthenticateSession(adminSession.Token, "203.0.113.8"); failure == nil || failure.Code != model.AuthCodeSessionRevoked {
		t.Fatalf("admin failure=%#v", failure)
	}
	if _, err := ForceLogout(ctx, model.PublicUser(super), super.ID, "越权操作"); err == nil {
		t.Fatal("superadmin forced superadmin offline")
	}
	if _, failure := AuthenticateSession(superSession.Token, "203.0.113.8"); failure != nil {
		t.Fatalf("superadmin session invalidated: %#v", failure)
	}
}

func TestForceLogoutRequiresReason(t *testing.T) {
	setupAuthTestDB(t)
	target, _ := repository.SaveUser(model.User{ID: "force-reason", Username: "force-reason", Role: model.UserRoleUser, Status: model.UserStatusActive, AffCode: "aff-force-reason"})
	if _, err := ForceLogout(context.Background(), model.AuthUser{ID: "admin", Role: model.UserRoleAdmin}, target.ID, " "); err == nil {
		t.Fatal("blank reason accepted")
	}
}

func TestSaveAdminUserPreservesActiveSession(t *testing.T) {
	setupAuthTestDB(t)
	target := savePasswordUserFixture(t, "session-profile", model.UserRoleUser)
	if _, err := CreateLoginSession(context.Background(), target, "", true); err != nil {
		t.Fatal(err)
	}
	before, _, _ := repository.GetUserByID(target.ID)
	if _, err := SaveAdminUser(model.AuthUser{ID: "admin", Role: model.UserRoleAdmin}, model.User{ID: target.ID, Username: target.Username, DisplayName: "新昵称", Role: model.UserRoleUser, Status: model.UserStatusActive}, ""); err != nil {
		t.Fatal(err)
	}
	after, _, _ := repository.GetUserByID(target.ID)
	if before.ActiveSessionID == "" || after.ActiveSessionID != before.ActiveSessionID {
		t.Fatalf("active session changed from %q to %q", before.ActiveSessionID, after.ActiveSessionID)
	}
}

func TestSessionExpiryReasons(t *testing.T) {
	for _, test := range []struct {
		name       string
		lastActive time.Time
		expiresAt  time.Time
		wantCode   int
	}{
		{name: "idle", lastActive: time.Now().Add(-8 * 24 * time.Hour), expiresAt: time.Now().Add(24 * time.Hour), wantCode: model.AuthCodeSessionIdleExpired},
		{name: "absolute", lastActive: time.Now(), expiresAt: time.Now().Add(-time.Minute), wantCode: model.AuthCodeSessionExpired},
	} {
		t.Run(test.name, func(t *testing.T) {
			setupAuthTestDB(t)
			user := savePasswordUserFixture(t, "expiry-"+test.name, model.UserRoleUser)
			stamp := time.Now().Add(-8 * 24 * time.Hour).Format(time.RFC3339)
			session := model.LoginSession{ID: "session-" + test.name, UserID: user.ID, Status: model.LoginSessionActive, CreatedAt: stamp, LastActiveAt: test.lastActive.Format(time.RFC3339), AbsoluteExpiresAt: test.expiresAt.Format(time.RFC3339), UpdatedAt: stamp}
			if _, _, err := repository.ReplaceLoginSession(session, ""); err != nil {
				t.Fatal(err)
			}
			token, err := newTokenWithIPPolicy(user, session, "", true)
			if err != nil {
				t.Fatal(err)
			}
			if _, failure := AuthenticateSession(token, ""); failure == nil || failure.Code != test.wantCode {
				t.Fatalf("failure=%#v wantCode=%d", failure, test.wantCode)
			}
		})
	}
}
