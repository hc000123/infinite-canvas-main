package service

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

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
