package service

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestChangeAdminAccountRolePromotesAndDemotesWithoutLosingData(t *testing.T) {
	setupAuthTestDB(t)
	actor := saveAdminAccountFixture(t, "role-super", model.UserRoleSuperAdmin)
	target, err := repository.SaveUser(model.User{
		ID: "role-user", Username: "role-user", Password: "kept-password-hash", Email: "user@example.com", DisplayName: "保留昵称", AvatarURL: "avatar.png",
		Role: model.UserRoleUser, Credits: 66, AffCode: "aff-role-user", Status: model.UserStatusBan, LastLoginAt: "2026-07-29T08:00:00Z",
		Extra: `{"kept":true}`, CreatedAt: "2026-07-24T00:00:00Z", UpdatedAt: "2026-07-29T00:00:00Z", IPApprovalEnabled: true,
	})
	if err != nil {
		t.Fatalf("save role target: %v", err)
	}
	if _, err := repository.SaveCreditLog(model.CreditLog{ID: "role-credit", UserID: target.ID, Type: model.CreditLogTypeAIConsume, Amount: -4, Balance: 66, CreatedAt: "2026-07-29T08:00:00Z"}); err != nil {
		t.Fatalf("save history: %v", err)
	}
	ctx := WithRequestMeta(context.Background(), RequestMeta{IPAddress: "203.0.113.9", IPAllowed: true, SessionID: "session-role", UserAgent: "test-agent"})

	promoted, err := ChangeAdminAccountRole(ctx, model.PublicUser(actor), target.ID, model.UserRoleAdmin)
	if err != nil {
		t.Fatalf("promote user: %v", err)
	}
	if promoted.Role != model.UserRoleAdmin || promoted.ID != target.ID || promoted.Credits != target.Credits || promoted.Password != "" {
		t.Fatalf("promoted account=%#v", promoted)
	}
	saved, ok, err := repository.GetUserByID(target.ID)
	if err != nil || !ok || saved.Password != target.Password || saved.Email != target.Email || saved.DisplayName != target.DisplayName || saved.Status != target.Status || saved.IPApprovalEnabled != target.IPApprovalEnabled {
		t.Fatalf("saved promoted account=%#v ok=%v err=%v", saved, ok, err)
	}
	logs, total, err := repository.ListCreditLogsForUser(target.ID, model.Query{Page: 1, PageSize: 10})
	if err != nil || total != 1 || len(logs) != 1 || logs[0].ID != "role-credit" {
		t.Fatalf("credit history logs=%#v total=%d err=%v", logs, total, err)
	}

	demoted, err := ChangeAdminAccountRole(ctx, model.PublicUser(actor), target.ID, model.UserRoleUser)
	if err != nil || demoted.Role != model.UserRoleUser || demoted.Credits != target.Credits {
		t.Fatalf("demote administrator account=%#v err=%v", demoted, err)
	}
	activities, total, err := repository.ListUserActivities(model.UserActivityQuery{ExactUserID: target.ID, Action: string(model.ActivityActionAdminRoleChanged), Query: model.Query{Page: 1, PageSize: 10}})
	if err != nil || total != 2 || len(activities) != 2 {
		t.Fatalf("role activities=%#v total=%d err=%v", activities, total, err)
	}
	var demotion model.UserActivityLog
	var metadata map[string]string
	for _, activity := range activities {
		var candidate map[string]string
		if err := json.Unmarshal([]byte(activity.Metadata), &candidate); err != nil {
			t.Fatalf("decode activity metadata: %v", err)
		}
		if candidate["toRole"] == string(model.UserRoleUser) {
			demotion, metadata = activity, candidate
		}
	}
	if metadata["actorId"] != actor.ID || metadata["fromRole"] != string(model.UserRoleAdmin) || demotion.IPAddress != "203.0.113.9" || demotion.SessionID != "session-role" {
		t.Fatalf("demotion activity=%#v metadata=%#v", demotion, metadata)
	}
}

func TestChangeAdminAccountRoleRejectsUnauthorizedOrInvalidTransitions(t *testing.T) {
	setupAuthTestDB(t)
	super := saveAdminAccountFixture(t, "role-super", model.UserRoleSuperAdmin)
	admin := saveAdminAccountFixture(t, "role-admin", model.UserRoleAdmin)
	user, err := repository.SaveUser(model.User{ID: "role-user", Username: "role-user", Role: model.UserRoleUser, Status: model.UserStatusActive, AffCode: "aff-role-user"})
	if err != nil {
		t.Fatalf("save role user: %v", err)
	}
	ctx := context.Background()
	cases := []struct {
		name  string
		actor model.AuthUser
		id    string
		role  model.UserRole
	}{
		{name: "ordinary admin", actor: model.PublicUser(admin), id: user.ID, role: model.UserRoleAdmin},
		{name: "forged stale superadmin token", actor: model.AuthUser{ID: admin.ID, Role: model.UserRoleSuperAdmin}, id: user.ID, role: model.UserRoleAdmin},
		{name: "superadmin target", actor: model.PublicUser(super), id: super.ID, role: model.UserRoleUser},
		{name: "same user role", actor: model.PublicUser(super), id: user.ID, role: model.UserRoleUser},
		{name: "same admin role", actor: model.PublicUser(super), id: admin.ID, role: model.UserRoleAdmin},
		{name: "request superadmin role", actor: model.PublicUser(super), id: user.ID, role: model.UserRoleSuperAdmin},
		{name: "request guest role", actor: model.PublicUser(super), id: user.ID, role: model.UserRoleGuest},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			if _, err := ChangeAdminAccountRole(ctx, item.actor, item.id, item.role); err == nil {
				t.Fatal("invalid transition was accepted")
			}
		})
	}
	activities, total, err := repository.ListUserActivities(model.UserActivityQuery{Action: string(model.ActivityActionAdminRoleChanged), Query: model.Query{Page: 1, PageSize: 20}})
	if err != nil || total != 0 || len(activities) != 0 {
		t.Fatalf("rejected transitions wrote activities=%#v total=%d err=%v", activities, total, err)
	}
}

func TestCreateAndListAdminAccounts(t *testing.T) {
	setupAuthTestDB(t)
	actor := saveAdminAccountFixture(t, "super-1", model.UserRoleSuperAdmin)
	created, err := CreateAdminAccount(model.PublicUser(actor), model.AdminAccountUpdate{
		Username: "admin-created", Role: model.UserRoleAdmin, Status: model.UserStatusActive,
	}, "password123")
	if err != nil || created.Role != model.UserRoleAdmin || created.Password != "" {
		t.Fatalf("CreateAdminAccount created=%#v err=%v", created, err)
	}
	items, err := ListAdminAccounts(model.PublicUser(actor), model.AdminAccountQuery{Query: model.Query{Page: 1, PageSize: 10}})
	if err != nil || items.Total != 2 {
		t.Fatalf("ListAdminAccounts items=%#v err=%v", items, err)
	}
}

func TestUpdateAdminAccountProtectsActorAndLastSuperAdmin(t *testing.T) {
	setupAuthTestDB(t)
	actor := saveAdminAccountFixture(t, "super-1", model.UserRoleSuperAdmin)
	target := saveAdminAccountFixture(t, "super-2", model.UserRoleSuperAdmin)
	if _, err := UpdateAdminAccount(model.PublicUser(actor), target.ID, model.AdminAccountUpdate{Username: target.Username, Role: model.UserRoleAdmin, Status: model.UserStatusActive}); err != nil {
		t.Fatalf("demote with another active superadmin: %v", err)
	}
	if _, err := UpdateAdminAccount(model.PublicUser(actor), actor.ID, model.AdminAccountUpdate{Username: actor.Username, Role: model.UserRoleAdmin, Status: model.UserStatusActive}); err == nil {
		t.Fatal("superadmin changed own role")
	}
}

func TestLastActiveSuperAdminCannotBeDemotedDisabledOrDeleted(t *testing.T) {
	setupAuthTestDB(t)
	actor := saveAdminAccountFixture(t, "super-actor", model.UserRoleSuperAdmin)
	target := saveAdminAccountFixture(t, "super-last", model.UserRoleSuperAdmin)
	actor.Status = model.UserStatusBan
	if _, err := repository.SaveUser(actor); err != nil {
		t.Fatalf("disable actor fixture: %v", err)
	}
	caller := model.AuthUser{ID: "external-super", Role: model.UserRoleSuperAdmin}
	if _, err := UpdateAdminAccount(caller, target.ID, model.AdminAccountUpdate{Username: target.Username, Role: model.UserRoleAdmin, Status: model.UserStatusActive}); err == nil {
		t.Fatal("last active superadmin was demoted")
	}
	if _, err := UpdateAdminAccount(caller, target.ID, model.AdminAccountUpdate{Username: target.Username, Role: model.UserRoleSuperAdmin, Status: model.UserStatusBan}); err == nil {
		t.Fatal("last active superadmin was disabled")
	}
	if err := DeleteAdminAccount(caller, target.ID); err == nil {
		t.Fatal("last active superadmin was deleted")
	}
}

func TestAdminAccountServicesRequireSuperAdmin(t *testing.T) {
	setupAuthTestDB(t)
	actor := model.AuthUser{ID: "admin-1", Role: model.UserRoleAdmin}
	if _, err := CreateAdminAccount(actor, model.AdminAccountUpdate{Username: "forbidden", Role: model.UserRoleAdmin}, "password123"); err == nil {
		t.Fatal("ordinary admin created an administrator")
	}
}

func saveAdminAccountFixture(t *testing.T, id string, role model.UserRole) model.User {
	t.Helper()
	user, err := repository.SaveUser(model.User{ID: id, Username: id, Password: "hash", Role: role, Status: model.UserStatusActive, AffCode: "aff-" + id, CreatedAt: "2026-07-24T00:00:00Z", UpdatedAt: "2026-07-24T00:00:00Z"})
	if err != nil {
		t.Fatalf("save admin fixture: %v", err)
	}
	return user
}
