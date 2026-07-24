# User Usage Identity and Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI task and credit usage consistently show the current username beside the stable user ID, then add an independent per-user admin detail page for profile, usage summary, AI tasks, and credit logs.

**Architecture:** Keep `user_id` as the only persisted identity on usage records and hydrate a non-persisted `UserSummary` in service responses. Repository filters use user subqueries so username, display name, and ID all work without N+1 queries. The admin detail page calls user-scoped backend endpoints and reuses the existing React Query, ProTable, and Ant Design patterns.

**Tech Stack:** Go 1.25, Gin, GORM, SQLite/PostgreSQL/MySQL-compatible queries, Next.js App Router, React 19, TypeScript, Ant Design 6, TanStack Query.

**Prerequisite:** Complete `2026-07-24-superadmin-management.md` first so ordinary user lists and admin role checks already use the finalized hierarchy.

---

## File map

- Modify `model/user.go`: add the public `UserSummary` response type.
- Modify `model/ai_task.go`: expose a non-persisted user summary on AI tasks.
- Modify `repository/user.go`: batch-load user summaries and make credit-log keyword search username-aware.
- Modify `repository/ai_task.go`: make the user filter username-aware while preserving all current filters.
- Modify `service/ai_task.go`: hydrate list items with user summaries.
- Modify `service/auth.go`: hydrate credit logs and provide a user overview service.
- Create `model/admin_user.go`: user overview response type.
- Create `repository/admin_user.go`: aggregate task and credit figures for one user.
- Create `service/admin_user.go`: single-user overview and scoped list orchestration.
- Create `handler/admin_user.go`: thin admin user-detail handlers.
- Modify `router/router.go`: add user overview and scoped usage routes.
- Modify `service/ai_task_test.go` and `repository/user_test.go`: backend regressions.
- Modify `web/src/services/api/admin.ts`: response types and detail APIs.
- Modify `web/src/app/(admin)/admin/ai-tasks/page.tsx`: synchronized user cell and filter copy.
- Modify `web/src/app/(admin)/admin/credit-logs/page.tsx`: synchronized user cell and search copy.
- Modify `web/src/app/(admin)/admin/users/page.tsx`: add detail navigation.
- Create `web/src/app/(admin)/admin/users/[id]/use-admin-user-detail.ts`: page-private data orchestration.
- Create `web/src/app/(admin)/admin/users/[id]/admin-user-detail-view.ts`: pure display helpers.
- Create `web/src/app/(admin)/admin/users/[id]/admin-user-detail-view.test.mts`: frontend behavior tests.
- Create `web/src/app/(admin)/admin/users/[id]/page.tsx`: independent detail page.

### Task 1: Add current-user summaries to usage list responses

**Files:**
- Modify: `model/user.go`
- Modify: `model/ai_task.go`
- Modify: `repository/user.go`
- Modify: `repository/ai_task.go`
- Modify: `service/ai_task.go`
- Modify: `service/auth.go`
- Test: `repository/user_test.go`
- Test: `service/ai_task_test.go`

- [ ] **Step 1: Write failing backend tests for username hydration and search**

Add a credit-log repository test that creates a user and proves the current username finds the user's log:

```go
func TestListCreditLogsSearchesCurrentUsername(t *testing.T) {
	setupRepositoryTestDB(t)
	db, err := DB()
	if err != nil {
		t.Fatalf("DB returned error: %v", err)
	}
	user := model.User{ID: "user-credit-name", Username: "current-name", DisplayName: "当前昵称", Role: model.UserRoleUser, Status: model.UserStatusActive}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("Create user returned error: %v", err)
	}
	log := model.CreditLog{ID: "credit-name", UserID: user.ID, Type: model.CreditLogTypeAIConsume, Amount: -3, Balance: 7, CreatedAt: "2026-07-24T10:00:00Z"}
	if err := db.Create(&log).Error; err != nil {
		t.Fatalf("Create log returned error: %v", err)
	}

	items, total, err := ListCreditLogs(model.Query{Keyword: "current-name", Page: 1, PageSize: 10})
	if err != nil || total != 1 || len(items) != 1 || items[0].ID != log.ID {
		t.Fatalf("ListCreditLogs items=%#v total=%d err=%v", items, total, err)
	}
}
```

Extend `TestListAdminAITasksFiltersByTaskFields` with a username-only query and a user-summary assertion:

```go
byName, err := ListAdminAITasks(model.AITaskQuery{User: "user-list-a-name", Page: 1, PageSize: 10})
if err != nil {
	t.Fatalf("ListAdminAITasks by username returned error: %v", err)
}
if byName.Total != 1 || len(byName.Items) != 1 || byName.Items[0].User.Username != "user-list-a-name" {
	t.Fatalf("username list result = %#v", byName)
}
```

Create the fixture user with `Username: "user-list-a-name"` instead of deriving the username from the ID.

- [ ] **Step 2: Run the new tests and verify RED**

Run:

```bash
go test ./repository ./service -run 'TestListCreditLogsSearchesCurrentUsername|TestListAdminAITasksFiltersByTaskFields' -count=1
```

Expected: FAIL because username filters and `AITask.User` do not exist.

- [ ] **Step 3: Add the response-only user summary and batch lookup**

Add to `model/user.go`:

```go
type UserSummary struct {
	ID          string `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
}

func SummaryUser(user User) UserSummary {
	return UserSummary{ID: user.ID, Username: user.Username, DisplayName: user.DisplayName}
}
```

Add this response-only field to `AITask` in `model/ai_task.go`:

```go
User UserSummary `json:"user" gorm:"-"`
```

Add the same field to `CreditLog` in `model/user.go`:

```go
User UserSummary `json:"user" gorm:"-"`
```

Add the batch loader to `repository/user.go`:

```go
func ListUserSummariesByIDs(ids []string) (map[string]model.UserSummary, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	unique := make([]string, 0, len(ids))
	seen := map[string]struct{}{}
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		unique = append(unique, id)
	}
	if len(unique) == 0 {
		return map[string]model.UserSummary{}, nil
	}
	var users []model.User
	if err := db.Where("id IN ?", unique).Find(&users).Error; err != nil {
		return nil, err
	}
	result := make(map[string]model.UserSummary, len(users))
	for _, user := range users {
		result[user.ID] = model.SummaryUser(user)
	}
	return result, nil
}
```

- [ ] **Step 4: Make filters match user ID, username, and display name**

In `repository/ai_task.go`, replace the `q.User` clause with:

```go
if value := strings.TrimSpace(q.User); value != "" {
	like := "%" + value + "%"
	tx = tx.Where(
		"user_id LIKE ? OR user_id IN (SELECT id FROM users WHERE username LIKE ? OR display_name LIKE ?)",
		like, like, like,
	)
}
```

In `repository/user.go`, include the same user subquery in both localized-type branches:

```go
userMatch := "user_id LIKE ? OR user_id IN (SELECT id FROM users WHERE username LIKE ? OR display_name LIKE ?)"
if types := creditLogTypesForKeyword(keyword); len(types) > 0 {
	tx = tx.Where("("+userMatch+") OR type LIKE ? OR type IN ? OR remark LIKE ? OR related_id LIKE ?", like, like, like, like, types, like, like)
} else {
	tx = tx.Where("("+userMatch+") OR type LIKE ? OR remark LIKE ? OR related_id LIKE ?", like, like, like, like, like, like)
}
```

- [ ] **Step 5: Hydrate usage records in services without N+1 queries**

Add focused helpers to `service/auth.go`:

```go
func hydrateCreditLogUsers(logs []model.CreditLog) ([]model.CreditLog, error) {
	ids := make([]string, 0, len(logs))
	for _, item := range logs {
		ids = append(ids, item.UserID)
	}
	users, err := repository.ListUserSummariesByIDs(ids)
	if err != nil {
		return nil, err
	}
	for i := range logs {
		logs[i].User = users[logs[i].UserID]
	}
	return logs, nil
}
```

Call it from `ListCreditLogs` before returning. Add an equivalent `hydrateAITaskUsers` helper to `service/ai_task.go` and call it after `hydrateAITaskFrontendLinks` in `ListAdminAITasks`.

- [ ] **Step 6: Run targeted tests and verify GREEN**

Run:

```bash
go test ./repository ./service -run 'TestListCreditLogs|TestListAdminAITasks' -count=1
```

Expected: PASS.

- [ ] **Step 7: Commit the synchronized usage identity change**

```bash
git add model/user.go model/ai_task.go repository/user.go repository/ai_task.go service/auth.go service/ai_task.go repository/user_test.go service/ai_task_test.go
git commit -m "fix: synchronize usage user identities"
```

### Task 2: Add user-scoped overview and usage endpoints

**Files:**
- Create: `model/admin_user.go`
- Create: `repository/admin_user.go`
- Create: `service/admin_user.go`
- Create: `handler/admin_user.go`
- Modify: `router/router.go`
- Test: `service/admin_user_test.go`
- Test: `router/router_test.go`

- [ ] **Step 1: Write failing service and route tests**

Create `service/admin_user_test.go` with a fixture user, two tasks, one consume log, and one refund log:

```go
func TestGetAdminUserOverviewReturnsScopedUsage(t *testing.T) {
	setupAITaskTestDB(t)
	user, err := saveAITaskTestUser("user-overview", 80)
	if err != nil {
		t.Fatalf("save user: %v", err)
	}
	user.Username = "overview-name"
	if _, err := repository.SaveUser(user); err != nil {
		t.Fatalf("save username: %v", err)
	}
	for index := 0; index < 2; index++ {
		saveAITaskForAdminTest(t, model.AITask{UserID: user.ID, Kind: "image", Status: model.AITaskStatusSucceeded, Credits: 5})
	}
	if _, err := repository.SaveCreditLog(model.CreditLog{ID: "overview-consume", UserID: user.ID, Type: model.CreditLogTypeAIConsume, Amount: -10, Balance: 90, CreatedAt: now()}); err != nil {
		t.Fatalf("save consume log: %v", err)
	}

	result, err := GetAdminUserOverview(user.ID)
	if err != nil {
		t.Fatalf("GetAdminUserOverview: %v", err)
	}
	if result.User.Username != "overview-name" || result.AITaskCount != 2 || result.AICreditsConsumed != 10 {
		t.Fatalf("overview = %#v", result)
	}
}
```

Add a router assertion that authenticated admin requests reach `/api/admin/users/user-1`, `/ai-tasks`, and `/credit-logs` rather than returning the generic 404.

- [ ] **Step 2: Run tests and verify RED**

```bash
go test ./service ./router -run 'TestGetAdminUserOverviewReturnsScopedUsage|TestAdminUserDetailRoutes' -count=1
```

Expected: FAIL because the service and routes do not exist.

- [ ] **Step 3: Add overview model and aggregate repository**

Create `model/admin_user.go`:

```go
package model

type AdminUserOverview struct {
	User              User `json:"user"`
	AITaskCount       int  `json:"aiTaskCount"`
	AICreditsConsumed int  `json:"aiCreditsConsumed"`
	CreditLogCount    int  `json:"creditLogCount"`
}
```

Create `repository/admin_user.go` with three user-scoped aggregate queries:

```go
package repository

import (
	"github.com/basketikun/infinite-canvas/model"
)

func AdminUserUsageTotals(userID string) (taskCount int64, consumed int64, logCount int64, err error) {
	db, err := DB()
	if err != nil {
		return 0, 0, 0, err
	}
	if err = db.Model(&model.AITask{}).Where("user_id = ?", userID).Count(&taskCount).Error; err != nil {
		return
	}
	if err = db.Model(&model.CreditLog{}).Where("user_id = ?", userID).Count(&logCount).Error; err != nil {
		return
	}
	err = db.Model(&model.CreditLog{}).
		Where("user_id = ? AND type = ?", userID, model.CreditLogTypeAIConsume).
		Select("COALESCE(SUM(-amount), 0)").Scan(&consumed).Error
	return
}
```

- [ ] **Step 4: Add service orchestration and scoped repositories**

Create `service/admin_user.go`:

```go
package service

import (
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func GetAdminUserOverview(id string) (model.AdminUserOverview, error) {
	user, ok, err := repository.GetUserByID(strings.TrimSpace(id))
	if err != nil {
		return model.AdminUserOverview{}, err
	}
	if !ok {
		return model.AdminUserOverview{}, safeMessageError{message: "用户不存在"}
	}
	user.Password = ""
	tasks, consumed, logs, err := repository.AdminUserUsageTotals(user.ID)
	if err != nil {
		return model.AdminUserOverview{}, err
	}
	return model.AdminUserOverview{User: user, AITaskCount: int(tasks), AICreditsConsumed: int(consumed), CreditLogCount: int(logs)}, nil
}

func ListAdminUserAITasks(id string, q model.AITaskQuery) (model.AITaskList, error) {
	q.User = strings.TrimSpace(id)
	return ListAdminAITasks(q)
}

func ListAdminUserCreditLogs(id string, q model.Query) (model.CreditLogList, error) {
	return ListCreditLogsForUser(strings.TrimSpace(id), q)
}
```

Add `repository.ListCreditLogsForUser(userID, q)` by extracting the existing credit-log filter builder and adding `Where("user_id = ?", userID)` before count and pagination. Add `service.ListCreditLogsForUser` that hydrates user summaries exactly as the global list does.

Use an exact user predicate for the scoped AI endpoint by adding `ExactUserID string` to `model.AITaskQuery` and applying `Where("user_id = ?", q.ExactUserID)` before the partial `User` filter. Set `ExactUserID`, not `User`, inside `ListAdminUserAITasks`.

- [ ] **Step 5: Add thin handlers and routes**

Create `handler/admin_user.go`:

```go
package handler

import (
	"net/http"

	"github.com/basketikun/infinite-canvas/service"
)

func AdminUser(w http.ResponseWriter, r *http.Request, id string) {
	result, err := service.GetAdminUserOverview(id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminUserAITasks(w http.ResponseWriter, r *http.Request, id string) {
	result, err := service.ListAdminUserAITasks(id, parseAITaskQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminUserCreditLogs(w http.ResponseWriter, r *http.Request, id string) {
	result, err := service.ListAdminUserCreditLogs(id, parseQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}
```

Register `GET /api/admin/users/:id`, `/ai-tasks`, and `/credit-logs` under `middleware.AdminAuth`. Reserve `/activity-logs` for the next plan; add it only when that handler exists.

- [ ] **Step 6: Run scoped endpoint tests and verify GREEN**

```bash
go test ./service ./router -run 'TestGetAdminUserOverviewReturnsScopedUsage|TestAdminUserDetailRoutes' -count=1
```

Expected: PASS.

- [ ] **Step 7: Commit the backend user detail slice**

```bash
git add model/admin_user.go model/ai_task.go repository/admin_user.go repository/ai_task.go repository/user.go service/admin_user.go service/admin_user_test.go service/auth.go handler/admin_user.go router/router.go router/router_test.go
git commit -m "feat: add admin user usage detail endpoints"
```

### Task 3: Synchronize user cells in existing admin lists

**Files:**
- Modify: `web/src/services/api/admin.ts`
- Modify: `web/src/app/(admin)/admin/ai-tasks/page.tsx`
- Modify: `web/src/app/(admin)/admin/credit-logs/page.tsx`
- Create: `web/src/app/(admin)/admin/users/admin-user-display.ts`
- Test: `web/src/app/(admin)/admin/users/admin-user-display.test.mts`

- [ ] **Step 1: Write a failing pure display test**

Create `admin-user-display.test.mts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { adminUsageUserDisplay } from "./admin-user-display.ts";

test("uses current display name and keeps the stable user id", () => {
    assert.deepEqual(adminUsageUserDisplay({ userId: "user-1", user: { id: "user-1", username: "current-name", displayName: "当前昵称" } }), {
        primary: "当前昵称",
        secondary: "current-name · user-1",
        deleted: false,
    });
});

test("falls back to a deleted-user label without losing the id", () => {
    assert.deepEqual(adminUsageUserDisplay({ userId: "user-deleted" }), {
        primary: "用户已删除",
        secondary: "user-deleted",
        deleted: true,
    });
});
```

- [ ] **Step 2: Run the frontend test and verify RED**

```bash
cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/users/admin-user-display.test.mts'
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Add API response types and the pure helper**

Add to `web/src/services/api/admin.ts`:

```ts
export type AdminUserSummary = Pick<AdminUser, "id" | "username" | "displayName">;
```

Add `user: AdminUserSummary` to `AdminAITask` and `AdminCreditLog`.

Create `admin-user-display.ts`:

```ts
import type { AdminUserSummary } from "@/services/api/admin";

export function adminUsageUserDisplay(item: { userId: string; user?: AdminUserSummary | null }) {
    const user = item.user;
    if (!user?.id) return { primary: "用户已删除", secondary: item.userId || "-", deleted: true };
    const primary = user.displayName || user.username || item.userId;
    const secondary = [user.username && user.username !== primary ? user.username : "", item.userId].filter(Boolean).join(" · ");
    return { primary, secondary, deleted: false };
}
```

- [ ] **Step 4: Replace both list user cells with the shared display result**

In both pages, render a compact two-line cell:

```tsx
const display = adminUsageUserDisplay(item);
return (
    <Flex vertical style={{ minWidth: 0 }}>
        <Typography.Text strong={!display.deleted} type={display.deleted ? "secondary" : undefined} ellipsis>
            {display.primary}
        </Typography.Text>
        <Typography.Text type="secondary" copyable={{ text: item.userId }} ellipsis>
            {display.secondary}
        </Typography.Text>
    </Flex>
);
```

Update the AI user filter placeholder to `用户名、昵称或用户 ID` and the credit keyword placeholder to `搜索用户名、用户 ID、类型、备注或关联 ID`.

- [ ] **Step 5: Run the helper test and typecheck**

```bash
cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/users/admin-user-display.test.mts' && npm run typecheck
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit the synchronized admin list UI**

```bash
git add web/src/services/api/admin.ts web/src/app/'(admin)'/admin/ai-tasks/page.tsx web/src/app/'(admin)'/admin/credit-logs/page.tsx web/src/app/'(admin)'/admin/users/admin-user-display.ts web/src/app/'(admin)'/admin/users/admin-user-display.test.mts
git commit -m "fix: show usernames beside usage user ids"
```

### Task 4: Build the independent admin user detail page

**Files:**
- Modify: `web/src/services/api/admin.ts`
- Modify: `web/src/app/(admin)/admin/users/page.tsx`
- Create: `web/src/app/(admin)/admin/users/[id]/admin-user-detail-view.ts`
- Create: `web/src/app/(admin)/admin/users/[id]/admin-user-detail-view.test.mts`
- Create: `web/src/app/(admin)/admin/users/[id]/use-admin-user-detail.ts`
- Create: `web/src/app/(admin)/admin/users/[id]/page.tsx`

- [ ] **Step 1: Write failing tests for overview cards and tab counts**

Create `admin-user-detail-view.test.mts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { adminUserDetailStats, adminUserDetailTabs } from "./admin-user-detail-view.ts";

const detail = { user: { credits: 80, lastLoginAt: "2026-07-24T10:00:00Z" }, aiTaskCount: 2, aiCreditsConsumed: 10, creditLogCount: 3 };

test("builds the four overview stats", () => {
    assert.deepEqual(adminUserDetailStats(detail).map((item) => [item.key, item.value]), [
        ["credits", 80],
        ["consumed", 10],
        ["tasks", 2],
        ["lastLogin", "2026-07-24T10:00:00Z"],
    ]);
});

test("builds usage tab labels with server counts", () => {
    assert.deepEqual(adminUserDetailTabs(detail), ["操作记录", "AI 任务 2", "算力点流水 3"]);
});
```

- [ ] **Step 2: Run the test and verify RED**

```bash
cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/users/[id]/admin-user-detail-view.test.mts'
```

Expected: FAIL because the helpers do not exist.

- [ ] **Step 3: Add detail response types and API calls**

Add to `web/src/services/api/admin.ts`:

```ts
export type AdminUserOverview = {
    user: AdminUser;
    aiTaskCount: number;
    aiCreditsConsumed: number;
    creditLogCount: number;
};

export function fetchAdminUser(token: string, id: string) {
    return apiGet<AdminUserOverview>(`/api/admin/users/${encodeURIComponent(id)}`, undefined, token);
}

export function fetchAdminUserAITasks(token: string, id: string, query: AdminAITaskQuery) {
    return apiGet<AdminAITaskListResponse>(`/api/admin/users/${encodeURIComponent(id)}/ai-tasks`, compactApiParams(query), token);
}

export function fetchAdminUserCreditLogs(token: string, id: string, query: AdminUserQuery) {
    return apiGet<AdminCreditLogListResponse>(`/api/admin/users/${encodeURIComponent(id)}/credit-logs`, compactApiParams(query), token);
}
```

- [ ] **Step 4: Implement the pure view helpers**

Create `admin-user-detail-view.ts`:

```ts
import type { AdminUser } from "@/services/api/admin";

type AdminUserDetailViewInput = {
    user: Pick<AdminUser, "credits" | "lastLoginAt">;
    aiTaskCount: number;
    aiCreditsConsumed: number;
    creditLogCount: number;
};

export function adminUserDetailStats(detail: AdminUserDetailViewInput) {
    return [
        { key: "credits", label: "当前算力点", value: detail.user.credits },
        { key: "consumed", label: "累计 AI 消耗", value: detail.aiCreditsConsumed },
        { key: "tasks", label: "AI 任务", value: detail.aiTaskCount },
        { key: "lastLogin", label: "最近登录", value: detail.user.lastLoginAt },
    ];
}

export function adminUserDetailTabs(detail: AdminUserDetailViewInput) {
    return ["操作记录", `AI 任务 ${detail.aiTaskCount}`, `算力点流水 ${detail.creditLogCount}`];
}
```

- [ ] **Step 5: Add page-private React Query orchestration**

Create `use-admin-user-detail.ts` with three independent queries keyed by `userId`, tab-local page, and tab-local filters. Expose `overview`, `tasks`, `creditLogs`, loading flags, totals, pagination setters, and refresh functions. Keep the activity tab as an empty state reading `操作审计将在下一阶段接入` until the activity plan is executed.

Use these exact query-key roots:

```ts
["admin", "user", token, userId]
["admin", "user", userId, "ai-tasks", token, aiTaskQuery]
["admin", "user", userId, "credit-logs", token, creditQuery]
```

- [ ] **Step 6: Implement the page and list navigation**

In `users/page.tsx`, use `useRouter()` and add a `查看详情` button:

```tsx
<Tooltip title="查看详情">
    <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => router.push(`/admin/users/${encodeURIComponent(item.id)}`)} />
</Tooltip>
```

In `[id]/page.tsx`, render:

- breadcrumb/back button;
- profile card with avatar, name, username, copyable ID, role and status;
- four `Statistic` cards from `adminUserDetailStats`;
- `Tabs` containing the activity placeholder, scoped AI `ProTable`, and scoped credit `ProTable`;
- `Result status="404"` when the API reports a missing user.

Reuse the existing AI and credit column labels; do not import page components or duplicate global theme branches.

The page is reachable to both `admin` and `superadmin`; it only receives ordinary users because the prerequisite plan scopes the user repository and service.

- [ ] **Step 7: Run targeted tests and typecheck**

```bash
cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/users/[id]/admin-user-detail-view.test.mts' 'src/app/(admin)/admin/users/admin-user-display.test.mts' && npm run typecheck
```

Expected: tests pass and TypeScript exits 0.

- [ ] **Step 8: Commit the detail page**

```bash
git add web/src/services/api/admin.ts web/src/app/'(admin)'/admin/users/page.tsx web/src/app/'(admin)'/admin/users/'[id]'
git commit -m "feat: add admin user usage detail page"
```

### Task 5: Document and verify the first delivery checkpoint

**Files:**
- Modify: `docs/pending-test.md`
- Modify only if needed: `docs/todo.md`

- [ ] **Step 1: Record the user-visible changes in pending-test**

Add a concise entry covering synchronized usernames, username/ID search, user detail navigation, overview cards, and scoped usage tabs. Do not describe IP approval or operation audit as implemented in this checkpoint.

- [ ] **Step 2: Check todo movement**

Search `docs/todo.md` for an existing user-management or usage-view item. Move only a matching completed item to `docs/pending-test.md`; do not invent or rewrite unrelated todo entries.

- [ ] **Step 3: Run fresh checkpoint verification**

```bash
go test ./repository ./service ./handler ./router -count=1
cd web && npm test && npm run typecheck
cd .. && git diff --check
```

Expected: all commands exit 0 with no failures.

- [ ] **Step 4: Commit checkpoint documentation**

```bash
git add docs/pending-test.md docs/todo.md
git commit -m "docs: record user usage detail checkpoint"
```
