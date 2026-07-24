package service

import (
	"path/filepath"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestAdminRoleHierarchy(t *testing.T) {
	if !model.IsAdminRole(model.UserRoleAdmin) || !model.IsAdminRole(model.UserRoleSuperAdmin) {
		t.Fatal("admin hierarchy rejected a privileged role")
	}
	if model.IsAdminRole(model.UserRoleUser) || !model.IsSuperAdminRole(model.UserRoleSuperAdmin) || model.IsSuperAdminRole(model.UserRoleAdmin) {
		t.Fatal("admin hierarchy accepted the wrong role")
	}
}

func TestEnsureDefaultAdminCreatesSuperAdmin(t *testing.T) {
	oldDriver := config.Cfg.StorageDriver
	oldDSN := config.Cfg.DatabaseDSN
	oldUsername := config.Cfg.AdminUsername
	oldPassword := config.Cfg.AdminPassword
	config.Cfg.StorageDriver = "sqlite"
	config.Cfg.DatabaseDSN = filepath.Join(t.TempDir(), "test.db")
	config.Cfg.AdminUsername = "bootstrap-admin"
	config.Cfg.AdminPassword = "bootstrap-password"
	repository.ResetForTest()
	t.Cleanup(func() {
		config.Cfg.StorageDriver = oldDriver
		config.Cfg.DatabaseDSN = oldDSN
		config.Cfg.AdminUsername = oldUsername
		config.Cfg.AdminPassword = oldPassword
		repository.ResetForTest()
	})

	if err := EnsureDefaultAdmin(); err != nil {
		t.Fatalf("EnsureDefaultAdmin: %v", err)
	}
	user, ok, err := repository.GetUserByUsername("bootstrap-admin")
	if err != nil || !ok {
		t.Fatalf("GetUserByUsername ok=%v err=%v", ok, err)
	}
	if user.Role != model.UserRoleSuperAdmin {
		t.Fatalf("bootstrap role=%q want=%q", user.Role, model.UserRoleSuperAdmin)
	}
	if err := EnsureDefaultAdmin(); err != nil {
		t.Fatalf("second EnsureDefaultAdmin: %v", err)
	}
}

func TestSaveAdminUserRejectsPrivilegedTargetForOrdinaryAdmin(t *testing.T) {
	setupAuthTestDB(t)
	actor := model.AuthUser{ID: "admin-1", Role: model.UserRoleAdmin}
	if _, err := SaveAdminUser(actor, model.User{Username: "forged-admin", Role: model.UserRoleSuperAdmin}, "password123"); err == nil {
		t.Fatal("ordinary admin created a privileged account")
	}
}

func TestDeleteAdminUserRejectsPrivilegedTarget(t *testing.T) {
	setupAuthTestDB(t)
	_, err := repository.SaveUser(model.User{ID: "admin-target", Username: "admin-target", Role: model.UserRoleAdmin, Status: model.UserStatusActive, AffCode: "aff-admin-target"})
	if err != nil {
		t.Fatalf("SaveUser: %v", err)
	}
	actor := model.AuthUser{ID: "admin-1", Role: model.UserRoleAdmin}
	if err := DeleteAdminUser(actor, "admin-target"); err == nil {
		t.Fatal("ordinary user-management delete removed an admin")
	}
}

func TestAdjustAdminUserCreditsRejectsPrivilegedTarget(t *testing.T) {
	setupAuthTestDB(t)
	_, err := repository.SaveUser(model.User{ID: "super-target", Username: "super-target", Role: model.UserRoleSuperAdmin, Status: model.UserStatusActive, AffCode: "aff-super-target"})
	if err != nil {
		t.Fatalf("SaveUser: %v", err)
	}
	actor := model.AuthUser{ID: "admin-1", Role: model.UserRoleAdmin}
	if _, err := AdjustAdminUserCredits(actor, "super-target", 100); err == nil {
		t.Fatal("ordinary user-management credits modified a superadmin")
	}
}

func setupAuthTestDB(t *testing.T) {
	t.Helper()
	oldDriver := config.Cfg.StorageDriver
	oldDSN := config.Cfg.DatabaseDSN
	config.Cfg.StorageDriver = "sqlite"
	config.Cfg.DatabaseDSN = filepath.Join(t.TempDir(), "test.db")
	repository.ResetForTest()
	t.Cleanup(func() {
		config.Cfg.StorageDriver = oldDriver
		config.Cfg.DatabaseDSN = oldDSN
		repository.ResetForTest()
	})
}
