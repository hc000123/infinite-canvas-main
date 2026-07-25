package service

import (
	"context"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestLoginOutsideAllowedIPRequiresApproval(t *testing.T) {
	setupAuthTestDB(t)
	user := savePasswordUserFixture(t, "restricted-user", model.UserRoleUser)
	user.IPApprovalEnabled = true
	_, _ = repository.SaveUser(user)
	ctx := WithRequestMeta(context.Background(), RequestMeta{IPAddress: "203.0.113.8", UserAgent: "test"})
	result, err := LoginWithRequest(ctx, user.Username, "password123")
	if err != nil || result.Status != "pending" || result.Approval.ID == "" || result.Approval.Token == "" || result.Session.Token != "" {
		t.Fatalf("result=%#v err=%v", result, err)
	}
}

func TestPrivilegedLoginBypassesIPApproval(t *testing.T) {
	for _, role := range []model.UserRole{model.UserRoleAdmin, model.UserRoleSuperAdmin} {
		setupAuthTestDB(t)
		user := savePasswordUserFixture(t, "privileged-"+string(role), role)
		user.IPApprovalEnabled = true
		_, _ = repository.SaveUser(user)
		ctx := WithRequestMeta(context.Background(), RequestMeta{IPAddress: "203.0.113.9"})
		result, err := LoginWithRequest(ctx, user.Username, "password123")
		if err != nil || result.Session.Token == "" || result.Status != "authenticated" {
			t.Fatalf("role=%s result=%#v err=%v", role, result, err)
		}
	}
}

func TestRestrictedSessionIsBoundToLoginIP(t *testing.T) {
	setupAuthTestDB(t)
	user := savePasswordUserFixture(t, "bound-user", model.UserRoleUser)
	user.IPApprovalEnabled = true
	_, _ = repository.SaveUser(user)
	_, _ = repository.SaveUserAllowedIP(model.UserAllowedIP{ID: "allowed-bound", UserID: user.ID, CIDR: "203.0.113.8/32", CreatedAt: now()})
	ctx := WithRequestMeta(context.Background(), RequestMeta{IPAddress: "203.0.113.8"})
	result, err := LoginWithRequest(ctx, user.Username, "password123")
	if err != nil || result.Session.Token == "" {
		t.Fatalf("login=%#v err=%v", result, err)
	}
	claims, err := ParseToken(result.Session.Token)
	if err != nil || !claims.IPAllowed {
		t.Fatalf("allowlisted session claims=%#v err=%v", claims, err)
	}
	if _, ok := CurrentAuthUserForRequest(result.Session.Token, "203.0.113.9"); ok {
		t.Fatal("restricted session accepted another IP")
	}
}

func savePasswordUserFixture(t *testing.T, username string, role model.UserRole) model.User {
	t.Helper()
	password, _ := hashPassword("password123")
	user, err := repository.SaveUser(model.User{ID: "id-" + username, Username: username, Password: password, Role: role, Status: model.UserStatusActive, AffCode: testAffCode(username), CreatedAt: now(), UpdatedAt: now()})
	if err != nil {
		t.Fatal(err)
	}
	return user
}
