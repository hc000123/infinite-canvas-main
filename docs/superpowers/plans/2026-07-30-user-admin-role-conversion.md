# User/Admin Role Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a superadmin to promote an existing user to admin and demote an admin back to user without losing account data or history.

**Architecture:** Add a dedicated superadmin-only role conversion endpoint rather than weakening either existing account editor. The service revalidates database roles, while the repository performs the role update and security activity insert in one transaction. The administrator page adds a searchable promotion modal and a demotion action backed by the new endpoint.

**Tech Stack:** Go, Gin, GORM, SQLite tests, Next.js App Router, React, TypeScript, Ant Design, TanStack Query, Node test runner.

---

## File map

- `model/admin_account.go`: role conversion request and repository input types.
- `model/user_activity.go`: controlled role-change audit action.
- `repository/user.go`: atomic role transition plus audit insert.
- `repository/user_test.go`: persistence, data preservation, audit, and concurrency-state regression coverage.
- `service/admin_account.go`: authorization and legal transition validation.
- `service/admin_account_test.go`: superadmin authorization, promotion, demotion, preservation, and invalid transition tests.
- `handler/admin_account.go`: decode the role-only request and return the standard response.
- `router/router.go`: register the superadmin-only endpoint.
- `router/router_test.go`: prove the route exists behind authentication.
- `web/src/services/api/admin.ts`: typed role conversion API client.
- `web/src/app/(admin)/admin/admins/admin-account-view.ts`: small pure helpers for promotion/demotion presentation.
- `web/src/app/(admin)/admin/admins/admin-account-view.test.mts`: frontend behavior tests.
- `web/src/app/(admin)/admin/admins/use-admin-accounts.ts`: candidate search and conversion mutations/cache invalidation.
- `web/src/app/(admin)/admin/admins/page.tsx`: promotion modal and demotion confirmation UI.
- `web/src/app/(admin)/admin/users/[id]/admin-user-activity-view.ts`: Chinese label for role-change audit records.
- `web/src/app/(admin)/admin/users/[id]/admin-user-activity-view.test.mts`: audit label regression test.
- `docs/backend-database.md`: document atomic role transition and audit behavior.
- `docs/pending-test.md`: record user-facing verification steps.

### Task 1: Define the atomic role transition contract

**Files:**
- Modify: `model/admin_account.go`
- Modify: `model/user_activity.go`
- Modify: `repository/user_test.go`
- Modify: `repository/user.go`

- [ ] **Step 1: Write the failing repository tests**

Add tests that create a superadmin actor and a target user with password hash, profile fields, credits, IP policy, and timestamps. Call `ChangeUserRole` with `FromRole: user`, `ToRole: admin`, then assert only `role` and `updated_at` changed and exactly one `security.admin_role_changed` activity exists with target `user_id`. Add a second test whose expected old role is stale and assert no role or audit row changes.

- [ ] **Step 2: Run the repository tests and verify RED**

Run: `go test ./repository -run 'TestChangeUserRole' -count=1`

Expected: FAIL because `ChangeUserRole`, `AdminRoleChangeInput`, and `ActivityActionAdminRoleChanged` do not exist.

- [ ] **Step 3: Add the minimal model and repository implementation**

Define:

```go
type AdminRoleChangeRequest struct {
    Role UserRole `json:"role"`
}

type AdminRoleChangeInput struct {
    ActorID  string
    TargetID string
    FromRole UserRole
    ToRole   UserRole
    UpdatedAt string
    Activity UserActivityLog
}
```

Add `ActivityActionAdminRoleChanged = "security.admin_role_changed"`. Implement `repository.ChangeUserRole` with a GORM transaction that reloads an active superadmin actor, reloads the target using `id` and `from_role`, rejects self-change, updates only `role` and `updated_at`, and creates the supplied activity row before commit.

- [ ] **Step 4: Run repository tests and verify GREEN**

Run: `go test ./repository -run 'TestChangeUserRole' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit the repository contract**

```bash
git add model/admin_account.go model/user_activity.go repository/user.go repository/user_test.go
git commit -m "feat: add atomic administrator role conversion"
```

### Task 2: Add service validation and the protected HTTP endpoint

**Files:**
- Modify: `service/admin_account_test.go`
- Modify: `service/admin_account.go`
- Modify: `handler/admin_account.go`
- Modify: `router/router_test.go`
- Modify: `router/router.go`

- [ ] **Step 1: Write failing service tests**

Add tests for `ChangeAdminAccountRole(ctx, actor, id, role)` covering `user → admin`, `admin → user`, preservation of ID/password/profile/credits/history, ordinary-admin rejection, a token claiming superadmin after its database role changed, `superadmin` target rejection, same-role rejection, self-rejection, and invalid requested role rejection. Supply request metadata and assert the saved audit metadata contains `actorId`, `fromRole`, and `toRole`.

- [ ] **Step 2: Run service tests and verify RED**

Run: `go test ./service -run 'TestChangeAdminAccountRole' -count=1`

Expected: FAIL because `ChangeAdminAccountRole` does not exist.

- [ ] **Step 3: Implement minimal service validation**

Add a context-aware service that accepts only destination `admin` or `user`, reloads actor and target records, maps legal old/new pairs, constructs a target-owned security activity using `RequestMetaFromContext`, calls the atomic repository method, clears the password from the response, and returns Chinese safe errors for invalid cases.

- [ ] **Step 4: Run service tests and verify GREEN**

Run: `go test ./service -run 'TestChangeAdminAccountRole' -count=1`

Expected: PASS.

- [ ] **Step 5: Write the failing route test**

Extend `TestSuperAdminRoutesRequireSuperAdmin` with `POST /api/admin/admins/user-1/role` and assert the route is not 404 and reaches superadmin authentication.

- [ ] **Step 6: Run the route test and verify RED**

Run: `go test ./router -run TestSuperAdminRoutesRequireSuperAdmin -count=1`

Expected: FAIL because the new route is missing.

- [ ] **Step 7: Add handler and route**

Decode `model.AdminRoleChangeRequest`, read the actor from context, call `service.ChangeAdminAccountRole(r.Context(), actor, id, request.Role)`, and return `OK(w, item)` or the existing standardized error response. Register `superAdmin.POST("/admins/:id/role", ...)`.

- [ ] **Step 8: Run service and route tests**

Run: `go test ./service ./router -run 'TestChangeAdminAccountRole|TestSuperAdminRoutesRequireSuperAdmin' -count=1`

Expected: PASS.

- [ ] **Step 9: Commit the service and route**

```bash
git add service/admin_account.go service/admin_account_test.go handler/admin_account.go router/router.go router/router_test.go
git commit -m "feat: expose protected account role conversion"
```

### Task 3: Add typed frontend behavior and API calls

**Files:**
- Modify: `web/src/services/api/admin.ts`
- Modify: `web/src/app/(admin)/admin/admins/admin-account-view.test.mts`
- Modify: `web/src/app/(admin)/admin/admins/admin-account-view.ts`
- Modify: `web/src/app/(admin)/admin/users/[id]/admin-user-activity-view.test.mts`
- Modify: `web/src/app/(admin)/admin/users/[id]/admin-user-activity-view.ts`

- [ ] **Step 1: Write failing pure frontend tests**

Assert that `adminRoleConversion` returns a demotion action only for `admin`, never for `superadmin`, and that `activityActionLabel("security.admin_role_changed")` returns `管理员角色变更`.

- [ ] **Step 2: Run frontend tests and verify RED**

Run: `cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/admins/admin-account-view.test.mts' 'src/app/(admin)/admin/users/[id]/admin-user-activity-view.test.mts'`

Expected: FAIL because the conversion helper and action label are missing.

- [ ] **Step 3: Implement minimal typed helpers and API**

Add:

```ts
export async function changeAdminAccountRole(token: string, id: string, role: "admin" | "user") {
    return apiPost<AdminUser>(`/api/admin/admins/${encodeURIComponent(id)}/role`, { role }, token);
}
```

Add the pure row-action helper and the Chinese audit label without changing unrelated labels.

- [ ] **Step 4: Run frontend tests and verify GREEN**

Run the same targeted Node test command.

Expected: PASS.

- [ ] **Step 5: Commit frontend contracts**

```bash
git add web/src/services/api/admin.ts 'web/src/app/(admin)/admin/admins/admin-account-view.ts' 'web/src/app/(admin)/admin/admins/admin-account-view.test.mts' 'web/src/app/(admin)/admin/users/[id]/admin-user-activity-view.ts' 'web/src/app/(admin)/admin/users/[id]/admin-user-activity-view.test.mts'
git commit -m "feat: add account role conversion client"
```

### Task 4: Build the promotion and demotion UI

**Files:**
- Modify: `web/src/app/(admin)/admin/admins/use-admin-accounts.ts`
- Modify: `web/src/app/(admin)/admin/admins/page.tsx`

- [ ] **Step 1: Extend the page hook**

Use the existing `fetchAdminUsers` API for promotion candidates, enabled only while the promotion modal is open, with `pageSize: 20` and the entered keyword. Add a `changeRole` mutation using `changeAdminAccountRole`; on success invalidate both `["admin", "admins"]` and `["admin", "users"]`, and show `用户已提升为管理员` or `管理员已降为普通用户` based on the requested role.

- [ ] **Step 2: Add the promotion modal**

Add a secondary toolbar button `提升现有用户`. The modal uses a searchable `Select` with server-side keyword search, shows username/display name and current credits, and requires an explicit confirmation. It submits `changeRole(selectedUserId, "admin")` and closes only after success.

- [ ] **Step 3: Add demotion confirmation**

For ordinary administrator rows only, add a tooltip action `降为普通用户`. The confirmation text must state that account ID, profile, balance, usage, and operation history are preserved. Submit `changeRole(account.id, "user")`. Do not render this action for superadmins.

- [ ] **Step 4: Run targeted frontend tests and typecheck**

Run:

```bash
cd web
npm test -- --test-name-pattern='administrator|role|activity'
npm run typecheck
```

Expected: tests and typecheck PASS.

- [ ] **Step 5: Commit the UI**

```bash
git add 'web/src/app/(admin)/admin/admins/use-admin-accounts.ts' 'web/src/app/(admin)/admin/admins/page.tsx'
git commit -m "feat: manage administrator role conversions"
```

### Task 5: Document and verify the complete change

**Files:**
- Modify: `docs/backend-database.md`
- Modify: `docs/pending-test.md`
- Check: `docs/todo.md`

- [ ] **Step 1: Update project documentation**

Document that role conversion updates only `role` and `updated_at`, preserves all account/history data, is superadmin-only, and writes `security.admin_role_changed` atomically. Add pending manual checks for promotion, preserved balance/history, demotion, and rejection under an ordinary admin. Confirm `docs/todo.md` needs no new unfinished item because the requested feature is implemented in this change.

- [ ] **Step 2: Run focused and full verification**

Run:

```bash
go test ./repository ./service ./router -count=1
go test ./... -count=1
cd web && npm test
cd web && npm run typecheck
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 3: Review the final diff against the approved design**

Confirm each acceptance criterion in `docs/superpowers/specs/2026-07-30-user-admin-role-conversion-design.md` has implementation and test evidence, no ordinary-user editor role restriction was weakened, and no unrelated file changed.

- [ ] **Step 4: Commit documentation**

```bash
git add docs/backend-database.md docs/pending-test.md docs/superpowers/specs/2026-07-30-user-admin-role-conversion-design.md docs/superpowers/plans/2026-07-30-user-admin-role-conversion.md
git commit -m "docs: record administrator role conversion"
```

