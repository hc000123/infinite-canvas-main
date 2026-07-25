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

func TestConsumeUserCreditsExemptsOnlySuperAdmin(t *testing.T) {
	setupAuthTestDB(t)
	super := saveCreditUser(t, "credit-super", model.UserRoleSuperAdmin, 0)
	admin := saveCreditUser(t, "credit-admin", model.UserRoleAdmin, 0)

	if charged, err := ConsumeUserCreditsForTask(super.ID, "model", 5, "/images", "task-super"); err != nil || charged {
		t.Fatalf("superadmin consume returned error: %v", err)
	}
	if saved, ok, err := repository.GetUserByID(super.ID); err != nil || !ok || saved.Credits != 0 {
		t.Fatalf("superadmin after consume=%#v ok=%v err=%v", saved, ok, err)
	}
	if count, err := repository.CountCreditLogsByRelatedIDAndType("task-super", model.CreditLogTypeAIConsume); err != nil || count != 0 {
		t.Fatalf("superadmin consume logs=%d err=%v", count, err)
	}
	if charged, err := ConsumeUserCreditsForTask(admin.ID, "model", 5, "/images", "task-admin"); err == nil || charged {
		t.Fatal("ordinary administrator bypassed insufficient credits")
	}
}

func TestAdjustAdminUserCreditsTransfersOrdinaryAdminBalance(t *testing.T) {
	setupAuthTestDB(t)
	admin := saveCreditUser(t, "transfer-admin", model.UserRoleAdmin, 100)
	user := saveCreditUser(t, "transfer-user", model.UserRoleUser, 20)

	updated, err := AdjustAdminUserCredits(model.PublicUser(admin), user.ID, 50)
	if err != nil || updated.Credits != 50 {
		t.Fatalf("increase updated=%#v err=%v", updated, err)
	}
	assertUserCredits(t, admin.ID, 70)
	assertTransferLogPair(t, admin.ID, user.ID, -30, 30)

	admin, _, _ = repository.GetUserByID(admin.ID)
	updated, err = AdjustAdminUserCredits(model.PublicUser(admin), user.ID, 10)
	if err != nil || updated.Credits != 10 {
		t.Fatalf("decrease updated=%#v err=%v", updated, err)
	}
	assertUserCredits(t, admin.ID, 110)
	assertTransferLogPair(t, admin.ID, user.ID, 40, -40)
}

func TestAdjustAdminUserCreditsRollsBackWhenAdminBalanceIsInsufficient(t *testing.T) {
	setupAuthTestDB(t)
	admin := saveCreditUser(t, "limited-admin", model.UserRoleAdmin, 10)
	user := saveCreditUser(t, "limited-user", model.UserRoleUser, 20)

	if _, err := AdjustAdminUserCredits(model.PublicUser(admin), user.ID, 50); err == nil {
		t.Fatal("transfer succeeded with insufficient administrator credits")
	}
	assertUserCredits(t, admin.ID, 10)
	assertUserCredits(t, user.ID, 20)
	logs, total, err := repository.ListCreditLogs(model.Query{Page: 1, PageSize: 10})
	if err != nil || total != 0 || len(logs) != 0 {
		t.Fatalf("logs=%#v total=%d err=%v", logs, total, err)
	}
}

func TestAdjustAdminUserCreditsEnforcesRoleMatrix(t *testing.T) {
	setupAuthTestDB(t)
	super := saveCreditUser(t, "matrix-super", model.UserRoleSuperAdmin, 0)
	admin := saveCreditUser(t, "matrix-admin", model.UserRoleAdmin, 20)
	otherAdmin := saveCreditUser(t, "matrix-other-admin", model.UserRoleAdmin, 5)
	user := saveCreditUser(t, "matrix-user", model.UserRoleUser, 10)

	if _, err := AdjustAdminUserCredits(model.PublicUser(admin), admin.ID, 50); err == nil {
		t.Fatal("ordinary administrator adjusted itself")
	}
	if _, err := AdjustAdminUserCredits(model.PublicUser(admin), otherAdmin.ID, 50); err == nil {
		t.Fatal("ordinary administrator adjusted another administrator")
	}
	updated, err := AdjustAdminUserCredits(model.PublicUser(super), otherAdmin.ID, 80)
	if err != nil || updated.Credits != 80 {
		t.Fatalf("superadmin adjusted administrator=%#v err=%v", updated, err)
	}
	assertUserCredits(t, super.ID, 0)
	updated, err = AdjustAdminUserCredits(model.PublicUser(super), user.ID, 90)
	if err != nil || updated.Credits != 90 {
		t.Fatalf("superadmin adjusted user=%#v err=%v", updated, err)
	}
	if _, err := AdjustAdminUserCredits(model.PublicUser(super), super.ID, 100); err == nil {
		t.Fatal("superadmin balance was adjustable")
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

func saveCreditUser(t *testing.T, id string, role model.UserRole, credits int) model.User {
	t.Helper()
	user, err := repository.SaveUser(model.User{ID: id, Username: id, Role: role, Credits: credits, Status: model.UserStatusActive, AffCode: "aff-" + id})
	if err != nil {
		t.Fatalf("save credit user: %v", err)
	}
	return user
}

func assertUserCredits(t *testing.T, id string, want int) {
	t.Helper()
	user, ok, err := repository.GetUserByID(id)
	if err != nil || !ok || user.Credits != want {
		t.Fatalf("user %s credits=%d ok=%v err=%v, want %d", id, user.Credits, ok, err, want)
	}
}

func assertTransferLogPair(t *testing.T, adminID string, userID string, adminAmount int, userAmount int) {
	t.Helper()
	adminLogs, _, err := repository.ListCreditLogsForUser(adminID, model.Query{Page: 1, PageSize: 20})
	if err != nil {
		t.Fatalf("list administrator logs: %v", err)
	}
	userLogs, _, err := repository.ListCreditLogsForUser(userID, model.Query{Page: 1, PageSize: 20})
	if err != nil {
		t.Fatalf("list user logs: %v", err)
	}
	for _, adminLog := range adminLogs {
		if adminLog.Amount != adminAmount || adminLog.RelatedID == "" {
			continue
		}
		for _, userLog := range userLogs {
			if userLog.Amount == userAmount && userLog.RelatedID == adminLog.RelatedID {
				return
			}
		}
	}
	t.Fatalf("missing paired logs admin=%#v user=%#v", adminLogs, userLogs)
}
