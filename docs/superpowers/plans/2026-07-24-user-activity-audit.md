# User Activity Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record a privacy-limited stream of low-frequency business events and expose it in the admin user detail page without logging high-frequency canvas interactions or sensitive AI content.

**Architecture:** Persist controlled activity enums in a dedicated table. Server-owned events are written directly by services; browser-local project, canvas, asset, import, export, and download events use one authenticated idempotent reporting endpoint. Request identity, IP, user agent, and session metadata come from server context, never from the client payload.

**Tech Stack:** Go 1.25, Gin middleware/context, GORM, Next.js, React 19, TypeScript, Ant Design, TanStack Query, browser `crypto.randomUUID()`.

**Prerequisites:** Complete `2026-07-24-superadmin-management.md` and `2026-07-24-user-usage-detail.md` first.

---

## File map

- Create `model/user_activity.go`: event enums, table model, query and list response.
- Create `repository/user_activity.go`: idempotent save and admin pagination/filtering.
- Modify `repository/db.go`: migrate the activity table.
- Create `service/request_meta.go`: request IP, user-agent, and session context.
- Modify `middleware/admin.go`: attach request metadata before auth handlers run.
- Modify `router/router.go`: install metadata middleware and activity routes.
- Create `service/user_activity.go`: validation, sanitization, backend recording, and list hydration.
- Create `handler/user_activity.go`: user report and admin list handlers.
- Create `repository/user_activity_test.go` and `service/user_activity_test.go`: backend tests.
- Modify `service/ai_task.go` and `service/auth.go`: server-owned AI and credit events.
- Modify `web/src/services/api/admin.ts`: admin activity types and list API.
- Create `web/src/services/api/activity.ts`: authenticated report API.
- Create `web/src/hooks/use-activity-audit.ts`: global non-blocking side-effect hook.
- Create `web/src/hooks/activity-audit.ts` and `.test.mts`: allowed client events and payload construction.
- Modify `web/src/app/(admin)/admin/users/[id]/use-admin-user-detail.ts`: activity query.
- Modify `web/src/app/(admin)/admin/users/[id]/page.tsx`: activity timeline/table.
- Modify focused project/asset action files listed in Task 5: report only completed business actions.
- Modify `docs/backend-database.md`, `docs/pending-test.md`, and possibly `docs/todo.md`.

### Task 1: Persist idempotent activity events

**Files:**
- Create: `model/user_activity.go`
- Create: `repository/user_activity.go`
- Create: `repository/user_activity_test.go`
- Modify: `repository/db.go`

- [ ] **Step 1: Write failing repository tests**

Create `repository/user_activity_test.go`:

```go
package repository

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestSaveUserActivityIsIdempotentPerUser(t *testing.T) {
	setupRepositoryTestDB(t)
	item := model.UserActivityLog{ID: "activity-1", UserID: "user-1", Category: model.ActivityCategoryProject, Action: model.ActivityActionProjectCreated, Result: model.ActivityResultSuccess, ClientEventID: "client-1", CreatedAt: "2026-07-24T10:00:00Z"}
	if _, err := SaveUserActivity(item); err != nil {
		t.Fatalf("first save: %v", err)
	}
	item.ID = "activity-2"
	saved, err := SaveUserActivity(item)
	if err != nil {
		t.Fatalf("second save: %v", err)
	}
	if saved.ID != "activity-1" {
		t.Fatalf("idempotent save returned %q", saved.ID)
	}
}

func TestListUserActivitiesScopesAndFilters(t *testing.T) {
	setupRepositoryTestDB(t)
	db, _ := DB()
	items := []model.UserActivityLog{
		{ID: "activity-ai", UserID: "user-a", Category: model.ActivityCategoryAI, Action: model.ActivityActionAISucceeded, Result: model.ActivityResultSuccess, IPAddress: "203.0.113.1", IPAllowed: false, CreatedAt: "2026-07-24T11:00:00Z"},
		{ID: "activity-project", UserID: "user-a", Category: model.ActivityCategoryProject, Action: model.ActivityActionProjectCreated, Result: model.ActivityResultSuccess, IPAddress: "10.0.0.1", IPAllowed: true, CreatedAt: "2026-07-24T10:00:00Z"},
		{ID: "activity-other", UserID: "user-b", Category: model.ActivityCategoryAI, Action: model.ActivityActionAISucceeded, Result: model.ActivityResultSuccess, IPAddress: "203.0.113.2", IPAllowed: false, CreatedAt: "2026-07-24T09:00:00Z"},
	}
	if err := db.Create(&items).Error; err != nil {
		t.Fatalf("create activities: %v", err)
	}
	logs, total, err := ListUserActivities(model.UserActivityQuery{ExactUserID: "user-a", Category: string(model.ActivityCategoryAI), OutsideIPOnly: true, Page: 1, PageSize: 10})
	if err != nil || total != 1 || len(logs) != 1 || logs[0].ID != "activity-ai" {
		t.Fatalf("logs=%#v total=%d err=%v", logs, total, err)
	}
}
```

- [ ] **Step 2: Run tests and verify RED**

```bash
go test ./repository -run 'TestSaveUserActivityIsIdempotentPerUser|TestListUserActivitiesScopesAndFilters' -count=1
```

Expected: FAIL because activity models and repository functions do not exist.

- [ ] **Step 3: Define controlled event enums and table model**

Create `model/user_activity.go` with these declarations:

```go
package model

type ActivityCategory string
type ActivityAction string
type ActivityResult string

const (
	ActivityCategoryAccount  ActivityCategory = "account"
	ActivityCategorySecurity ActivityCategory = "security"
	ActivityCategoryProject  ActivityCategory = "project"
	ActivityCategoryCanvas   ActivityCategory = "canvas"
	ActivityCategoryAsset    ActivityCategory = "asset"
	ActivityCategoryAI       ActivityCategory = "ai"
	ActivityCategoryTransfer ActivityCategory = "transfer"
	ActivityCategoryCredit   ActivityCategory = "credit"

	ActivityResultSuccess  ActivityResult = "success"
	ActivityResultFailed   ActivityResult = "failed"
	ActivityResultRejected ActivityResult = "rejected"

	ActivityActionLoginSucceeded ActivityAction = "login.succeeded"
	ActivityActionLoginFailed    ActivityAction = "login.failed"
	ActivityActionLogout         ActivityAction = "account.logout"
	ActivityActionProfileUpdated ActivityAction = "account.profile_updated"
	ActivityActionAdminCreated   ActivityAction = "security.admin_created"
	ActivityActionAdminUpdated   ActivityAction = "security.admin_updated"
	ActivityActionAdminPassword  ActivityAction = "security.admin_password_reset"
	ActivityActionAdminRole      ActivityAction = "security.admin_role_changed"
	ActivityActionAdminStatus    ActivityAction = "security.admin_status_changed"
	ActivityActionAdminDeleted   ActivityAction = "security.admin_deleted"
	ActivityActionApprovalCreated  ActivityAction = "security.login_approval_created"
	ActivityActionApprovalApproved ActivityAction = "security.login_approval_approved"
	ActivityActionApprovalRejected ActivityAction = "security.login_approval_rejected"
	ActivityActionApprovalExpired  ActivityAction = "security.login_approval_expired"
	ActivityActionApprovalBlocked  ActivityAction = "security.login_approval_blocked"
	ActivityActionProjectCreated ActivityAction = "project.created"
	ActivityActionProjectRenamed ActivityAction = "project.renamed"
	ActivityActionProjectDeleted ActivityAction = "project.deleted"
	ActivityActionCanvasCreated  ActivityAction = "canvas.created"
	ActivityActionCanvasRenamed  ActivityAction = "canvas.renamed"
	ActivityActionCanvasDeleted  ActivityAction = "canvas.deleted"
	ActivityActionAssetUploaded  ActivityAction = "asset.uploaded"
	ActivityActionAssetCreated   ActivityAction = "asset.created"
	ActivityActionAssetRenamed   ActivityAction = "asset.renamed"
	ActivityActionAssetDeleted   ActivityAction = "asset.deleted"
	ActivityActionAISubmitted    ActivityAction = "ai.submitted"
	ActivityActionAISucceeded    ActivityAction = "ai.succeeded"
	ActivityActionAIFailed       ActivityAction = "ai.failed"
	ActivityActionAICancelled    ActivityAction = "ai.cancelled"
	ActivityActionImportDone     ActivityAction = "transfer.import_completed"
	ActivityActionExportDone     ActivityAction = "transfer.export_completed"
	ActivityActionDownloadDone   ActivityAction = "transfer.download_completed"
	ActivityActionCreditConsumed ActivityAction = "credit.consumed"
	ActivityActionCreditRefunded ActivityAction = "credit.refunded"
	ActivityActionCreditAdjusted ActivityAction = "credit.adjusted"
)

type UserActivityLog struct {
	ID              string           `json:"id" gorm:"primaryKey"`
	UserID          string           `json:"userId" gorm:"index;uniqueIndex:idx_activity_client_event,priority:1"`
	User             UserSummary      `json:"user" gorm:"-"`
	Category         ActivityCategory `json:"category" gorm:"index"`
	Action           ActivityAction   `json:"action" gorm:"index"`
	Result           ActivityResult   `json:"result"`
	TargetType       string           `json:"targetType"`
	TargetID         string           `json:"targetId" gorm:"index"`
	TargetName       string           `json:"targetName"`
	Summary          string           `json:"summary"`
	IPAddress        string           `json:"ipAddress" gorm:"index"`
	IPAllowed        bool             `json:"ipAllowed" gorm:"index"`
	SessionID        string           `json:"sessionId" gorm:"index"`
	LoginApprovalID string           `json:"loginApprovalId"`
	UserAgent        string           `json:"userAgent"`
	ClientEventID    string           `json:"clientEventId" gorm:"uniqueIndex:idx_activity_client_event,priority:2"`
	Metadata         string           `json:"metadata" gorm:"type:text"`
	CreatedAt        string           `json:"createdAt" gorm:"index"`
}

type UserActivityQuery struct {
	Query
	ExactUserID  string
	Category     string
	Action       string
	Result       string
	IPAddress    string
	OutsideIPOnly bool
	StartAt      string
	EndAt        string
}

type UserActivityList struct {
	Items []UserActivityLog `json:"items"`
	Total int               `json:"total"`
}
```

Keep `ClientEventID` empty for server-owned events. Before save, generate an internal unique value `server:<activity-id>` so the composite unique index remains valid across SQL backends.

- [ ] **Step 4: Implement idempotent save and filtered pagination**

Create `repository/user_activity.go`. `SaveUserActivity` first queries by `user_id + client_event_id`; if found, return it. Otherwise call `Create`, and on a unique race query and return the winner. `ListUserActivities` starts from `db.Model(&model.UserActivityLog{})`, applies exact user/category/action/result/IP/date/outside-IP filters, keyword-matches action, target ID/name and summary, counts, then orders `created_at desc, id desc`.

Use this exact outside-IP clause:

```go
if q.OutsideIPOnly {
	tx = tx.Where("ip_allowed = ?", false)
}
```

Add `&model.UserActivityLog{}` to `repository/db.go` AutoMigrate.

- [ ] **Step 5: Run repository tests and verify GREEN**

```bash
go test ./repository -run 'TestSaveUserActivityIsIdempotentPerUser|TestListUserActivitiesScopesAndFilters' -count=1
```

Expected: PASS.

- [ ] **Step 6: Commit the activity persistence layer**

```bash
git add model/user_activity.go repository/user_activity.go repository/user_activity_test.go repository/db.go
git commit -m "feat: add user activity persistence"
```

### Task 2: Add trusted server context and the activity reporting API

**Files:**
- Create: `service/request_meta.go`
- Modify: `middleware/admin.go`
- Create: `service/user_activity.go`
- Create: `handler/user_activity.go`
- Modify: `router/router.go`
- Test: `service/user_activity_test.go`

- [ ] **Step 1: Write failing validation and identity tests**

Create `service/user_activity_test.go` with tests proving:

```go
func TestReportUserActivityUsesServerIdentityAndSanitizesPayload(t *testing.T) {
	setupAITaskTestDB(t)
	_, _ = saveAITaskTestUser("user-activity", 20)
	ctx := WithUser(context.Background(), model.AuthUser{ID: "user-activity", Username: "activity", Role: model.UserRoleUser})
	ctx = WithRequestMeta(ctx, RequestMeta{IPAddress: "203.0.113.8", UserAgent: strings.Repeat("x", 800), SessionID: "session-1"})
	item, err := ReportUserActivity(ctx, UserActivityReport{Action: string(model.ActivityActionProjectCreated), TargetType: "project", TargetID: "project-1", TargetName: strings.Repeat("项", 300), Summary: "创建项目", ClientEventID: "client-event-1", Metadata: map[string]any{"projectId": "project-1", "apiKey": "secret"}})
	if err != nil {
		t.Fatalf("ReportUserActivity: %v", err)
	}
	if item.UserID != "user-activity" || item.IPAddress != "203.0.113.8" || item.SessionID != "session-1" {
		t.Fatalf("server fields = %#v", item)
	}
	if strings.Contains(item.Metadata, "secret") || len([]rune(item.TargetName)) > 120 || len(item.UserAgent) > 512 {
		t.Fatalf("unsanitized item = %#v", item)
	}
}

func TestReportUserActivityRejectsHighFrequencyOrUnknownAction(t *testing.T) {
	ctx := WithUser(context.Background(), model.AuthUser{ID: "user-activity", Role: model.UserRoleUser})
	if _, err := ReportUserActivity(ctx, UserActivityReport{Action: "canvas.node_dragged", ClientEventID: "client-event-2"}); err == nil {
		t.Fatal("high-frequency action was accepted")
	}
}
```

- [ ] **Step 2: Run tests and verify RED**

```bash
go test ./service -run 'TestReportUserActivity' -count=1
```

Expected: FAIL because request metadata and report service do not exist.

- [ ] **Step 3: Add request metadata context**

Create `service/request_meta.go`:

```go
package service

import "context"

type requestMetaContextKey struct{}

type RequestMeta struct {
	IPAddress        string
	UserAgent        string
	SessionID        string
	LoginApprovalID string
	IPAllowed       bool
}

func WithRequestMeta(ctx context.Context, meta RequestMeta) context.Context {
	return context.WithValue(ctx, requestMetaContextKey{}, meta)
}

func RequestMetaFromContext(ctx context.Context) RequestMeta {
	meta, _ := ctx.Value(requestMetaContextKey{}).(RequestMeta)
	return meta
}
```

Add one Gin middleware in `middleware/admin.go`:

```go
func RequestMeta(c *gin.Context) {
	meta := service.RequestMeta{IPAddress: c.ClientIP(), UserAgent: c.Request.UserAgent(), IPAllowed: true}
	c.Request = c.Request.WithContext(service.WithRequestMeta(c.Request.Context(), meta))
	c.Next()
}
```

Install it once with `router.Use(middleware.RequestMeta)` before route groups.

- [ ] **Step 4: Implement activity report validation**

Create `service/user_activity.go` with:

```go
type UserActivityReport struct {
	Action        string         `json:"action"`
	TargetType    string         `json:"targetType"`
	TargetID      string         `json:"targetId"`
	TargetName    string         `json:"targetName"`
	Summary       string         `json:"summary"`
	ClientEventID string         `json:"clientEventId"`
	Metadata      map[string]any `json:"metadata"`
}
```

Define a map from every client-allowed action to category and allowed metadata keys. Include project/canvas/asset create/rename/delete and transfer import/export/download. Do not include login, AI, credit, drag, zoom, select, typing, or autosave events in the client map.

`ReportUserActivity` must:

1. require `UserFromContext` and a non-empty `clientEventId`;
2. look up the exact action in the client allowlist;
3. trim target type/ID to 120 runes, target name to 120, summary to 240, user-agent to 512;
4. copy only allowed metadata keys and marshal them;
5. derive `UserID`, IP, user-agent, session ID, approval ID, and IP status from context;
6. save with `Result=success` and `CreatedAt=now()`.

Add `RecordServerActivity(ctx, userID, action, result, targetType, targetID, targetName, summary, metadata)` for service-owned events. It uses request metadata when available and never accepts a client event ID. When no request IP exists, store an empty IP and `IPAllowed=true` so background workers are not misclassified as outside-IP activity.

- [ ] **Step 5: Add thin user and admin handlers**

Create `handler/user_activity.go`:

```go
func UserActivityReport(w http.ResponseWriter, r *http.Request) {
	var request service.UserActivityReport
	_ = json.NewDecoder(r.Body).Decode(&request)
	item, err := service.ReportUserActivity(r.Context(), request)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, item)
}

func AdminUserActivities(w http.ResponseWriter, r *http.Request, id string) {
	result, err := service.ListAdminUserActivities(id, parseUserActivityQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}
```

Add `POST /api/v1/activity-logs` under `UserAuth` and `GET /api/admin/users/:id/activity-logs` under `AdminAuth`. Add `parseUserActivityQuery` for keyword/category/action/result/IP/outsideIP/start/end/page/pageSize.

- [ ] **Step 6: Hydrate current usernames in admin activity results**

Implement `ListAdminUserActivities` in `service/user_activity.go`: set `ExactUserID`, query the repository, batch-load current user summaries with `ListUserSummariesByIDs`, attach them, and return `model.UserActivityList`.

- [ ] **Step 7: Run service and router tests**

```bash
go test ./service ./handler ./router -run 'TestReportUserActivity|TestAdminUserDetailRoutes' -count=1
```

Expected: PASS.

- [ ] **Step 8: Commit the reporting boundary**

```bash
git add service/request_meta.go service/user_activity.go service/user_activity_test.go middleware/admin.go handler/user_activity.go router/router.go
git commit -m "feat: add controlled user activity reporting"
```

### Task 3: Record server-owned AI, credit, and account events

**Files:**
- Modify: `service/ai_task.go`
- Modify: `service/auth.go`
- Modify: `handler/ai.go`
- Modify: `handler/auth.go`
- Test: `service/ai_task_test.go`
- Test: `service/user_activity_test.go`

- [ ] **Step 1: Write failing event-recording tests**

Add assertions after existing AI create/success/failure and credit consume/refund tests:

```go
logs, total, err := repository.ListUserActivities(model.UserActivityQuery{ExactUserID: task.UserID, Category: string(model.ActivityCategoryAI), Page: 1, PageSize: 20})
if err != nil || total != 2 {
	t.Fatalf("AI activity logs=%#v total=%d err=%v", logs, total, err)
}
if logs[0].TargetID != task.ID || logs[0].Action != model.ActivityActionAISucceeded {
	t.Fatalf("latest AI activity = %#v", logs[0])
}
```

Add a credit test that expects one `credit.consumed` event referencing the credit-log related task ID.

- [ ] **Step 2: Run tests and verify RED**

```bash
go test ./service -run 'TestAITaskSuccessStoresSanitizedResponse|TestAITaskFailureRefundUsesTaskRelatedID' -count=1
```

Expected: FAIL because server activity events are not recorded.

- [ ] **Step 3: Thread request context into AI task creation**

Add `Context context.Context` to `CreateAITaskInput` and populate it from `r.Context()` at every handler call site. In `CreateAITask`, record `ai.submitted` after the task save succeeds. Use task kind/model/path in metadata, never request JSON.

Change `MarkAITaskSucceeded` and `MarkAITaskFailed` to accept `context.Context`; update handler call sites to pass the request context, and worker call sites to pass `context.Background()`. Record the terminal event only after the task state save succeeds. Record cancellation at the service that successfully changes a task or agent run to cancelled, using the same target task/run ID.

- [ ] **Step 4: Record credit and account events at successful service boundaries**

After `SaveCreditLog` succeeds in consume, refund, and admin adjustment flows, record the matching credit activity with target type `credit_log` and target ID equal to the saved log ID. Pass request context from HTTP-controlled callers; background workers may use `context.Background()`.

Record `login.succeeded`, `login.failed`, and `account.profile_updated` in the auth service. Record administrator create/update/password-reset/role/status/delete events in `service/admin_account.go` with category `security`, actor from context, and target administrator ID; never include the submitted password. The IP approval plan will later route approved logins through the same login-success helper. Failed login for an unknown account uses empty user ID and metadata containing only a truncated attempted username.

- [ ] **Step 5: Run focused tests and verify GREEN**

```bash
go test ./service -run 'TestAITask|TestReportUserActivity|Test.*Credits' -count=1
```

Expected: PASS with AI/credit/account events created once.

- [ ] **Step 6: Commit server-owned events**

```bash
git add service/ai_task.go service/auth.go service/ai_task_test.go service/user_activity_test.go handler/ai.go handler/auth.go
git commit -m "feat: audit server-owned user operations"
```

### Task 4: Show activity records in the admin user detail page

**Files:**
- Modify: `web/src/services/api/admin.ts`
- Modify: `web/src/app/(admin)/admin/users/[id]/use-admin-user-detail.ts`
- Modify: `web/src/app/(admin)/admin/users/[id]/page.tsx`
- Create: `web/src/app/(admin)/admin/users/[id]/admin-user-activity-view.ts`
- Test: `web/src/app/(admin)/admin/users/[id]/admin-user-activity-view.test.mts`

- [ ] **Step 1: Write a failing label/risk test**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { activityActionLabel, activityRiskLabel } from "./admin-user-activity-view.ts";

test("labels controlled activity actions", () => {
    assert.equal(activityActionLabel("ai.succeeded"), "AI 任务成功");
    assert.equal(activityActionLabel("project.deleted"), "删除项目");
});

test("marks outside-IP activity", () => {
    assert.deepEqual(activityRiskLabel({ ipAddress: "203.0.113.8", ipAllowed: false }), { text: "非白名单 IP", color: "error" });
});
```

- [ ] **Step 2: Run the test and verify RED**

```bash
cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/users/[id]/admin-user-activity-view.test.mts'
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Add activity API types and query**

Add `AdminUserActivity`, `AdminUserActivityQuery`, and `AdminUserActivityListResponse` to `admin.ts`, then add:

```ts
export function fetchAdminUserActivities(token: string, id: string, query: AdminUserActivityQuery) {
    return apiGet<AdminUserActivityListResponse>(`/api/admin/users/${encodeURIComponent(id)}/activity-logs`, compactApiParams(query), token);
}
```

Add a React Query call under key `["admin", "user", userId, "activity-logs", token, activityQuery]`.

- [ ] **Step 4: Implement labels and the operation table**

Create `admin-user-activity-view.ts` with complete Chinese label maps for every enum from `model/user_activity.go`, plus `activityRiskLabel` returning `null` when IP is empty or allowed and `{ text: "非白名单 IP", color: "error" }` otherwise.

Replace the placeholder tab with a ProTable showing time, operation, target, result, IP, device, summary, and risk. Add category, result, outside-IP-only, date, and keyword filters. Keep its pagination independent from AI and credit tabs.

- [ ] **Step 5: Run tests and typecheck**

```bash
cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/users/[id]/admin-user-activity-view.test.mts' && npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit the activity admin UI**

```bash
git add web/src/services/api/admin.ts web/src/app/'(admin)'/admin/users/'[id]'
git commit -m "feat: show user activity in admin detail"
```

### Task 5: Report completed browser-local business actions

**Files:**
- Create: `web/src/services/api/activity.ts`
- Create: `web/src/hooks/activity-audit.ts`
- Create: `web/src/hooks/activity-audit.test.mts`
- Create: `web/src/hooks/use-activity-audit.ts`
- Modify: `web/src/app/(user)/projects/page.tsx`
- Modify: `web/src/app/(user)/projects/[id]/page.tsx`
- Modify: `web/src/app/(user)/assets/use-asset-editor-actions.ts`
- Modify: `web/src/app/(user)/assets/use-asset-bulk-actions.ts`
- Modify: `web/src/app/(user)/assets/use-asset-import-dropzone.ts`
- Modify: `web/src/app/(user)/assets/use-asset-media-actions.ts`
- Modify: `web/src/components/layout/user-status-actions.tsx`
- Modify only at successful export call sites found by `rg -n "saveAs|download|export" web/src/app/(user)`: the focused action hook owning the completed operation.

- [ ] **Step 1: Write failing client payload tests**

Create `activity-audit.test.mts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { activityReportPayload } from "./activity-audit.ts";

test("builds a controlled business event", () => {
    const payload = activityReportPayload("project.created", { targetType: "project", targetId: "project-1", targetName: "新项目", summary: "创建项目", metadata: { projectId: "project-1" } }, "event-1");
    assert.deepEqual(payload, { action: "project.created", targetType: "project", targetId: "project-1", targetName: "新项目", summary: "创建项目", metadata: { projectId: "project-1" }, clientEventId: "event-1" });
});

test("does not expose high-frequency action names", () => {
    assert.throws(() => activityReportPayload("canvas.node_dragged" as never, {}, "event-2"));
});
```

- [ ] **Step 2: Run the test and verify RED**

```bash
cd web && node --experimental-strip-types --test src/hooks/activity-audit.test.mts
```

Expected: FAIL because the reporter does not exist.

- [ ] **Step 3: Implement the typed reporter and global hook**

Define `ClientActivityAction` as the exact client allowlist. `activityReportPayload` throws for a runtime action outside the same list and returns the shaped payload. `reportActivity(token, payload)` posts to `/api/v1/activity-logs`.

`useActivityAudit` reads the current token directly from `useUserStore`, exposes `report(action, input)`, creates `crypto.randomUUID()`, and catches request errors without showing a toast or failing the completed business action.

- [ ] **Step 4: Instrument only completed actions**

Call `report` after the state/store operation succeeds:

- projects page: create, rename, delete;
- project detail: create/rename/delete canvas;
- asset editor: create or rename;
- asset bulk actions: delete;
- import dropzone: one `transfer.import_completed` event per completed import batch, not per progress update;
- media actions: completed download;
- existing export hooks: completed export.
- account menu: call `account.logout` with the current token immediately before clearing the local session.

Do not instrument store hydration, autosave, node CRUD, drag, zoom, selection, typing, polling, or generation progress. AI tasks are already recorded by the backend.

- [ ] **Step 5: Run reporter tests and typecheck**

```bash
cd web && node --experimental-strip-types --test src/hooks/activity-audit.test.mts && npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit browser-local audit events**

```bash
git add web/src/services/api/activity.ts web/src/hooks/activity-audit.ts web/src/hooks/activity-audit.test.mts web/src/hooks/use-activity-audit.ts web/src/app/'(user)'/projects web/src/app/'(user)'/assets
git commit -m "feat: report local user business activities"
```

### Task 6: Document and verify activity auditing

**Files:**
- Modify: `docs/backend-database.md`
- Modify: `docs/pending-test.md`
- Modify only if needed: `docs/todo.md`

- [ ] **Step 1: Document `user_activity_logs`**

Add the table and every persisted field to `docs/backend-database.md`. State that project/canvas/asset records are audit events reported by the browser and are not cloud copies of local business data.

- [ ] **Step 2: Record manual test cases**

Add pending-test coverage for operation filtering, current username hydration, IP/device display, one-shot reporting, and confirmation that drag/zoom/autosave do not produce events.

- [ ] **Step 3: Run fresh verification**

```bash
go test ./repository ./service ./handler ./router -count=1
cd web && npm test && npm run typecheck
cd .. && git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 4: Commit docs**

```bash
git add docs/backend-database.md docs/pending-test.md docs/todo.md
git commit -m "docs: record user activity audit"
```
