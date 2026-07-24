# Superadmin Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a protected `superadmin` role, prevent ordinary admins from managing privileged accounts, and provide a superadmin-only administrator management page.

**Architecture:** Keep the existing string role model but add an explicit hierarchy and two middleware guards: `AdminAuth` accepts admin and superadmin, while `SuperAdminAuth` accepts only a fresh database-backed superadmin identity. Ordinary-user services enforce `role=user`; privileged mutations use separate repository transactions that protect the actor and the last active superadmin.

**Tech Stack:** Go 1.25, Gin, GORM transactions, bcrypt, Next.js App Router, React 19, TypeScript, Ant Design, TanStack Query.

---

## File map

- Modify `model/user.go`: add `UserRoleSuperAdmin`, role helpers, and admin query/response types.
- Modify `repository/user.go`: role-scoped lists and protected privileged mutations.
- Modify `service/auth.go`: default superadmin bootstrap and ordinary-user mutation restrictions.
- Create `service/admin_account.go`: privileged account operations and protection rules.
- Modify `middleware/admin.go`: hierarchy-aware `AdminAuth` and new `SuperAdminAuth`.
- Create `handler/admin_account.go`: thin privileged handlers.
- Modify `router/router.go`: superadmin-only routes.
- Add backend tests in `repository/user_test.go`, `service/auth_test.go`, `service/admin_account_test.go`, and `router/router_test.go`.
- Modify `web/src/services/api/admin.ts`: superadmin role and administrator APIs.
- Modify `web/src/stores/use-user-store.ts`: accept the new role.
- Modify `web/src/app/(admin)/admin/layout.tsx`: role-gated menu.
- Create `web/src/app/(admin)/admin/admins/use-admin-accounts.ts`: page-private queries/mutations.
- Create `web/src/app/(admin)/admin/admins/admin-account-view.ts` and `.test.mts`: protection helpers.
- Create `web/src/app/(admin)/admin/admins/page.tsx`: administrator management UI.
- Modify `docs/backend-database.md` and `docs/pending-test.md`.
- Mutate local `data/infinite-canvas.db` once to promote `huangchi0910`; do not commit the database.

### Task 1: Add the role hierarchy and middleware guards

**Files:**
- Modify: `model/user.go`
- Modify: `middleware/admin.go`
- Modify: `service/auth.go`
- Test: `service/auth_test.go`
- Test: `router/router_test.go`

- [ ] **Step 1: Write failing role and middleware tests**

Add tests proving `IsAdminRole` accepts both privileged roles and `IsSuperAdminRole` accepts only superadmin:

```go
func TestAdminRoleHierarchy(t *testing.T) {
	if !model.IsAdminRole(model.UserRoleAdmin) || !model.IsAdminRole(model.UserRoleSuperAdmin) {
		t.Fatal("admin hierarchy rejected a privileged role")
	}
	if model.IsAdminRole(model.UserRoleUser) || !model.IsSuperAdminRole(model.UserRoleSuperAdmin) || model.IsSuperAdminRole(model.UserRoleAdmin) {
		t.Fatal("admin hierarchy accepted the wrong role")
	}
}
```

Add router tests that a signed ordinary-admin token reaches `/api/admin/users`, is rejected from `/api/admin/admins`, and a superadmin token reaches both.

- [ ] **Step 2: Run tests and verify RED**

```bash
go test ./service ./router -run 'TestAdminRoleHierarchy|TestSuperAdminRoutesRequireSuperAdmin' -count=1
```

Expected: FAIL because `superadmin` and `SuperAdminAuth` do not exist.

- [ ] **Step 3: Add role helpers**

In `model/user.go` add:

```go
const (
	UserRoleGuest      UserRole = "guest"
	UserRoleUser       UserRole = "user"
	UserRoleAdmin      UserRole = "admin"
	UserRoleSuperAdmin UserRole = "superadmin"
)

func IsAdminRole(role UserRole) bool {
	return role == UserRoleAdmin || role == UserRoleSuperAdmin
}

func IsSuperAdminRole(role UserRole) bool {
	return role == UserRoleSuperAdmin
}
```

Replace direct `role == admin` checks in auth redirects and middleware with `model.IsAdminRole` where the intent is backend access. Keep exact superadmin checks only for administrator management.

- [ ] **Step 4: Add the superadmin middleware**

Change `AdminAuth` to use `model.IsAdminRole(user.Role)`. Add:

```go
func SuperAdminAuth(c *gin.Context) {
	user, ok := authUser(c)
	if !ok || !model.IsSuperAdminRole(user.Role) {
		handler.Fail(c.Writer, "未登录或权限不足")
		c.Abort()
		return
	}
	c.Request = c.Request.WithContext(service.WithUser(c.Request.Context(), user))
	c.Next()
}
```

`authUser` already calls `CurrentAuthUser`, which reloads the current database record; preserve that behavior so stale JWT roles cannot retain removed privileges.

- [ ] **Step 5: Bootstrap new installations with a superadmin**

In `EnsureDefaultAdmin`, keep the existing “do not create when a privileged account exists” behavior, but create the environment bootstrap account with:

```go
Role: model.UserRoleSuperAdmin,
```

Change `HasAdmin` to count both `admin` and `superadmin` roles.

- [ ] **Step 6: Run tests and verify GREEN**

```bash
go test ./service ./router -run 'TestAdminRoleHierarchy|TestSuperAdminRoutesRequireSuperAdmin|TestEnsureDefaultAdmin' -count=1
```

Expected: PASS.

- [ ] **Step 7: Commit role hierarchy**

```bash
git add model/user.go middleware/admin.go service/auth.go service/auth_test.go router/router_test.go
git commit -m "feat: add superadmin role hierarchy"
```

### Task 2: Protect ordinary-user management from privilege escalation

**Files:**
- Modify: `repository/user.go`
- Modify: `service/auth.go`
- Modify: `handler/auth.go`
- Test: `repository/user_test.go`
- Test: `service/auth_test.go`

- [ ] **Step 1: Write failing ordinary-admin escalation tests**

Add service tests using an actor argument:

```go
func TestSaveAdminUserRejectsPrivilegedTargetForOrdinaryAdmin(t *testing.T) {
	setupAITaskTestDB(t)
	actor := model.AuthUser{ID: "admin-1", Role: model.UserRoleAdmin}
	_, err := SaveAdminUser(actor, model.User{Username: "forged-admin", Role: model.UserRoleSuperAdmin}, "password123")
	if err == nil {
		t.Fatal("ordinary admin created a privileged account")
	}
}

func TestDeleteAdminUserRejectsPrivilegedTarget(t *testing.T) {
	setupAITaskTestDB(t)
	_, _ = repository.SaveUser(model.User{ID: "admin-target", Username: "admin-target", Role: model.UserRoleAdmin, Status: model.UserStatusActive})
	actor := model.AuthUser{ID: "admin-1", Role: model.UserRoleAdmin}
	if err := DeleteAdminUser(actor, "admin-target"); err == nil {
		t.Fatal("ordinary user-management delete removed an admin")
	}
}
```

- [ ] **Step 2: Run tests and verify RED**

```bash
go test ./service -run 'TestSaveAdminUserRejectsPrivilegedTargetForOrdinaryAdmin|TestDeleteAdminUserRejectsPrivilegedTarget' -count=1
```

Expected: FAIL because current generic save/delete accepts privileged roles.

- [ ] **Step 3: Scope the ordinary user list and mutations**

Change `repository.ListUsers` to start with:

```go
tx := db.Model(&model.User{}).Where("role = ?", model.UserRoleUser)
```

Rename the HTTP-facing service functions to `SaveAdminUser(actor, user, password)` and `DeleteAdminUser(actor, id)`. They must require `model.IsAdminRole(actor.Role)`, force creates to `role=user`, and reject updates or deletes when the saved target is not `role=user`.

Use this exact update guard before calling the existing normalized save path:

```go
if user.ID != "" {
	saved, ok, err := repository.GetUserByID(user.ID)
	if err != nil {
		return user, err
	}
	if !ok || saved.Role != model.UserRoleUser {
		return user, safeMessageError{message: "用户不存在或无权修改"}
	}
}
user.Role = model.UserRoleUser
```

Change handlers to obtain the actor with `service.UserFromContext(r.Context())` and pass it to the service. Do not trust a role in the request body.

- [ ] **Step 4: Run tests and verify GREEN**

```bash
go test ./repository ./service ./handler -run 'TestListUsers|TestSaveAdminUser|TestDeleteAdminUser' -count=1
```

Expected: PASS.

- [ ] **Step 5: Commit privilege-escalation protections**

```bash
git add repository/user.go repository/user_test.go service/auth.go service/auth_test.go handler/auth.go
git commit -m "fix: protect privileged accounts from ordinary admin actions"
```

### Task 3: Add protected administrator management services and APIs

**Files:**
- Create: `model/admin_account.go`
- Modify: `repository/user.go`
- Create: `service/admin_account.go`
- Create: `service/admin_account_test.go`
- Create: `handler/admin_account.go`
- Modify: `router/router.go`

- [ ] **Step 1: Write failing service tests for self and last-superadmin protection**

Create `service/admin_account_test.go` with fixtures for two superadmins and one admin. Cover create, promote, demote, disable, delete, self-change rejection, and last-superadmin rejection:

```go
func TestUpdateAdminAccountProtectsActorAndLastSuperAdmin(t *testing.T) {
	setupAITaskTestDB(t)
	actor := saveAdminAccountFixture(t, "super-1", model.UserRoleSuperAdmin)
	target := saveAdminAccountFixture(t, "super-2", model.UserRoleSuperAdmin)
	if _, err := UpdateAdminAccount(model.PublicUser(actor), target.ID, model.AdminAccountUpdate{Role: model.UserRoleAdmin, Status: model.UserStatusActive}); err != nil {
		t.Fatalf("demote with another active superadmin: %v", err)
	}
	if _, err := UpdateAdminAccount(model.PublicUser(actor), actor.ID, model.AdminAccountUpdate{Role: model.UserRoleAdmin, Status: model.UserStatusActive}); err == nil {
		t.Fatal("superadmin changed own role")
	}
}
```

Add a separate test with only one active superadmin and assert demote, disable, and delete each fail.

- [ ] **Step 2: Run tests and verify RED**

```bash
go test ./service -run 'Test.*AdminAccount' -count=1
```

Expected: FAIL because privileged services do not exist.

- [ ] **Step 3: Define admin request/query models**

Create `model/admin_account.go`:

```go
package model

type AdminAccountQuery struct {
	Query
	Role   string
	Status string
}

type AdminAccountUpdate struct {
	Username    string     `json:"username"`
	DisplayName string     `json:"displayName"`
	Email       string     `json:"email"`
	Role        UserRole   `json:"role"`
	Status      UserStatus `json:"status"`
}

type AdminAccountPassword struct {
	Password string `json:"password"`
}
```

- [ ] **Step 4: Implement transactional repository protections**

Add `ListAdminAccounts`, `CountActiveSuperAdmins`, and `UpdatePrivilegedUser` to `repository/user.go`. `UpdatePrivilegedUser` must execute in one transaction, lock or conditionally re-read the target, reject `target.ID == actorID`, count active superadmins when the mutation removes active superadmin status, and update only when the count is greater than one.

Use a repository callback so service validation and password hashing stay outside repository, but the final protection and update are atomic:

```go
func UpdatePrivilegedUser(actorID string, target model.User, removesActiveSuperAdmin bool) (model.User, error) {
	db, err := DB()
	if err != nil {
		return target, err
	}
	err = db.Transaction(func(tx *gorm.DB) error {
		var saved model.User
		if err := tx.Where("id = ? AND role IN ?", target.ID, []model.UserRole{model.UserRoleAdmin, model.UserRoleSuperAdmin}).First(&saved).Error; err != nil {
			return err
		}
		if saved.ID == actorID {
			return errors.New("不能修改自己的管理员状态")
		}
		if removesActiveSuperAdmin && saved.Role == model.UserRoleSuperAdmin && saved.Status == model.UserStatusActive {
			var count int64
			if err := tx.Model(&model.User{}).Where("role = ? AND status = ?", model.UserRoleSuperAdmin, model.UserStatusActive).Count(&count).Error; err != nil {
				return err
			}
			if count <= 1 {
				return errors.New("必须保留至少一个有效超级管理员")
			}
		}
		return tx.Save(&target).Error
	})
	return target, err
}
```

Implement deletion with the same transaction and protection instead of calling the generic delete.

- [ ] **Step 5: Implement superadmin-only services**

Create `service/admin_account.go` with `ListAdminAccounts`, `CreateAdminAccount`, `UpdateAdminAccount`, `ResetAdminAccountPassword`, and `DeleteAdminAccount`. Every function requires `actor.Role == superadmin`; creates allow only `admin` or `superadmin`; update loads and preserves password, credits, IDs, timestamps, and external IDs; password reset hashes but never returns the hash.

- [ ] **Step 6: Add handlers and routes**

Create thin handlers for list/create/update/password/delete. Register under a new group:

```go
superAdmin := api.Group("/admin", middleware.SuperAdminAuth)
superAdmin.GET("/admins", gin.WrapF(handler.AdminAccounts))
superAdmin.POST("/admins", gin.WrapF(handler.CreateAdminAccount))
superAdmin.PATCH("/admins/:id", func(c *gin.Context) { handler.UpdateAdminAccount(c.Writer, c.Request, c.Param("id")) })
superAdmin.POST("/admins/:id/password", func(c *gin.Context) { handler.ResetAdminAccountPassword(c.Writer, c.Request, c.Param("id")) })
superAdmin.DELETE("/admins/:id", func(c *gin.Context) { handler.DeleteAdminAccount(c.Writer, c.Request, c.Param("id")) })
```

- [ ] **Step 7: Run backend tests and verify GREEN**

```bash
go test ./repository ./service ./handler ./router -run 'Test.*AdminAccount|TestSuperAdminRoutesRequireSuperAdmin' -count=1
```

Expected: PASS.

- [ ] **Step 8: Commit administrator APIs**

```bash
git add model/admin_account.go repository/user.go service/admin_account.go service/admin_account_test.go handler/admin_account.go router/router.go router/router_test.go
git commit -m "feat: add protected administrator management APIs"
```

### Task 4: Build the superadmin-only administrator page

**Files:**
- Modify: `web/src/services/api/auth.ts`
- Modify: `web/src/services/api/admin.ts`
- Modify: `web/src/stores/use-user-store.ts`
- Modify: `web/src/app/(admin)/admin/layout.tsx`
- Create: `web/src/app/(admin)/admin/admins/admin-account-view.ts`
- Create: `web/src/app/(admin)/admin/admins/admin-account-view.test.mts`
- Create: `web/src/app/(admin)/admin/admins/use-admin-accounts.ts`
- Create: `web/src/app/(admin)/admin/admins/page.tsx`

- [ ] **Step 1: Write failing protection-helper tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { adminAccountProtection } from "./admin-account-view.ts";

test("protects the current superadmin", () => {
    assert.deepEqual(adminAccountProtection({ id: "self", role: "superadmin", status: "active" } as const, "self", 2), { mutable: false, reason: "不能修改自己的管理员状态" });
});

test("protects the last active superadmin", () => {
    assert.deepEqual(adminAccountProtection({ id: "last", role: "superadmin", status: "active" } as const, "other", 1), { mutable: false, reason: "必须保留至少一个有效超级管理员" });
});
```

- [ ] **Step 2: Run test and verify RED**

```bash
cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/admins/admin-account-view.test.mts'
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Extend role types and APIs**

Change public/auth/admin user role unions to `"user" | "admin" | "superadmin"`. Add `AdminAccountQuery`, `AdminAccountUpdate`, list/create/update/reset/delete APIs to `admin.ts` using the routes from Task 3.

- [ ] **Step 4: Gate the menu and page**

In `admin/layout.tsx`, add `{ key: "/admin/admins", icon: <SafetyCertificateOutlined />, label: "管理员管理" }` only when `user.role === "superadmin"`. Treat both `admin` and `superadmin` as valid backend roles in the layout guard; do not redirect a superadmin away.

Create `admin-account-view.ts` with the exact protection helper tested above and role/status Chinese labels.

- [ ] **Step 5: Implement query/mutation hook and page**

`use-admin-accounts.ts` owns list filters and create/update/password/delete mutations. Invalidate only `["admin", "admins"]` after success.

`page.tsx` renders a ProTable with user, role, status, last login, created time, and actions. Use separate modals for account edit/create and password reset. Disable protected operations using `adminAccountProtection`, but still display the reason in Tooltip. Only permit `admin` and `superadmin` role options.

- [ ] **Step 6: Run frontend tests and typecheck**

```bash
cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/admins/admin-account-view.test.mts' && npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit administrator UI**

```bash
git add web/src/services/api/auth.ts web/src/services/api/admin.ts web/src/stores/use-user-store.ts web/src/app/'(admin)'/admin/layout.tsx web/src/app/'(admin)'/admin/admins
git commit -m "feat: add superadmin administrator management page"
```

### Task 5: Promote the approved local account and document the role model

**Files:**
- Modify: `docs/backend-database.md`
- Modify: `docs/pending-test.md`
- Modify only if needed: `docs/todo.md`
- Local data only: `data/infinite-canvas.db`

- [ ] **Step 1: Resolve the exact local target read-only**

```bash
sqlite3 -header -column data/infinite-canvas.db "SELECT id, username, role, status FROM users WHERE username = 'huangchi0910';"
```

Expected: exactly one active row. Stop and report if zero or multiple rows are returned.

- [ ] **Step 2: Promote only the resolved account in a transaction**

```bash
sqlite3 data/infinite-canvas.db "BEGIN IMMEDIATE; UPDATE users SET role = 'superadmin', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE username = 'huangchi0910' AND status = 'active'; SELECT changes(); COMMIT;"
```

Expected: `1`. The database is local runtime data and must remain untracked.

- [ ] **Step 3: Verify the promotion**

```bash
sqlite3 -header -column data/infinite-canvas.db "SELECT id, username, role, status FROM users WHERE username = 'huangchi0910';"
git status --short
```

Expected: role is `superadmin`; no database file is staged or newly tracked.

- [ ] **Step 4: Update documentation**

Document `superadmin` in the users table, add manual tests for menu visibility, ordinary-admin denial, role promotion/demotion, self protection, last-superadmin protection, and note that the approved local account was promoted without changing its password.

- [ ] **Step 5: Run fresh verification**

```bash
go test ./repository ./service ./handler ./router -count=1
cd web && npm test && npm run typecheck
cd .. && git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit docs**

```bash
git add docs/backend-database.md docs/pending-test.md docs/todo.md
git commit -m "docs: record superadmin management"
```
