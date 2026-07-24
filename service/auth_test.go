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
