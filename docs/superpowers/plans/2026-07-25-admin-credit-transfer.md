# Admin Credit Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make only superadmins exempt from credit balance limits, let superadmins assign administrator balances, and make ordinary-admin user adjustments transfer credits to or from the administrator.

**Architecture:** Keep role and delta decisions in `service/`, add one repository transaction for paired administrator/user balance updates and logs, and reuse `POST /api/admin/users/:id/credits`. Credit consumption returns whether a real debit occurred so callers only refund real debits; AI task and Agent Run estimated usage remains unchanged for superadmins.

**Tech Stack:** Go, Gin, GORM, SQLite/MySQL/PostgreSQL, Next.js App Router, React, TypeScript, Ant Design, React Query, Zustand, Node test runner.

---

## File map

- `service/auth.go`: role-aware debit/refund orchestration and adjustment permission matrix.
- `repository/user.go`: atomic two-account credit transfer and paired credit-log writes.
- `service/agent_run_worker.go`: preserve estimated Agent Run usage without reserving a superadmin balance.
- `service/auth_test.go`, `service/agent_run_worker_test.go`: backend role, transfer, atomicity, and exemption regressions.
- `web/src/app/(admin)/admin/admins/admin-account-view.ts`: pure administrator credit display/action rules.
- `web/src/app/(admin)/admin/admins/page.tsx`: balance column and adjustment modal.
- `web/src/app/(admin)/admin/admins/use-admin-accounts.ts`: administrator adjustment mutation.
- `web/src/app/(admin)/admin/users/admin-user-credit-view.ts`: pure transfer wording/delta helper.
- `web/src/app/(admin)/admin/users/page.tsx`: role-aware transfer confirmation copy.
- `web/src/app/(admin)/admin/users/use-admin-users.ts`: refresh the signed-in administrator after transfer.
- `web/src/services/api/admin.ts`: continue using the shared adjustment endpoint.
- `docs/backend-database.md`, `docs/pending-test.md`: record balance ownership, paired logs, and acceptance steps.

### Task 1: Superadmin balance exemption

**Files:**
- Modify: `service/auth.go`
- Modify: `service/auth_test.go`
- Modify: `handler/ai.go`
- Modify: `service/agent_run_worker.go`
- Modify: `service/agent_run_worker_test.go`

- [ ] **Step 1: Write failing service tests**

Add tests that save a zero-credit superadmin and a zero-credit ordinary admin, then assert the charge result distinguishes an exempt call from an insufficient balance:

```go
func TestConsumeUserCreditsExemptsOnlySuperAdmin(t *testing.T) {
    setupAuthTestDB(t)
    super := saveCreditUser(t, "super", model.UserRoleSuperAdmin, 0)
    admin := saveCreditUser(t, "admin", model.UserRoleAdmin, 0)

    charged, err := ConsumeUserCreditsForTask(super.ID, "model", 5, "/images", "task-super")
    if err != nil || charged {
        t.Fatalf("superadmin charged=%v err=%v", charged, err)
    }
    if charged, err = ConsumeUserCreditsForTask(admin.ID, "model", 5, "/images", "task-admin"); err == nil || charged {
        t.Fatalf("admin charged=%v err=%v, want insufficient", charged, err)
    }
}
```

Add an Agent Run test that calls `reserveAgentRunCredits` for a superadmin and verifies `Credits` remains the estimated amount while `CreditsReserved`, `CreditsRefunded`, user balance, and related credit logs remain zero.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
go test ./service -run 'TestConsumeUserCreditsExemptsOnlySuperAdmin|TestAgentRunSuperAdmin' -count=1
```

Expected: FAIL because charge functions do not return a debit flag and superadmins are still balance-limited.

- [ ] **Step 3: Implement the minimal role-aware charge result**

Change the charge API to return `(bool, error)`:

```go
func ConsumeUserCreditsForTask(userID, modelName string, credits int, path, relatedID string) (bool, error) {
    if credits <= 0 { return false, nil }
    user, ok, err := repository.GetUserByID(userID)
    if err != nil { return false, err }
    if !ok { return false, safeMessageError{message: "用户不存在"} }
    if model.IsSuperAdminRole(user.Role) { return false, nil }
    // Existing conditional debit and log write.
    return true, nil
}
```

Update `handler/ai.go` to retain the returned `charged` flag and call `RefundUserCreditsForTask` only when true. Update `reserveAgentRunCredits` to increment `CreditsReserved` only when charged; the existing log-derived refund path then refunds only real reservations.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add service/auth.go service/auth_test.go handler/ai.go service/agent_run_worker.go service/agent_run_worker_test.go
git commit -m "feat: exempt superadmins from credit balances"
```

### Task 2: Atomic ordinary-admin credit transfers

**Files:**
- Modify: `repository/user.go`
- Modify: `service/auth.go`
- Modify: `service/auth_test.go`

- [ ] **Step 1: Write failing transfer and permission tests**

Add table-driven tests for:

```go
func TestAdjustAdminUserCreditsTransfersOrdinaryAdminBalance(t *testing.T) {
    setupAuthTestDB(t)
    admin := saveCreditUser(t, "admin", model.UserRoleAdmin, 100)
    user := saveCreditUser(t, "user", model.UserRoleUser, 20)

    updated, err := AdjustAdminUserCredits(model.PublicUser(admin), user.ID, 50)
    if err != nil || updated.Credits != 50 { t.Fatalf("updated=%#v err=%v", updated, err) }
    assertUserCredits(t, admin.ID, 70)

    updated, err = AdjustAdminUserCredits(model.PublicUser(admin), user.ID, 10)
    if err != nil || updated.Credits != 10 { t.Fatalf("updated=%#v err=%v", updated, err) }
    assertUserCredits(t, admin.ID, 110)
    assertPairedTransferLogs(t, admin.ID, user.ID)
}
```

Also assert insufficient administrator balance leaves both balances and log count unchanged, ordinary admins cannot target themselves or another admin, superadmins can set an ordinary admin/user balance without changing their own balance, and no caller can adjust a superadmin.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
go test ./service -run 'TestAdjustAdminUserCredits' -count=1
```

Expected: FAIL because privileged targets are always rejected and ordinary-user adjustment currently creates credits instead of transferring them.

- [ ] **Step 3: Add the repository transaction**

Add a repository operation that receives the already-authorized actor/target snapshots, the target balance, timestamp, related ID, and log metadata. Inside `db.Transaction`:

```go
actorDelta := target.Credits - targetCredits
actorUpdate := tx.Model(&model.User{}).
    Where("id = ? AND role = ? AND credits = ?", actor.ID, model.UserRoleAdmin, actor.Credits).
    Updates(map[string]any{"credits": actor.Credits + actorDelta, "updated_at": stamp})
targetUpdate := tx.Model(&model.User{}).
    Where("id = ? AND role = ? AND credits = ?", target.ID, model.UserRoleUser, target.Credits).
    Updates(map[string]any{"credits": targetCredits, "updated_at": stamp})
```

Reject negative computed balances or zero affected rows, insert two `admin_adjust` logs with the same `RelatedID`, inverse `Amount` values, correct post-update `Balance` values, and JSON metadata identifying actor, counterparty, and direction. Return the refreshed target. Any error rolls back both balances and logs.

- [ ] **Step 4: Implement the service permission matrix**

In `AdjustAdminUserCredits`:

```go
switch {
case model.IsSuperAdminRole(target.Role):
    return model.User{}, safeMessageError{message: "不能调整超级管理员算力点"}
case model.IsSuperAdminRole(actor.Role):
    return adjustUserCreditsBySuperAdmin(actor, target, credits)
case actor.Role == model.UserRoleAdmin && target.Role == model.UserRoleUser:
    return transferAdminCreditsToUser(actor, target, credits)
default:
    return model.User{}, safeMessageError{message: "无权调整该账号算力点"}
}
```

Reject negative target balances. For transfers, create one `transfer-...` related ID and call the repository transaction. Convert insufficient/conflict results into stable Chinese messages. For superadmin direct adjustment, keep one target-side `admin_adjust` log and add actor metadata without changing the superadmin balance.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add repository/user.go service/auth.go service/auth_test.go
git commit -m "feat: transfer administrator credits atomically"
```

### Task 3: Administrator-management balance UI

**Files:**
- Modify: `web/src/app/(admin)/admin/admins/admin-account-view.ts`
- Modify: `web/src/app/(admin)/admin/admins/admin-account-view.test.mts`
- Modify: `web/src/app/(admin)/admin/admins/use-admin-accounts.ts`
- Modify: `web/src/app/(admin)/admin/admins/page.tsx`

- [ ] **Step 1: Write failing view-rule tests**

Add tests for a pure helper:

```ts
assert.deepEqual(adminCreditView({ role: "superadmin", credits: 0 }), { label: "余额不限", adjustable: false });
assert.deepEqual(adminCreditView({ role: "admin", credits: 80 }), { label: "80", adjustable: true });
assert.deepEqual(adminCreditDelta(80, 120), { amount: 40, direction: "增加" });
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node --experimental-strip-types --test 'src/app/(admin)/admin/admins/admin-account-view.test.mts'
```

Expected: FAIL because the credit view helpers do not exist.

- [ ] **Step 3: Implement helpers, mutation, column, and modal**

Implement:

```ts
export function adminCreditView(account: Pick<AdminAccount, "role" | "credits">) {
    return account.role === "superadmin"
        ? { label: "余额不限", adjustable: false }
        : { label: String(account.credits), adjustable: true };
}
```

Add an `adjustAdminUserCredits` mutation to `useAdminAccounts`, invalidate `["admin", "admins"]`, and show “管理员算力点已调整”. In `page.tsx`, add a balance column, an adjustment action only for ordinary-admin rows, and an `InputNumber` modal showing current balance, target balance, and delta before confirmation.

- [ ] **Step 4: Run the focused test and TypeScript check**

Run:

```bash
node --experimental-strip-types --test 'src/app/(admin)/admin/admins/admin-account-view.test.mts'
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 'web/src/app/(admin)/admin/admins' web/src/services/api/admin.ts
git commit -m "feat: manage administrator credit balances"
```

### Task 4: Ordinary-admin transfer wording and signed-in balance refresh

**Files:**
- Create: `web/src/app/(admin)/admin/users/admin-user-credit-view.ts`
- Create: `web/src/app/(admin)/admin/users/admin-user-credit-view.test.mts`
- Modify: `web/src/app/(admin)/admin/users/page.tsx`
- Modify: `web/src/app/(admin)/admin/users/use-admin-users.ts`

- [ ] **Step 1: Write the failing copy test**

```ts
assert.equal(adminUserCreditConfirm("admin", 20, 50), "将向用户转移 30 算力点，并从你的余额中扣除。确认继续？");
assert.equal(adminUserCreditConfirm("admin", 50, 20), "将从用户收回 30 算力点，并返还到你的余额。确认继续？");
assert.equal(adminUserCreditConfirm("superadmin", 20, 50), "将用户算力点调整为 50，并记录后台调整流水。确认继续？");
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
node --experimental-strip-types --test 'src/app/(admin)/admin/users/admin-user-credit-view.test.mts'
```

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement copy and refresh behavior**

Use the helper in the user edit modal and change the section title to “额度转移” for ordinary admins. In `useAdminUsers`, select `hydrateUser` from `useUserStore` and call it after invalidating the user query so the global header immediately displays the administrator's new balance.

- [ ] **Step 4: Run focused frontend tests and typecheck**

Run:

```bash
node --experimental-strip-types --test 'src/app/(admin)/admin/users/admin-user-credit-view.test.mts'
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 'web/src/app/(admin)/admin/users'
git commit -m "feat: explain administrator credit transfers"
```

### Task 5: Documentation and complete verification

**Files:**
- Modify: `docs/backend-database.md`
- Modify: `docs/pending-test.md`
- Inspect: `docs/todo.md`

- [ ] **Step 1: Update test-facing documentation**

Document that `users.credits` is not consulted for superadmin AI access, ordinary administrators own real balances, ordinary-admin adjustments are paired transfers, and both transfer logs share a related ID. Add manual checks to `docs/pending-test.md`. Move a matching todo only if one exists; otherwise leave `docs/todo.md` unchanged.

- [ ] **Step 2: Run complete verification**

Run:

```bash
go test ./... -count=1
cd web && npm test && npm run typecheck
git diff --check
```

Expected: all commands exit 0, with zero Go failures, zero Node test failures, zero TypeScript errors, and no whitespace errors.

- [ ] **Step 3: Review the implementation against the specification**

Confirm every role/action cell in the design matrix has a test, all balance mutations happen through the transaction or the superadmin direct-adjust path, no superadmin balance is changed, and unrelated files remain untouched.

- [ ] **Step 4: Commit documentation**

```bash
git add docs/backend-database.md docs/pending-test.md
git commit -m "docs: record administrator credit controls"
```
