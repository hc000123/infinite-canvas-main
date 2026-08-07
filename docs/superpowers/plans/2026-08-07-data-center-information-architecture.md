# Data Center Information Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build a unified /data-center for self-service and administrator usage analytics while moving technical task controls into an administrator-only “任务运维” page.

**Architecture:** Treat credit logs as the authoritative billing ledger, pair consumes and refunds into read-only usage records, then enrich those records from AI tasks or Agent Runs. Expose self-scoped and administrator-scoped read APIs over the same service model; render one role-aware user page, while preserving existing administrator task and credit mutations in their own route.

**Tech Stack:** Go, Gin, GORM, SQLite-compatible queries, Next.js App Router, React 19, TypeScript, Ant Design 6, TanStack Query, Zustand, Node test runner.

---

## File map

Backend:

- Modify model/ai_usage.go: ledger rows, usage records, filters, kind summaries, self summary, and paginated responses.
- Modify repository/ai_usage.go: central consume/refund pairing with optional user scope.
- Modify repository/ai_task.go and repository/agent_run.go: batch reads by related ID.
- Modify service/ai_usage.go and create service/ai_usage_records_test.go: enrichment, filtering, paging, self scoping, and summary kinds.
- Create handler/ai_usage.go; modify handler/admin.go, router/router.go, and router/router_test.go: authenticated and administrator endpoints.

Frontend:

- Create web/src/services/api/usage.ts and modify web/src/stores/use-user-store.ts.
- Create web/src/app/(user)/data-center with a hook, pure view rules, three focused components, page, and tests.
- Create testable account-menu descriptors, then minimally modify web/src/components/layout/user-status-actions.tsx without overwriting its existing uncommitted text-variant changes.
- Split analytics from web/src/app/(admin)/admin/ai-tasks/page.tsx and rename the administrator menu to “任务运维”.
- Delete the now-unused administrator-only analytics component and hook after the unified data-center page owns those reads.

Documentation:

- Update docs/pending-test.md and CHANGELOG.md.
- Inspect docs/todo.md and only move an existing matching item; do not create a new project/episode promise.

## Task 1: Build the authoritative usage-record read model

**Files:**

- Modify: model/ai_usage.go
- Modify: repository/ai_usage.go
- Modify: repository/ai_task.go
- Modify: repository/agent_run.go
- Create: service/ai_usage_records_test.go
- Modify: service/ai_usage.go

- [ ] **Step 1: Write the failing paired-record test**

Create service/ai_usage_records_test.go in package service. Reuse setupAITaskTestDB(t). Seed one AI task with a partial refund, one Agent Run, one unknown related ID, and a second user's consumption.

~~~go
func TestListAIUsageRecordsPairsRefundsAndEnrichesSources(t *testing.T) {
    setupAITaskTestDB(t)
    seedUsageUser(t, "usage-user-1", "alice", 90)
    seedUsageUser(t, "usage-user-2", "bob", 70)
    seedUsageTask(t, model.AITask{
        ID: "task-1", UserID: "usage-user-1", Kind: "image",
        Model: "image-model", Provider: "cloud",
        Status: model.AITaskStatusSucceeded, Credits: 8,
        CreatedAt: "2026-08-07T01:00:00Z",
    })
    seedUsageAgentRun(t, model.AgentRun{
        ID: "agent-1", UserID: "usage-user-1", AgentKind: "director",
        Model: "agent-model", Provider: "cloud",
        Status: model.AgentRunStatusApplied, Credits: 5,
        CreatedAt: "2026-08-07T02:00:00Z",
    })
    seedUsageLog(t, model.CreditLog{ID: "consume-task", UserID: "usage-user-1", Type: model.CreditLogTypeAIConsume, Amount: -8, RelatedID: "task-1", CreatedAt: "2026-08-07T01:00:00Z"})
    seedUsageLog(t, model.CreditLog{ID: "refund-task", UserID: "usage-user-1", Type: model.CreditLogTypeAIRefund, Amount: 3, RelatedID: "task-1", CreatedAt: "2026-08-07T03:00:00Z"})
    seedUsageLog(t, model.CreditLog{ID: "consume-agent", UserID: "usage-user-1", Type: model.CreditLogTypeAIConsume, Amount: -5, RelatedID: "agent-1", CreatedAt: "2026-08-07T02:00:00Z"})
    seedUsageLog(t, model.CreditLog{ID: "consume-unknown", UserID: "usage-user-1", Type: model.CreditLogTypeAIConsume, Amount: -2, RelatedID: "missing-1", CreatedAt: "2026-08-07T04:00:00Z"})
    seedUsageLog(t, model.CreditLog{ID: "consume-foreign", UserID: "usage-user-2", Type: model.CreditLogTypeAIConsume, Amount: -30, RelatedID: "foreign-1", CreatedAt: "2026-08-07T05:00:00Z"})

    result, err := ListAIUsageRecords(model.AIUsageRecordQuery{
        ExactUserID: "usage-user-1",
        StartAt: "2026-08-07T00:00:00Z",
        EndAt: "2026-08-08T00:00:00Z",
        Page: 1,
        PageSize: 20,
    })
    if err != nil {
        t.Fatal(err)
    }
    if result.Total != 3 || len(result.Items) != 3 {
        t.Fatalf("result = %#v", result)
    }
    byID := usageRecordsByRelatedID(result.Items)
    if byID["task-1"].SourceType != model.AIUsageSourceAITask || byID["task-1"].NetCredits != 5 || byID["task-1"].Kind != "image" {
        t.Fatalf("task record = %#v", byID["task-1"])
    }
    if byID["agent-1"].SourceType != model.AIUsageSourceAgentRun || byID["agent-1"].Kind != "agent" {
        t.Fatalf("agent record = %#v", byID["agent-1"])
    }
    if byID["missing-1"].SourceType != model.AIUsageSourceUnknown || byID["missing-1"].Kind != "other" {
        t.Fatalf("unknown record = %#v", byID["missing-1"])
    }
}
~~~

Define the referenced helpers in the same test file so every seeded row is explicit and errors fail the test immediately:

~~~go
func seedUsageUser(t *testing.T, id, username string, credits int) {
    t.Helper()
    stamp := "2026-08-07T00:00:00Z"
    _, err := repository.SaveUser(model.User{ID: id, Username: username, DisplayName: username, Role: model.UserRoleUser, Status: model.UserStatusActive, Credits: credits, AffCode: strings.ToUpper(id), CreatedAt: stamp, UpdatedAt: stamp})
    if err != nil {
        t.Fatal(err)
    }
}

func seedUsageTask(t *testing.T, item model.AITask) {
    t.Helper()
    if _, err := repository.SaveAITask(item); err != nil {
        t.Fatal(err)
    }
}

func seedUsageAgentRun(t *testing.T, item model.AgentRun) {
    t.Helper()
    if _, err := repository.SaveAgentRun(item); err != nil {
        t.Fatal(err)
    }
}

func seedUsageLog(t *testing.T, item model.CreditLog) {
    t.Helper()
    if _, err := repository.SaveCreditLog(item); err != nil {
        t.Fatal(err)
    }
}

func usageRecordsByRelatedID(items []model.AIUsageRecord) map[string]model.AIUsageRecord {
    result := make(map[string]model.AIUsageRecord, len(items))
    for _, item := range items {
        result[item.RelatedID] = item
    }
    return result
}
~~~

- [ ] **Step 2: Run the test and verify RED**

~~~bash
go test ./service -run TestListAIUsageRecordsPairsRefundsAndEnrichesSources -count=1
~~~

Expected: FAIL because AIUsageRecordQuery, source constants, and ListAIUsageRecords do not exist.

- [ ] **Step 3: Define the concrete model contract**

Add these types to model/ai_usage.go, with JSON tags matching the design spec.

~~~go
type AIUsageSource string

const (
    AIUsageSourceAITask AIUsageSource = "ai_task"
    AIUsageSourceAgentRun AIUsageSource = "agent_run"
    AIUsageSourceUnknown AIUsageSource = "unknown"
)

type AIUsageLedgerRow struct {
    UserID string
    UsageKey string
    ConsumedAt string
    ConsumedCredits int
    RefundedCredits int
}

type AIUsageRecordQuery struct {
    ExactUserID string
    User string
    Period AIUsagePeriod
    Kind string
    Model string
    Status string
    StartAt string
    EndAt string
    Page int
    PageSize int
}

type AIUsageRecord struct {
    ID string
    RelatedID string
    UserID string
    User UserSummary
    SourceType AIUsageSource
    Kind string
    Model string
    Status string
    Credits int
    CreditsRefunded int
    NetCredits int
    Provider string
    UpstreamTaskID string
    ErrorMessage string
    CreatedAt string
    FrontendTrace AITaskFrontendTrace
}

type AIUsageRecordList struct {
    Items []AIUsageRecord
    Total int
    Page int
    PageSize int
}
~~~

Implement Normalize and Offset with the same page bounds as AIUsageQuery.

- [ ] **Step 4: Centralize ledger pairing**

Refactor repository/ai_usage.go around:

~~~go
func ListAIUsageLedger(startAt, endAt, userID string) ([]model.AIUsageLedgerRow, error)
~~~

The function must group consumption by user and stable usage key, optionally restrict both consumption and refund queries by user, select consumes whose first consumption time is inside the range, attach all later refunds, and retain fully refunded rows. Keep ListAIUsage as a compatibility wrapper that maps positive-net ledger rows to AIUsageRow.

Add batch readers:

~~~go
func ListAITasksByIDs(ids []string) (map[string]model.AITask, error)
func ListAgentRunsByIDs(ids []string) (map[string]model.AgentRun, error)
~~~

Each returns an empty map for empty input and performs one WHERE id IN query.

- [ ] **Step 5: Implement enrichment, filters, sorting, and paging**

Implement:

~~~go
func ListAIUsageRecords(q model.AIUsageRecordQuery) (model.AIUsageRecordList, error)
~~~

Use explicit StartAt and EndAt when both exist; otherwise resolve Period in Asia/Shanghai. Prefer AI task enrichment, then Agent Run, then defaults:

~~~go
record.SourceType = model.AIUsageSourceUnknown
record.Kind = "other"
record.Status = "unknown"
record.NetCredits = max(record.Credits-record.CreditsRefunded, 0)
~~~

Map Agent Runs to kind agent. Apply Kind, Model, Status, and fuzzy User filters after enrichment, sort CreatedAt descending, page after filtering, and load user summaries only for the returned page.

- [ ] **Step 6: Run the targeted test and verify GREEN**

~~~bash
go test ./service -run TestListAIUsageRecordsPairsRefundsAndEnrichesSources -count=1
~~~

Expected: PASS.

- [ ] **Step 7: Commit the read model**

~~~bash
git add model/ai_usage.go repository/ai_usage.go repository/ai_task.go repository/agent_run.go service/ai_usage.go service/ai_usage_records_test.go
git commit -m "feat: add unified AI usage records"
~~~

## Task 2: Add self-scoped summaries and prove privacy

**Files:**

- Modify: model/ai_usage.go
- Modify: service/ai_usage_records_test.go
- Modify: service/ai_usage.go

- [ ] **Step 1: Write the failing isolation and kind-total test**

~~~go
func TestGetUserAIUsageSummaryIsScopedAndKindsMatchNetTotal(t *testing.T) {
    setupAITaskTestDB(t)
    seedUsageUser(t, "usage-user-1", "alice", 90)
    seedUsageUser(t, "usage-user-2", "bob", 70)
    seedUsageTaskAndConsume(t, "usage-user-1", "task-image", "image", 6, "2026-08-07T01:00:00Z")
    seedUsageAgentAndConsume(t, "usage-user-1", "agent-director", 4, "2026-08-07T02:00:00Z")
    seedUsageTaskAndConsume(t, "usage-user-2", "task-foreign", "video", 30, "2026-08-07T03:00:00Z")

    result, err := getUserAIUsageSummaryAt(
        "usage-user-1",
        model.AIUsageQuery{Period: model.AIUsagePeriodDay},
        time.Date(2026, 8, 7, 12, 0, 0, 0, time.FixedZone("CST", 8*60*60)),
    )
    if err != nil {
        t.Fatal(err)
    }
    if result.Balance != 90 || result.SelectedPeriod != model.AIUsagePeriodDay {
        t.Fatalf("summary = %#v", result)
    }
    if got := sumUsageKinds(result.Kinds); got != 10 {
        t.Fatalf("kind total = %d, want 10", got)
    }

    records, err := ListUserAIUsageRecords("usage-user-1", model.AIUsageRecordQuery{Page: 1, PageSize: 20})
    if err != nil {
        t.Fatal(err)
    }
    for _, item := range records.Items {
        if item.UserID != "usage-user-1" {
            t.Fatalf("foreign record leaked: %#v", item)
        }
    }
}
~~~

Add the convenience seeders used by this test. Each one writes the source row and its matching consumption row; sumUsageKinds returns the sum of NetCredits.

~~~go
func seedUsageTaskAndConsume(t *testing.T, userID, id, kind string, credits int, createdAt string) {
    t.Helper()
    seedUsageTask(t, model.AITask{ID: id, UserID: userID, Kind: kind, Model: kind + "-model", Provider: "cloud", Status: model.AITaskStatusSucceeded, Credits: credits, CreatedAt: createdAt})
    seedUsageLog(t, model.CreditLog{ID: "consume-" + id, UserID: userID, Type: model.CreditLogTypeAIConsume, Amount: -credits, RelatedID: id, CreatedAt: createdAt})
}

func seedUsageAgentAndConsume(t *testing.T, userID, id string, credits int, createdAt string) {
    t.Helper()
    seedUsageAgentRun(t, model.AgentRun{ID: id, UserID: userID, AgentKind: "director", Model: "agent-model", Provider: "cloud", Status: model.AgentRunStatusApplied, Credits: credits, CreatedAt: createdAt})
    seedUsageLog(t, model.CreditLog{ID: "consume-" + id, UserID: userID, Type: model.CreditLogTypeAIConsume, Amount: -credits, RelatedID: id, CreatedAt: createdAt})
}

func sumUsageKinds(items []model.AIUsageKindSummary) int {
    total := 0
    for _, item := range items {
        total += item.NetCredits
    }
    return total
}
~~~

- [ ] **Step 2: Run and verify RED**

~~~bash
go test ./service -run TestGetUserAIUsageSummaryIsScopedAndKindsMatchNetTotal -count=1
~~~

Expected: FAIL because the self summary and wrapper do not exist.

- [ ] **Step 3: Add self summary types**

~~~go
type AIUsageKindSummary struct {
    Kind string
    NetCredits int
    UsageCount int
    Ratio float64
}

type UserAIUsageSummary struct {
    Balance int
    Periods []AIUsagePeriodSummary
    SelectedPeriod AIUsagePeriod
    Kinds []AIUsageKindSummary
}
~~~

Add JSON tags matching the design response.

- [ ] **Step 4: Implement self-scoped services**

~~~go
func GetUserAIUsageSummary(userID string, q model.AIUsageQuery) (model.UserAIUsageSummary, error)
func ListUserAIUsageRecords(userID string, q model.AIUsageRecordQuery) (model.AIUsageRecordList, error)
~~~

ListUserAIUsageRecords must overwrite ExactUserID with the authenticated user ID. GetUserAIUsageSummary must load current balance, compute day/week/month using the user-scoped ledger, and build selected-period kind summaries from unpaged enriched records. Omit zero-net kinds and sort by net credits descending.

- [ ] **Step 5: Run and verify GREEN**

~~~bash
go test ./service -run 'Test(GetUserAIUsageSummaryIsScopedAndKindsMatchNetTotal|ListAIUsageRecordsPairsRefundsAndEnrichesSources)' -count=1
~~~

Expected: PASS.

- [ ] **Step 6: Commit**

~~~bash
git add model/ai_usage.go service/ai_usage.go service/ai_usage_records_test.go
git commit -m "feat: add self scoped AI usage summaries"
~~~

## Task 3: Expose authenticated and administrator read APIs

**Files:**

- Create: handler/ai_usage.go
- Modify: handler/admin.go
- Modify: router/router.go
- Modify: router/router_test.go

- [ ] **Step 1: Write the failing route test**

Extend router/router_test.go:

~~~go
func TestAIUsageRoutesRequireCorrectRoles(t *testing.T) {
    engine := New()
    for _, path := range []string{
        "/api/me/ai-usage-summary",
        "/api/me/ai-usage-records",
        "/api/admin/ai-usage-records",
    } {
        request := httptest.NewRequest(http.MethodGet, path, nil)
        response := httptest.NewRecorder()
        engine.ServeHTTP(response, request)
        if !strings.Contains(response.Body.String(), "未登录或权限不足") {
            t.Fatalf("%s body = %s", path, response.Body.String())
        }
    }
}
~~~

Rely on middleware/admin_test.go::TestAdminAndSuperAdminMiddlewareUseRoleHierarchy for the already-covered ordinary-user rejection of every route registered under the admin group; do not duplicate token setup in the router test.

- [ ] **Step 2: Run and verify RED**

~~~bash
go test ./router -run TestAIUsageRoutesRequireCorrectRoles -count=1
~~~

Expected: FAIL because the routes are missing.

- [ ] **Step 3: Add handlers and query parsing**

Create handler/ai_usage.go with:

~~~go
func UserAIUsageSummary(w http.ResponseWriter, r *http.Request)
func UserAIUsageRecords(w http.ResponseWriter, r *http.Request)
func parseAIUsageRecordQuery(r *http.Request) model.AIUsageRecordQuery
func aiUsageUser(w http.ResponseWriter, r *http.Request) (model.AuthUser, bool)
~~~

The self handlers obtain identity only from service.UserFromContext. The parser reads period, kind, model, status, startAt, endAt, page, and pageSize, but no self-route user field.

Add to handler/admin.go:

~~~go
func AdminAIUsageRecords(w http.ResponseWriter, r *http.Request) {
    query := parseAIUsageRecordQuery(r)
    query.User = r.URL.Query().Get("user")
    result, err := service.ListAIUsageRecords(query)
    if err != nil {
        FailError(w, err)
        return
    }
    OK(w, result)
}
~~~

- [ ] **Step 4: Register exact routes**

~~~go
me := api.Group("/me", middleware.UserAuth)
me.GET("/ai-usage-summary", gin.WrapF(handler.UserAIUsageSummary))
me.GET("/ai-usage-records", gin.WrapF(handler.UserAIUsageRecords))

admin.GET("/ai-usage-records", gin.WrapF(handler.AdminAIUsageRecords))
~~~

- [ ] **Step 5: Run router and service tests**

~~~bash
go test ./router ./service -run 'TestAIUsageRoutesRequireCorrectRoles|TestGetUserAIUsageSummaryIsScopedAndKindsMatchNetTotal|TestListAIUsageRecordsPairsRefundsAndEnrichesSources' -count=1
~~~

Expected: PASS.

- [ ] **Step 6: Commit**

~~~bash
git add handler/ai_usage.go handler/admin.go router/router.go router/router_test.go
git commit -m "feat: expose data center usage APIs"
~~~

## Task 4: Add frontend contracts and pure view rules

**Files:**

- Create: web/src/services/api/usage.ts
- Create: web/src/app/(user)/data-center/data-center-view.ts
- Create: web/src/app/(user)/data-center/data-center-view.test.mts
- Modify: web/src/stores/use-user-store.ts

- [ ] **Step 1: Write the failing view test**

~~~ts
import assert from "node:assert/strict";
import test from "node:test";

import {
    dataCenterDefaultScope,
    dataCenterRecordColumnKeys,
    dataCenterScopeOptions,
} from "./data-center-view.ts";

test("ordinary users are fixed to their own usage", () => {
    assert.equal(dataCenterDefaultScope("user"), "mine");
    assert.deepEqual(dataCenterScopeOptions("user"), []);
});

test("administrators default to all users and can switch scope", () => {
    assert.equal(dataCenterDefaultScope("admin"), "all");
    assert.deepEqual(dataCenterScopeOptions("superadmin").map((item) => item.value), ["all", "mine"]);
});

test("default record columns stay business focused", () => {
    assert.deepEqual(dataCenterRecordColumnKeys("mine"), ["createdAt", "kind", "model", "netCredits", "creditsRefunded", "status"]);
    assert.deepEqual(dataCenterRecordColumnKeys("all"), ["createdAt", "user", "kind", "model", "netCredits", "creditsRefunded", "status"]);
    for (const key of ["provider", "upstreamTaskId", "errorMessage", "actions"]) {
        assert.equal(dataCenterRecordColumnKeys("all").includes(key), false);
    }
});
~~~

- [ ] **Step 2: Run and verify RED**

~~~bash
cd web && node --experimental-strip-types --test 'src/app/(user)/data-center/data-center-view.test.mts'
~~~

Expected: FAIL because data-center-view.ts is missing.

- [ ] **Step 3: Implement shared API contracts**

Create web/src/services/api/usage.ts with TypeScript equivalents of the Go responses and:

~~~ts
export function fetchMyAIUsageSummary(token: string, period: AIUsagePeriod) {
    return apiGet<UserAIUsageSummary>("/api/me/ai-usage-summary", { period }, token);
}

export function fetchMyAIUsageRecords(token: string, query: AIUsageRecordQuery) {
    return apiGet<AIUsageRecordList>("/api/me/ai-usage-records", compactApiParams(query), token);
}

export function fetchAdminAIUsageRecords(token: string, query: AIUsageRecordQuery) {
    return apiGet<AIUsageRecordList>("/api/admin/ai-usage-records", compactApiParams(query), token);
}
~~~

Define AIUsageRecordQuery, AIUsageRecord, AIUsageRecordList, AIUsageKindSummary, and UserAIUsageSummary in usage.ts. Import AdminUserSummary and AdminAITaskFrontendTrace from admin.ts with import type; admin.ts does not import usage.ts, so this remains acyclic and existing admin imports remain unchanged.

- [ ] **Step 4: Implement pure rules and balance update**

Implement the tested scope and column functions, Chinese kind/status labels, section titles, an empty detail-action list, and a period-to-range helper using dayjs.

Add to UserStore:

~~~ts
updateCredits: (credits: number) => void;
~~~

Implement:

~~~ts
updateCredits: (credits) => set((state) => ({
    user: state.user ? { ...state.user, credits } : null,
})),
~~~

- [ ] **Step 5: Run and verify GREEN**

~~~bash
cd web && node --experimental-strip-types --test 'src/app/(user)/data-center/data-center-view.test.mts'
~~~

Expected: PASS.

- [ ] **Step 6: Commit**

~~~bash
git add web/src/services/api/usage.ts web/src/stores/use-user-store.ts 'web/src/app/(user)/data-center/data-center-view.ts' 'web/src/app/(user)/data-center/data-center-view.test.mts'
git commit -m "feat: add data center client contracts"
~~~

## Task 5: Build the role-aware data-center page

**Files:**

- Create: web/src/app/(user)/data-center/use-data-center.ts
- Create: web/src/app/(user)/data-center/components/data-center-overview.tsx
- Create: web/src/app/(user)/data-center/components/data-center-distribution.tsx
- Create: web/src/app/(user)/data-center/components/data-center-records.tsx
- Create: web/src/app/(user)/data-center/page.tsx
- Modify: web/src/app/(user)/data-center/data-center-view.test.mts

- [ ] **Step 1: Extend the failing view test**

~~~ts
import { dataCenterDetailActions, dataCenterSectionTitles } from "./data-center-view.ts";

test("data center separates overview, distribution, and records", () => {
    assert.deepEqual(dataCenterSectionTitles, ["使用概览", "使用分布", "消费明细"]);
    assert.deepEqual(dataCenterDetailActions, []);
});
~~~

- [ ] **Step 2: Run and verify RED**

~~~bash
cd web && node --experimental-strip-types --test 'src/app/(user)/data-center/data-center-view.test.mts'
~~~

Expected: FAIL because the new constants are missing.

- [ ] **Step 3: Implement use-data-center.ts**

The hook must derive initial scope from the role, use separate TanStack queries for summary and records, call self APIs for mine and administrator APIs for all, preserve period but reset filters/page when scope changes, reset page when period or a filter changes, synchronize self balance through updateCredits, expose independent error/refetch states, and expose no mutation methods.

Use one record filter state:

~~~ts
type DataCenterRecordFilters = {
    user: string;
    kind: string;
    model: string;
    status: string;
    startAt: string;
    endAt: string;
    page: number;
    pageSize: number;
};
~~~

- [ ] **Step 4: Implement the three focused components**

DataCenterOverview renders the current balance and three clickable period cards with theme tokens.

DataCenterDistribution renders kind progress rows for mine and the existing user/net credits/count/ratio ranking for all. Use Ant Design Empty for zero use.

DataCenterRecords renders user filtering only for all; kind, model, status, and time filters for both; only the tested default columns; and a read-only drawer containing provider, related ID, upstream task ID, error, and frontend trace. It must not render refresh, refund, create, edit, or delete controls.

DataCenterOverview must show a scoped Alert with a retry action when the summary query fails. DataCenterRecords must show its own Alert/retry without hiding a successfully loaded overview. Both distribution modes use Empty when the selected period has no rows.

- [ ] **Step 5: Assemble page.tsx**

Make page.tsx a client assembly layer. Render a scrollable studio-themed main, compact “数据中心” header, administrator scope segmented control, and the three components. Do not add another Manager component or pass global theme/config as props.

- [ ] **Step 6: Run the view test and typecheck**

~~~bash
(cd web && node --experimental-strip-types --test 'src/app/(user)/data-center/data-center-view.test.mts')
(cd web && npm run typecheck)
~~~

Expected: test PASS and typecheck exit 0. If unrelated pre-existing type errors exist, record them and confirm none point to data-center, usage.ts, or use-user-store.ts.

- [ ] **Step 7: Commit**

~~~bash
git add 'web/src/app/(user)/data-center'
git commit -m "feat: add unified data center page"
~~~

## Task 6: Wire navigation and isolate administrator operations

**Files:**

- Create: web/src/components/layout/user-status-actions-view.ts
- Create: web/src/components/layout/user-status-actions-view.test.mts
- Modify: web/src/components/layout/user-status-actions.tsx
- Create: web/src/app/(admin)/admin/ai-tasks/admin-ai-task-page-view.ts
- Create: web/src/app/(admin)/admin/ai-tasks/admin-ai-task-page-view.test.mts
- Modify: web/src/app/(admin)/admin/ai-tasks/page.tsx
- Modify: web/src/app/(admin)/admin/layout.tsx
- Delete: web/src/app/(admin)/admin/ai-tasks/components/ai-usage-summary.tsx
- Delete: web/src/app/(admin)/admin/ai-tasks/use-admin-ai-usage-summary.ts

- [ ] **Step 1: Write failing tests**

~~~ts
import assert from "node:assert/strict";
import test from "node:test";

import { accountDestinationItems } from "./user-status-actions-view.ts";

test("all authenticated roles receive data center before admin tools", () => {
    assert.deepEqual(accountDestinationItems("user"), [
        { key: "data-center", label: "数据中心", href: "/data-center" },
    ]);
    assert.deepEqual(accountDestinationItems("admin").map((item) => item.key), ["data-center", "admin"]);
});
~~~

~~~ts
import assert from "node:assert/strict";
import test from "node:test";

import { adminTaskOperationTabs } from "./admin-ai-task-page-view.ts";

test("administrator page contains operations but no analytics", () => {
    assert.deepEqual(adminTaskOperationTabs, ["任务明细", "算力流水"]);
});
~~~

- [ ] **Step 2: Run and verify RED**

~~~bash
cd web && node --experimental-strip-types --test 'src/components/layout/user-status-actions-view.test.mts' 'src/app/(admin)/admin/ai-tasks/admin-ai-task-page-view.test.mts'
~~~

Expected: FAIL because both view modules are missing.

- [ ] **Step 3: Implement navigation descriptors and links**

accountDestinationItems returns “数据中心” for every authenticated role and appends “管理后台” only for admin/superadmin. Map the descriptors to Ant Design menu items inside user-status-actions.tsx.

Preserve the file's existing text-variant edits. Replace only the canvas balance wrapper with:

~~~tsx
<Tooltip title="查看数据中心" placement="bottom">
    <Link
        href="/data-center"
        className="flex h-8 shrink-0 items-center gap-1.5 px-1.5 text-xs font-medium tabular-nums opacity-75 transition hover:opacity-100"
        style={{ color: canvasTheme.node.text }}
    >
        <CreditSymbol className="text-sm leading-none" />
        <span>{credits.toLocaleString()}</span>
    </Link>
</Tooltip>
~~~

- [ ] **Step 4: Isolate administrator operations**

Implement adminTaskOperationTabs as the tested readonly array. Change admin/ai-tasks/page.tsx to render only the existing task and credit tabs; remove AIUsageSummary from the page. Change the administrator menu label and page title from “AI 使用” to “任务运维” while keeping /admin/ai-tasks.

Delete components/ai-usage-summary.tsx and use-admin-ai-usage-summary.ts after confirming rg finds no remaining imports; their responsibilities now live in the unified data-center hook and components.

- [ ] **Step 5: Run and verify GREEN**

~~~bash
cd web && node --experimental-strip-types --test 'src/components/layout/user-status-actions-view.test.mts' 'src/app/(admin)/admin/ai-tasks/admin-ai-task-page-view.test.mts' 'src/app/(user)/data-center/data-center-view.test.mts'
~~~

Expected: PASS.

- [ ] **Step 6: Inspect overlap and commit safely**

~~~bash
git diff -- web/src/components/layout/user-status-actions.tsx
~~~

Confirm the diff preserves the user's prior text-variant changes and adds only data-center behavior. Stage the feature files. If this dirty file cannot be isolated safely, leave it modified and report the overlap instead of committing unrelated work.

~~~bash
git add web/src/components/layout/user-status-actions-view.ts web/src/components/layout/user-status-actions-view.test.mts web/src/components/layout/user-status-actions.tsx 'web/src/app/(admin)/admin/ai-tasks/admin-ai-task-page-view.ts' 'web/src/app/(admin)/admin/ai-tasks/admin-ai-task-page-view.test.mts' 'web/src/app/(admin)/admin/ai-tasks/page.tsx' 'web/src/app/(admin)/admin/layout.tsx' 'web/src/app/(admin)/admin/ai-tasks/components/ai-usage-summary.tsx' 'web/src/app/(admin)/admin/ai-tasks/use-admin-ai-usage-summary.ts'
git commit -m "feat: separate data center from task operations"
~~~

## Task 7: Update acceptance docs and verify

**Files:**

- Modify: docs/pending-test.md
- Inspect: docs/todo.md
- Modify: CHANGELOG.md

- [ ] **Step 1: Update documentation**

Add “数据中心与任务运维分离” to docs/pending-test.md covering self-only user access, administrator all/mine switching, balance and account-menu entry, period cards, kind/member distribution, business-first columns, read-only detail, administrator mutations remaining in task operations, and light/dark/narrow-screen checks.

Add one concise Unreleased bullet to CHANGELOG.md: “新增统一数据中心并将管理员任务运维从使用统计中分离。”

Inspect docs/todo.md. Do not change it unless an existing matching todo moves to pending-test. Do not promise project/episode aggregation.

- [ ] **Step 2: Run backend targeted verification**

~~~bash
go test ./service ./handler ./router -run 'AIUsage|AIUsageRoutes|AITask' -count=1
~~~

Expected: exit 0 with zero failing tests.

- [ ] **Step 3: Run frontend targeted verification**

~~~bash
cd web && node --experimental-strip-types --test 'src/app/(user)/data-center/data-center-view.test.mts' 'src/components/layout/user-status-actions-view.test.mts' 'src/app/(admin)/admin/ai-tasks/admin-ai-task-page-view.test.mts'
~~~

Expected: all tests pass.

- [ ] **Step 4: Run TypeScript verification**

~~~bash
cd web && npm run typecheck
~~~

Expected: exit 0. If unrelated pre-existing errors remain, report exact files and do not claim a clean typecheck.

- [ ] **Step 5: Inspect final scope**

~~~bash
git diff --check
git status --short
git diff --stat
~~~

Confirm no unrelated files were modified by the feature, pending-test records actual behavior, and todo was unchanged or moved one matching item only.

- [ ] **Step 6: Commit documentation only if isolation is safe**

Because docs/pending-test.md and docs/todo.md already contain user changes, inspect hunks before staging. Stage CHANGELOG.md normally and use interactive hunk selection for pending-test. If safe isolation is not possible, leave documentation unstaged and report it.

~~~bash
git add CHANGELOG.md
git add -p docs/pending-test.md
git commit -m "docs: add data center acceptance checks"
~~~

## Final acceptance checklist

- [ ] /api/me endpoints derive identity from authenticated context and never accept another user ID.
- [ ] AI tasks, Agent Runs, partial/full refunds, and unknown related IDs remain visible and totals stay consistent.
- [ ] Ordinary users see only mine; administrators default to all and can switch to mine.
- [ ] Data-center default columns are business-facing; technical detail is read-only and secondary.
- [ ] Administrator refresh, refund, and credit-log writes remain available only under /admin/ai-tasks.
- [ ] Canvas balance and account menu enter /data-center without regressing current text-nav edits.
- [ ] No project/episode/team/cloud-sync capability is implied or implemented.
- [ ] Targeted Go tests, targeted Node tests, and TypeScript typecheck have fresh evidence before completion is claimed.
