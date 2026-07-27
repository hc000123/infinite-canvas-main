# Admin AI Usage Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the admin AI task and credit log areas into one “AI 使用” page with actual daily, weekly, and monthly net-credit totals plus paginated per-user usage shares.

**Architecture:** Add a read-only Go aggregation path over `credit_logs`, grouping consume/refund entries by user and related ID and assigning refunds to the original consumption time. The existing task and credit-log APIs remain intact; the Next.js page becomes a small assembly layer that combines a new usage summary with two existing management panels.

**Tech Stack:** Go, Gin, GORM, SQLite-compatible SQL, Next.js App Router, React, TypeScript, TanStack Query, Ant Design, Ant Design Pro Components.

---

### Task 1: Define and aggregate actual AI usage

**Files:**
- Create: `model/ai_usage.go`
- Create: `repository/ai_usage.go`
- Test: `repository/ai_usage_test.go`

- [ ] **Step 1: Write the repository aggregation test**

Create test data containing `ai_consume`, partial and full `ai_refund`, a cross-period refund, `admin_adjust`, two different users, and two empty `relatedId` consumption rows. Assert that `ListAIUsage(startAt, endAt)` returns one positive row per actual usage, excludes adjustments and fully refunded usage, uses the consumption time, and does not merge empty related IDs.

```go
rows, err := ListAIUsage("2026-07-01T00:00:00+08:00", "2026-08-01T00:00:00+08:00")
if err != nil { t.Fatal(err) }
if len(rows) != 4 { t.Fatalf("rows = %d", len(rows)) }
if rows[0].NetCredits <= 0 { t.Fatalf("net = %d", rows[0].NetCredits) }
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `go test ./repository -run TestListAIUsage -count=1`

Expected: FAIL because `ListAIUsage` and the usage models do not exist.

- [ ] **Step 3: Add the usage model types**

Define `AIUsagePeriod` constants `day`, `week`, and `month`; `AIUsageQuery` with `Period`, `Page`, `PageSize`, `Normalize()`, and `Offset()`; raw `AIUsageRow`; `AIUsagePeriodSummary`; `AIUsageUser`; and `AIUsageSummary` with the exact JSON fields from the design document.

```go
type AIUsageRow struct {
    UserID     string
    NetCredits int
}

type AIUsageUser struct {
    UserID     string      `json:"userId"`
    User       UserSummary `json:"user"`
    NetCredits int         `json:"netCredits"`
    UsageCount int         `json:"usageCount"`
    Ratio      float64     `json:"ratio"`
}
```

- [ ] **Step 4: Implement the repository query**

Query only consume rows whose `created_at` is in `[startAt, endAt)`, left join refunds by matching `user_id` and non-empty `related_id`, and use the consume log ID as the empty-related grouping key. Return rows grouped by user and usage key with `MAX(-consume_total - refund_total, 0)` semantics in Go-safe integer fields; ignore non-positive net rows.

```go
func ListAIUsage(startAt, endAt string) ([]model.AIUsageRow, error) {
    db, err := DB()
    if err != nil { return nil, err }
    var logs []model.CreditLog
    err = db.Where("type IN ?", []model.CreditLogType{model.CreditLogTypeAIConsume, model.CreditLogTypeAIRefund}).Find(&logs).Error
    // Pair refunds to period-filtered consumption groups in deterministic Go aggregation.
    return rows, err
}
```

- [ ] **Step 5: Run the focused repository test**

Run: `go test ./repository -run TestListAIUsage -count=1`

Expected: PASS.

- [ ] **Step 6: Commit the aggregation layer**

```bash
git add model/ai_usage.go repository/ai_usage.go repository/ai_usage_test.go
git commit -m "feat: aggregate actual AI credit usage"
```

### Task 2: Add period calculation and admin summary API

**Files:**
- Create: `service/ai_usage.go`
- Create: `service/ai_usage_test.go`
- Modify: `handler/admin.go`
- Modify: `router/router.go`

- [ ] **Step 1: Write service tests for Beijing periods and summary pagination**

Use a fixed service clock and assert day, Monday-based week, month boundaries, invalid-period fallback to month, net-credit totals, user counts, stable sort (`netCredits DESC`, `userId ASC`), page slicing, ratios based on the full period total, and deleted-user summaries.

```go
query := model.AIUsageQuery{Period: "invalid", Page: 1, PageSize: 10}
result, err := GetAdminAIUsageSummary(query, time.Date(2026, 7, 27, 12, 0, 0, 0, shanghai))
if err != nil { t.Fatal(err) }
if result.SelectedPeriod != model.AIUsagePeriodMonth { t.Fatalf("period = %s", result.SelectedPeriod) }
```

- [ ] **Step 2: Run the service test and verify it fails**

Run: `go test ./service -run TestAdminAIUsageSummary -count=1`

Expected: FAIL because the summary service does not exist.

- [ ] **Step 3: Implement period boundaries and summary construction**

Load `Asia/Shanghai`, calculate left-closed/right-open day/week/month boundaries, call the shared repository aggregation for each card, select and paginate users for the requested period, hydrate summaries through `ListUserSummariesByIDs`, and calculate `ratio = user.NetCredits / selectedTotal`.

```go
func GetAdminAIUsageSummary(q model.AIUsageQuery) (model.AIUsageSummary, error) {
    return getAdminAIUsageSummaryAt(q, time.Now())
}

func aiUsagePeriodRange(period model.AIUsagePeriod, now time.Time) (time.Time, time.Time) {
    // Day: local midnight; week: Monday; month: first day.
}
```

- [ ] **Step 4: Add handler parsing and route registration**

Add `AdminAIUsageSummary`, parsing `period`, `page`, and `pageSize` with the same integer defaults used by existing admin list handlers, and register it before `/ai-tasks/:id`.

```go
admin.GET("/ai-usage-summary", gin.WrapF(handler.AdminAIUsageSummary))
```

- [ ] **Step 5: Run the focused service test**

Run: `go test ./service -run TestAdminAIUsageSummary -count=1`

Expected: PASS.

- [ ] **Step 6: Commit the API**

```bash
git add service/ai_usage.go service/ai_usage_test.go handler/admin.go router/router.go
git commit -m "feat: expose admin AI usage summary"
```

### Task 3: Add the frontend usage data hook and summary UI

**Files:**
- Modify: `web/src/services/api/admin.ts`
- Create: `web/src/app/(admin)/admin/ai-tasks/use-admin-ai-usage-summary.ts`
- Create: `web/src/app/(admin)/admin/ai-tasks/components/ai-usage-summary.tsx`

- [ ] **Step 1: Add exact API types and request function**

Define `AdminAIUsagePeriod = "day" | "week" | "month"`, period/user/response types matching the backend JSON, and `fetchAdminAIUsageSummary(token, { period, page, pageSize })` targeting `/api/admin/ai-usage-summary`.

```ts
export type AdminAIUsageSummaryResponse = {
    periods: AdminAIUsagePeriodSummary[];
    selectedPeriod: AdminAIUsagePeriod;
    users: AdminAIUsageUser[];
    userTotal: number;
    page: number;
    pageSize: number;
};
```

- [ ] **Step 2: Implement the isolated summary hook**

Default to `month`, use query key `["admin", "ai-usage-summary", token, period, page, pageSize]`, expose period/page changes that reset page when needed, expose `refreshSummary`, and return `isError` plus a readable `errorMessage` without emitting a global error that would interfere with the detail tabs.

```ts
const [period, setPeriod] = useState<AdminAIUsagePeriod>("month");
const [page, setPage] = useState(1);
const query = useQuery({
    queryKey: ["admin", "ai-usage-summary", token, period, page, pageSize],
    queryFn: () => fetchAdminAIUsageSummary(token, { period, page, pageSize }),
    enabled: Boolean(token),
});
```

- [ ] **Step 3: Build the summary component**

Render three selectable cards using Ant Design theme tokens, Chinese period labels and local date ranges. Beneath them render a user table with `adminUsageUserDisplay`, net credits, usage count, and a percentage `Progress`; use `Alert` with retry for errors and `Empty` for zero usage.

```tsx
<Progress percent={Number((item.ratio * 100).toFixed(1))} size="small" />
```

- [ ] **Step 4: Commit the summary UI**

```bash
git add web/src/services/api/admin.ts 'web/src/app/(admin)/admin/ai-tasks/use-admin-ai-usage-summary.ts' 'web/src/app/(admin)/admin/ai-tasks/components/ai-usage-summary.tsx'
git commit -m "feat: add admin AI usage summary UI"
```

### Task 4: Merge task and credit log management into one page

**Files:**
- Create: `web/src/app/(admin)/admin/ai-tasks/components/ai-task-log-panel.tsx`
- Create: `web/src/app/(admin)/admin/ai-tasks/components/credit-log-panel.tsx`
- Move: `web/src/app/(admin)/admin/credit-logs/use-admin-credit-logs.ts` to `web/src/app/(admin)/admin/ai-tasks/use-admin-credit-logs.ts`
- Modify: `web/src/app/(admin)/admin/ai-tasks/use-admin-ai-tasks.ts`
- Modify: `web/src/app/(admin)/admin/ai-tasks/page.tsx`
- Delete: `web/src/app/(admin)/admin/credit-logs/page.tsx`

- [ ] **Step 1: Move the two existing management views into page-private panels**

Move the current AI task page body and helper functions into `AITaskLogPanel`, removing only its outer `<main>` wrapper. Move the credit log page into `CreditLogPanel`, remove its outer `<main>`, and import the relocated hook via `../use-admin-credit-logs`.

```tsx
export function AITaskLogPanel() { /* existing task filters, table, drawer */ }
export function CreditLogPanel() { /* existing credit-log filters, table, modals */ }
```

- [ ] **Step 2: Invalidate usage and credit logs after task state changes**

For refresh and refund success, invalidate `admin/ai-tasks`, the task detail, `admin/credit-logs`, and `admin/ai-usage-summary`. Keep admin credit-log create/edit/delete invalidation limited to `admin/credit-logs`, because `admin_adjust` is excluded from usage.

```ts
await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["admin", "ai-tasks"] }),
    queryClient.invalidateQueries({ queryKey: ["admin", "ai-task", token, id] }),
    queryClient.invalidateQueries({ queryKey: ["admin", "credit-logs"] }),
    queryClient.invalidateQueries({ queryKey: ["admin", "ai-usage-summary"] }),
]);
```

- [ ] **Step 3: Assemble the unified page**

Render `AIUsageSummary` first and an Ant Design `Tabs` below with labels `任务明细` and `算力流水`; mount both panel components as tab children so their independent errors and filters remain isolated.

```tsx
<main style={{ padding: 24 }}>
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
        <AIUsageSummary />
        <Card variant="borderless">
            <Tabs items={[{ key: "tasks", label: "任务明细", children: <AITaskLogPanel /> }, { key: "credits", label: "算力流水", children: <CreditLogPanel /> }]} />
        </Card>
    </Space>
</main>
```

- [ ] **Step 4: Remove the obsolete route components and commit**

```bash
git add 'web/src/app/(admin)/admin/ai-tasks' 'web/src/app/(admin)/admin/credit-logs'
git commit -m "feat: merge admin AI usage logs"
```

### Task 5: Update navigation and release-facing documentation

**Files:**
- Modify: `web/src/app/(admin)/admin/layout.tsx`
- Modify: `docs/pending-test.md`
- Inspect: `docs/todo.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Replace the two sidebar entries with one**

Remove the `TransactionOutlined` import, remove `/admin/credit-logs`, and rename `/admin/ai-tasks` to `AI 使用`. Simplify selected-key and page-title logic so the AI route resolves only to `/admin/ai-tasks` and `AI 使用`.

```tsx
{ key: "/admin/ai-tasks", icon: <RobotOutlined />, label: "AI 使用" }
```

- [ ] **Step 2: Record the user-testable changes**

Add a `docs/pending-test.md` entry covering actual day/week/month net usage, user share pagination, merged task/credit tabs, and task refund refresh behavior. Add a concise `CHANGELOG.md` `Unreleased` bullet. Confirm `docs/todo.md` needs no change because no roadmap item is completed or added.

- [ ] **Step 3: Format and review changed files**

Run: `gofmt -w model/ai_usage.go repository/ai_usage.go service/ai_usage.go handler/admin.go router/router.go`

Expected: Go files are formatted without changing unrelated code.

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only planned files are changed.

- [ ] **Step 4: Commit navigation and documentation**

```bash
git add 'web/src/app/(admin)/admin/layout.tsx' docs/pending-test.md CHANGELOG.md
git commit -m "docs: record admin AI usage dashboard"
```

### Task 6: Optional focused verification when explicitly requested

**Files:**
- Verify only; no source changes expected.

- [ ] **Step 1: Run backend focused tests**

Run: `go test ./repository ./service -run 'Test(ListAIUsage|AdminAIUsageSummary)' -count=1`

Expected: PASS.

- [ ] **Step 2: Run frontend checks**

Run from `web/`: `npm run lint`

Expected: PASS without new lint errors.

- [ ] **Step 3: Review the final diff**

Run: `git diff HEAD~5 --stat && git status --short --branch`

Expected: the branch contains only the design, plan, backend summary, unified frontend, navigation, and documentation changes.
