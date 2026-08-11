# AI 用量报表导出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在管理员数据中心按历史日期范围导出 XLSX，统计每位成员的全部 AI 净积分、模型分布和成功视频秒数，并允许在 Excel 内离线填写实际采用秒数后自动重算日、周、月和总览。

**Architecture:** `credit_logs` 继续作为积分真相，`ai_tasks.generated_seconds` 保存视频有效秒数，现有统一用量记录负责关联用户、模型与状态。新增独立导出 service 聚合数据并用 Excelize 生成工作簿，管理员 handler 直接流式返回文件；前端只负责收集范围、调用下载和提示结果。

**Tech Stack:** Go 1.25、Gin、GORM、Excelize v2、Next.js App Router、React、TypeScript、Ant Design、Axios、file-saver。

---

## 实施前约束

- 设计依据：`docs/superpowers/specs/2026-08-11-ai-usage-export-design.md`。
- 当前工作区已有与视频渠道、画布恢复和后台设置相关的用户改动。实施时只修改本计划列出的文件，不覆盖、回滚或顺手整理其他文件。
- 按项目 `AGENTS.md`，测试命令在本计划中作为确定性验收路径保留；除非用户明确要求完整检查，日常实施默认不执行测试、构建或类型检查。
- 新字段直接由现有 GORM `AutoMigrate` 增加，不写旧字段兼容或额外迁移脚本。

## 文件结构

### 后端

- `model/ai_task.go`：AI 任务结构化成功视频秒数。
- `model/ai_usage.go`：用量记录与导出查询、汇总数据结构。
- `handler/ai.go`：创建 AI 任务时传入本次视频有效秒数。
- `service/ai_task.go`：保存视频秒数，并在成功响应提供实际时长时更新。
- `service/ai_usage.go`：统一用量记录补充成功视频秒数和缺失标记。
- `service/ai_usage_export.go`：校验导出范围、加载全量记录并按用户、日、周、月聚合。
- `service/ai_usage_export_xlsx.go`：只负责把已聚合数据渲染为 XLSX。
- `handler/ai_usage_export.go`：解析导出参数并返回文件。
- `router/router.go`：注册管理员导出路由。
- `go.mod`、`go.sum`：增加 Excelize v2。

### 前端

- `web/src/services/api/usage.ts`：新增管理员报表下载请求。
- `web/src/app/(user)/data-center/use-usage-export.ts`：页面私有导出动作和 loading/error 状态。
- `web/src/app/(user)/data-center/components/usage-export-modal.tsx`：日期、成员、模型导出弹窗。
- `web/src/app/(user)/data-center/page.tsx`：管理员“全部成员”视图接入导出入口。
- `web/src/app/(user)/data-center/data-center-view.ts`：纯函数形式的权限显示和默认日期范围。

### 测试与文档

- `service/ai_task_test.go`：秒数持久化与成功响应覆盖。
- `service/ai_usage_records_test.go`：用量记录秒数口径。
- `service/ai_usage_export_test.go`：时间范围、筛选和日周月聚合。
- `service/ai_usage_export_xlsx_test.go`：工作表、公式、校验、保护和文本安全。
- `handler/ai_usage_export_test.go`：下载响应与业务错误。
- `router/router_test.go`：管理员路由鉴权边界。
- `web/src/app/(user)/data-center/data-center-view.test.mts`：导出入口权限与默认日期。
- `docs/backend-database.md`、`docs/pending-test.md`、`CHANGELOG.md`：字段、接口和待验收说明。

## Task 1：结构化保存成功视频秒数

**Files:**
- Modify: `model/ai_task.go:15-46`
- Modify: `handler/ai.go:226-303`
- Modify: `service/ai_task.go:22-60,104-114,810-830`
- Modify: `service/ai_task_test.go:41-84,350-368`

- [ ] **Step 1: 写秒数持久化失败测试**

在 `service/ai_task_test.go` 增加：

```go
func TestAITaskPersistsGeneratedSecondsAndUsesSuccessfulResponseDuration(t *testing.T) {
    setupAITaskTestDB(t)
    task, err := CreateAITask(CreateAITaskInput{
        UserID: "usage-video-user", Model: "video-model", Path: "/videos",
        GeneratedSeconds: 6, RequestBody: []byte(`{"duration":6}`), ContentType: "application/json",
    })
    if err != nil { t.Fatal(err) }
    if task.GeneratedSeconds != 6 { t.Fatalf("created seconds = %d", task.GeneratedSeconds) }

    if err := MarkAITaskSucceeded(task.ID, []byte(`{"task":{"status":"succeeded","duration":8}}`), "application/json"); err != nil { t.Fatal(err) }
    saved, ok, err := repository.GetAITask(task.ID)
    if err != nil || !ok || saved.GeneratedSeconds != 8 {
        t.Fatalf("saved = %#v ok=%v err=%v", saved, ok, err)
    }
}
```

- [ ] **Step 2: 如获授权，运行定向测试确认当前失败**

Run: `go test ./service -run TestAITaskPersistsGeneratedSecondsAndUsesSuccessfulResponseDuration -count=1`

Expected: FAIL，提示 `GeneratedSeconds` 字段不存在。

- [ ] **Step 3: 增加字段和创建输入**

在 `model.AITask` 的积分字段之后增加：

```go
GeneratedSeconds int `json:"generatedSeconds"`
```

在 `CreateAITaskInput` 增加同名字段，并在 `CreateAITask` 构造任务时直接写入：

```go
GeneratedSeconds: max(0, input.GeneratedSeconds),
```

- [ ] **Step 4: 创建任务时复用已经计算出的用量秒数**

在 `handler/ai.go` 把当前内联计算拆成稳定变量：

```go
usageCount := readAIRequestUsageForModel(path, r.Header.Get("X-Infinite-Canvas-Request-Kind"), body, contentType, modelName, channel.Protocol)
credits, err = multiplyAICredits(credits, usageCount)
```

创建任务时只为视频传入：

```go
GeneratedSeconds: func() int {
    if path == "/videos" { return usageCount }
    return 0
}(),
```

这保证秒数与本次实际计费单位一致；成功响应中的实际 `duration/seconds` 可以在下一步覆盖。

- [ ] **Step 5: 成功响应存在实际时长时覆盖**

在 `service/ai_task.go` 增加只读取白名单路径的函数，避免递归扫描任意响应字段：

```go
func aiTaskGeneratedSecondsFromResponse(body []byte) int {
    var payload map[string]any
    if json.Unmarshal(body, &payload) != nil { return 0 }
    candidates := []map[string]any{payload}
    for _, key := range []string{"task", "data", "output"} {
        if nested, ok := payload[key].(map[string]any); ok { candidates = append(candidates, nested) }
    }
    for _, item := range candidates {
        for _, key := range []string{"duration", "seconds"} {
            if seconds := int(aiTaskInt64Value(item, key)); seconds > 0 { return seconds }
        }
    }
    return 0
}
```

在 `MarkAITaskSucceeded` 和 `applyArkVideoTaskPayload` 中，仅当任务最终成功且返回值大于 0 时覆盖：

```go
if isVideoAITask(task) && task.Status == model.AITaskStatusSucceeded {
    if seconds := aiTaskGeneratedSecondsFromResponse(responseBody); seconds > 0 {
        task.GeneratedSeconds = seconds
    }
}
```

`applyArkVideoTaskPayload` 使用 `normalizedBody` 调用同一函数并沿用相同的视频/成功状态保护。失败、取消和非视频任务不改变秒数。

- [ ] **Step 6: 如获授权，运行定向测试确认通过**

Run: `go test ./service -run 'TestAITaskPersistsGeneratedSecondsAndUsesSuccessfulResponseDuration|TestSyncArkVideoAITaskSucceededDoesNotRefund' -count=1`

Expected: PASS。

- [ ] **Step 7: 提交本任务**

```bash
git add model/ai_task.go handler/ai.go service/ai_task.go service/ai_task_test.go
git commit -m "feat: persist generated video seconds"
```

## Task 2：扩展统一用量记录并实现导出聚合

**Files:**
- Modify: `model/ai_usage.go:57-153`
- Modify: `service/ai_usage.go:117-213`
- Modify: `service/ai_usage_records_test.go:12-66`
- Create: `service/ai_usage_export.go`
- Create: `service/ai_usage_export_test.go`

- [ ] **Step 1: 写用量秒数与聚合失败测试**

在 `service/ai_usage_records_test.go` 的首个用例中加入一条成功视频和一条失败视频，断言：

```go
if got := byID["video-success"].GeneratedSeconds; got != 12 { t.Fatalf("seconds = %d", got) }
if got := byID["video-failed"].GeneratedSeconds; got != 0 { t.Fatalf("failed seconds = %d", got) }
if byID["video-missing"].DurationIssue != "missing_duration" { t.Fatalf("missing duration not marked") }
```

新建 `service/ai_usage_export_test.go`，准备北京时间周日、周一、月末、次月以及两名用户、两种模型的数据，核心断言：

```go
data, err := buildAIUsageExportData(records, model.AIUsageExportQuery{
    StartAt: "2026-08-30T00:00:00+08:00",
    EndAt:   "2026-10-01T00:00:00+08:00",
}, time.Date(2026, 10, 1, 9, 0, 0, 0, shanghai))
if err != nil { t.Fatal(err) }
if sumExportCredits(data.Overview) != sumRecordCredits(records) { t.Fatal("overview credits mismatch") }
if len(data.Daily) == 0 || len(data.Weekly) < 2 || len(data.Monthly) < 2 { t.Fatalf("groups = %#v", data) }
```

- [ ] **Step 2: 如获授权，运行定向测试确认失败**

Run: `go test ./service -run 'Test(ListAIUsageRecordsPairsRefundsAndEnrichesSources|BuildAIUsageExportData)' -count=1`

Expected: FAIL，导出类型和秒数字段尚不存在。

- [ ] **Step 3: 定义导出类型**

在 `model/ai_usage.go` 增加：

```go
type AIUsageExportQuery struct { User, Model, StartAt, EndAt string }

type AIUsageExportSummaryRow struct {
    PeriodStart, PeriodEnd string
    UserID string
    User UserSummary
    Kind, Model string
    NetCredits, SuccessfulVideoCount, GeneratedSeconds int
}

type AIUsageExportData struct {
    ExportedAt, StartAt, EndAt, UserFilter, ModelFilter string
    Overview, Daily, Weekly, Monthly []AIUsageExportSummaryRow
    Records []AIUsageRecord
}
```

在 `AIUsageRecord` 增加：

```go
GeneratedSeconds int    `json:"generatedSeconds"`
DurationIssue    string `json:"durationIssue"`
```

- [ ] **Step 4: 用量记录只暴露成功视频秒数**

在 `ListAIUsageRecords` 的 AI Task enrichment 分支加入：

```go
if task.Kind == "video" && task.Status == model.AITaskStatusSucceeded {
    record.GeneratedSeconds = max(0, task.GeneratedSeconds)
    if record.GeneratedSeconds == 0 { record.DurationIssue = "missing_duration" }
}
```

其他来源、非视频和非成功状态保持 0。

- [ ] **Step 5: 实现范围校验和全量加载**

在 `service/ai_usage_export.go` 实现：

```go
func BuildAdminAIUsageExportData(q model.AIUsageExportQuery, current time.Time) (model.AIUsageExportData, error) {
    location, _ := time.LoadLocation("Asia/Shanghai")
    start, err := time.Parse(time.RFC3339, strings.TrimSpace(q.StartAt))
    if err != nil { return model.AIUsageExportData{}, safeMessageError{message: "请选择有效的开始日期"} }
    end, err := time.Parse(time.RFC3339, strings.TrimSpace(q.EndAt))
    if err != nil || !end.After(start) { return model.AIUsageExportData{}, safeMessageError{message: "结束日期必须晚于开始日期"} }
    if end.After(start.AddDate(1, 0, 0)) { return model.AIUsageExportData{}, safeMessageError{message: "单次导出范围不能超过一年"} }
    records, err := listAllAIUsageRecords(model.AIUsageRecordQuery{User: strings.TrimSpace(q.User), Model: strings.TrimSpace(q.Model), StartAt: start.Format(time.RFC3339), EndAt: end.Format(time.RFC3339)})
    if err != nil { return model.AIUsageExportData{}, err }
    if len(records) == 0 { return model.AIUsageExportData{}, safeMessageError{message: "当前范围暂无可导出的用量记录"} }
    return buildAIUsageExportData(records, q, current.In(location))
}
```

不得把 `pageSize=500` 当成导出上限；沿用现有 `listAllAIUsageRecords` 遍历全部页。

- [ ] **Step 6: 实现四种聚合**

使用稳定键 `userID + kind + model + periodStart` 聚合；总览只按 userID。每条记录累加净积分；只有成功视频增加视频数和生成秒数。周起点计算必须使用：

```go
func usageWeekStart(value time.Time) time.Time {
    day := time.Date(value.Year(), value.Month(), value.Day(), 0, 0, 0, 0, value.Location())
    return day.AddDate(0, 0, -((int(day.Weekday()) + 6) % 7))
}
```

所有输出按周期开始、用户显示名、生成类型、模型稳定排序，确保相同输入生成相同工作簿行序。

- [ ] **Step 7: 如获授权，运行定向测试确认通过**

Run: `go test ./service -run 'Test(ListAIUsageRecordsPairsRefundsAndEnrichesSources|BuildAIUsageExportData)' -count=1`

Expected: PASS。

- [ ] **Step 8: 提交本任务**

```bash
git add model/ai_usage.go service/ai_usage.go service/ai_usage_records_test.go service/ai_usage_export.go service/ai_usage_export_test.go
git commit -m "feat: aggregate AI usage export data"
```

## Task 3：生成可离线登记的 XLSX

**Files:**
- Modify: `go.mod`
- Modify: `go.sum`
- Create: `service/ai_usage_export_xlsx.go`
- Create: `service/ai_usage_export_xlsx_test.go`

- [ ] **Step 1: 增加成熟 XLSX 依赖**

Run: `go get github.com/xuri/excelize/v2@v2.10.0`

Expected: `go.mod` 和 `go.sum` 只新增 Excelize 及其必要间接依赖。

- [ ] **Step 2: 写工作簿结构失败测试**

测试用最小 `AIUsageExportData` 调用 `BuildAIUsageExportWorkbook`，再用 Excelize 打开：

```go
body, filename, err := BuildAIUsageExportWorkbook(data)
if err != nil { t.Fatal(err) }
book, err := excelize.OpenReader(bytes.NewReader(body))
if err != nil { t.Fatal(err) }
defer book.Close()
want := []string{"总览", "按日统计", "按周统计", "按月统计", "用量明细"}
if !reflect.DeepEqual(book.GetSheetList(), want) { t.Fatalf("sheets = %#v", book.GetSheetList()) }
if formula, _ := book.GetCellFormula("总览", "F5"); !strings.Contains(formula, "SUMIFS") { t.Fatalf("formula = %q", formula) }
if filename != "用量报表_2026-08-01_2026-08-31.xlsx" { t.Fatalf("filename = %q", filename) }
```

另加一条用户名 `=HYPERLINK(...)`，断言单元格公式为空且值保持文本。

- [ ] **Step 3: 如获授权，运行测试确认失败**

Run: `go test ./service -run TestBuildAIUsageExportWorkbook -count=1`

Expected: FAIL，工作簿函数不存在。

- [ ] **Step 4: 创建工作簿入口与固定工作表**

在 `service/ai_usage_export_xlsx.go` 实现：

```go
func BuildAIUsageExportWorkbook(data model.AIUsageExportData) ([]byte, string, error) {
    book := excelize.NewFile()
    defer book.Close()
    book.SetSheetName("Sheet1", "总览")
    for _, name := range []string{"按日统计", "按周统计", "按月统计", "用量明细"} { _, _ = book.NewSheet(name) }
    styles, err := newAIUsageExportStyles(book)
    if err != nil { return nil, "", err }
    if err := writeUsageDetailSheet(book, data, styles); err != nil { return nil, "", err }
    if err := writeUsageSummarySheets(book, data, styles); err != nil { return nil, "", err }
    book.SetActiveSheet(0)
    buffer, err := book.WriteToBuffer()
    if err != nil { return nil, "", err }
    return buffer.Bytes(), usageExportFilename(data.StartAt, data.EndAt), nil
}
```

`usageExportFilename` 将左闭右开的 `EndAt` 减一天后显示，`[2026-08-01, 2026-09-01)` 必须生成 `用量报表_2026-08-01_2026-08-31.xlsx`。

- [ ] **Step 5: 写明细并限制可编辑单元格**

按设计的 14 列写数据。所有外部字符串必须使用 `SetCellStr`；只有系统公式使用 `SetCellFormula`。成功视频行解锁 K/L，K 列添加十进制校验 `0 <= K行 <= J行`；其他行保持锁定。最后调用 `ProtectSheet`，启用筛选和选择未锁定单元格。

实现时不要输出 API Key、请求/响应 JSON、提示词、错误详情、上游任务 ID 或前端 trace。

- [ ] **Step 6: 写总览和日周月公式**

静态积分、视频数和生成秒数来自 service 聚合。采用秒数公式按用户、类型、模型和时间范围引用明细：

```text
=SUMIFS('用量明细'!$K:$K,'用量明细'!$C:$C,$B5,'用量明细'!$D:$D,$C5,'用量明细'!$E:$E,$D5,'用量明细'!$A:$A,">="&$A5,'用量明细'!$A:$A,"<"&$B5)
```

采用率使用 `=IF(生成秒数单元格=0,"",采用秒数单元格/生成秒数单元格)`。总览公式只按用户 ID 过滤。冻结表头、启用自动筛选、设置日期/整数/百分比格式和合理列宽。

- [ ] **Step 7: 如获授权，运行工作簿测试**

Run: `go test ./service -run 'TestBuildAIUsageExportWorkbook|TestAIUsageExportWorkbookTreatsExternalTextAsText' -count=1`

Expected: PASS，并能由 Excelize 重新打开生成内容。

- [ ] **Step 8: 提交本任务**

```bash
git add go.mod go.sum service/ai_usage_export_xlsx.go service/ai_usage_export_xlsx_test.go
git commit -m "feat: build AI usage XLSX reports"
```

## Task 4：增加管理员下载接口

**Files:**
- Create: `handler/ai_usage_export.go`
- Create: `handler/ai_usage_export_test.go`
- Modify: `router/router.go:272-280`
- Modify: `router/router_test.go:15-30`

- [ ] **Step 1: 写 handler 和路由失败测试**

handler 测试准备最小数据库记录后直接调用：

```go
request := httptest.NewRequest(http.MethodGet, "/api/admin/ai-usage-export?startAt=2026-08-01T00:00:00%2B08:00&endAt=2026-09-01T00:00:00%2B08:00", nil)
recorder := httptest.NewRecorder()
AdminAIUsageExport(recorder, request)
if recorder.Header().Get("Content-Type") != "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" { t.Fatalf("content type = %q", recorder.Header().Get("Content-Type")) }
if !strings.Contains(recorder.Header().Get("Content-Disposition"), "attachment") { t.Fatal("missing attachment") }
if _, err := excelize.OpenReader(bytes.NewReader(recorder.Body.Bytes())); err != nil { t.Fatal(err) }
```

在 `router/router_test.go` 的用量路由列表加入 `/api/admin/ai-usage-export`。

- [ ] **Step 2: 如获授权，运行测试确认失败**

Run: `go test ./handler ./router -run 'TestAdminAIUsageExport|TestAIUsageRoutesRequireCorrectRoles' -count=1`

Expected: FAIL，handler/route 尚不存在。

- [ ] **Step 3: 实现下载 handler**

```go
func AdminAIUsageExport(w http.ResponseWriter, r *http.Request) {
    values := r.URL.Query()
    data, err := service.BuildAdminAIUsageExportData(model.AIUsageExportQuery{
        User: values.Get("user"), Model: values.Get("model"), StartAt: values.Get("startAt"), EndAt: values.Get("endAt"),
    }, time.Now())
    if err != nil { FailError(w, err); return }
    body, filename, err := service.BuildAIUsageExportWorkbook(data)
    if err != nil { FailError(w, err); return }
    w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
    w.Header().Set("Content-Length", strconv.Itoa(len(body)))
    _, _ = w.Write(body)
}
```

必须在设置文件响应头之前完成查询和工作簿构建，保证业务错误仍返回统一 JSON。

- [ ] **Step 4: 注册管理员路由**

在用量记录路由附近增加：

```go
admin.GET("/ai-usage-export", gin.WrapF(handler.AdminAIUsageExport))
```

- [ ] **Step 5: 如获授权，运行接口测试确认通过**

Run: `go test ./handler ./router -run 'TestAdminAIUsageExport|TestAIUsageRoutesRequireCorrectRoles' -count=1`

Expected: PASS。

- [ ] **Step 6: 提交本任务**

```bash
git add handler/ai_usage_export.go handler/ai_usage_export_test.go router/router.go router/router_test.go
git commit -m "feat: expose admin usage report download"
```

## Task 5：增加前端报表下载服务

**Files:**
- Modify: `web/src/services/api/usage.ts:1-69`

- [ ] **Step 1: 定义下载参数**

```ts
export type AIUsageExportQuery = {
    startAt: string;
    endAt: string;
    user?: string;
    model?: string;
};
```

- [ ] **Step 2: 实现 Blob 下载和 JSON 错误解析**

在 `usage.ts` 复用项目已有 Axios + file-saver 写法：

```ts
export async function downloadAdminAIUsageExport(token: string, query: AIUsageExportQuery) {
    const response = await axios.get<Blob>("/api/admin/ai-usage-export", {
        headers: { Authorization: `Bearer ${token}` },
        params: compactApiParams(query),
        responseType: "blob",
        validateStatus: () => true,
    });
    const contentType = String(response.headers["content-type"] || response.data.type || "");
    if (response.status < 200 || response.status >= 300 || contentType.includes("application/json")) {
        let message = "用量报表导出失败";
        try { message = (JSON.parse(await response.data.text()) as { msg?: string }).msg || message; } catch {}
        throw new Error(message);
    }
    const filename = usageExportFilename(String(response.headers["content-disposition"] || ""), query);
    saveAs(response.data, filename);
}
```

`usageExportFilename` 优先解析 RFC 5987 `filename*`，其次回退到 `用量报表_开始日期_结束日期.xlsx`。不要把文件下载塞进通用 JSON `apiGet`。

- [ ] **Step 3: 提交本任务**

```bash
git add web/src/services/api/usage.ts
git commit -m "feat: add usage report download client"
```

## Task 6：在数据中心接入导出弹窗

**Files:**
- Modify: `web/src/app/(user)/data-center/data-center-view.ts:1-68`
- Modify: `web/src/app/(user)/data-center/data-center-view.test.mts:1-30`
- Create: `web/src/app/(user)/data-center/use-usage-export.ts`
- Create: `web/src/app/(user)/data-center/components/usage-export-modal.tsx`
- Modify: `web/src/app/(user)/data-center/page.tsx:1-50`

- [ ] **Step 1: 写权限和默认范围失败测试**

```ts
test("only administrators in all-user scope can export", () => {
    assert.equal(dataCenterCanExport("admin", "all"), true);
    assert.equal(dataCenterCanExport("superadmin", "all"), true);
    assert.equal(dataCenterCanExport("admin", "mine"), false);
    assert.equal(dataCenterCanExport("user", "all"), false);
});

test("usage export defaults to the current Shanghai calendar month", () => {
    assert.deepEqual(dataCenterExportRange(dayjs("2026-08-11T12:00:00+08:00")), {
        startAt: "2026-08-01T00:00:00+08:00",
        endAt: "2026-09-01T00:00:00+08:00",
    });
});
```

实现纯函数 `dataCenterCanExport` 和 `dataCenterExportRange`；不要在测试中挂载整页。为保证浏览器不在中国时仍按北京时间导出，使用 Dayjs `utc`、`timezone` 插件并固定 `.tz("Asia/Shanghai")`，不要依赖运行设备本地时区。

- [ ] **Step 2: 创建页面私有导出 hook**

`useUsageExport` 接收 token 与页面当前 `user/model`，持有 `open` 和 mutation：

```ts
const mutation = useMutation({
    mutationFn: (query: AIUsageExportQuery) => downloadAdminAIUsageExport(token, query),
    onSuccess: () => { setOpen(false); message.success("用量报表已导出"); },
    onError: (error) => message.error(error instanceof Error ? error.message : "用量报表导出失败"),
});
```

使用 Ant Design `App.useApp()` 获取 message，不把提示逻辑放进 store。

- [ ] **Step 3: 创建导出弹窗**

弹窗字段：日期范围（必填、默认本月、禁止选择跨度超过一年）、成员、模型。提交时把结束日转换为下一日 00:00，保持后端左闭右开口径：

```ts
onSubmit({
    startAt: range[0].tz("Asia/Shanghai").startOf("day").format(),
    endAt: range[1].tz("Asia/Shanghai").add(1, "day").startOf("day").format(),
    user: values.user?.trim() || undefined,
    model: values.model?.trim() || undefined,
});
```

文案明确说明“实际采用秒数在下载后的 Excel 中填写，不回写平台”。

- [ ] **Step 4: 在页面标题区接入低频按钮**

仅当 `dataCenterCanExport(role, scope)` 为 true 时显示：

```tsx
<Button icon={<Download className="size-4" />} onClick={usageExport.openModal}>
    导出用量报表
</Button>
```

保留现有 scope `Segmented`，用 `Flex` 包裹右侧操作；弹窗直接使用当前页面的 `filters.user` 和 `filters.model` 作为初值，不新增跨页面状态。

- [ ] **Step 5: 如获授权，运行前端定向测试**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/data-center/data-center-view.test.mts'`

Expected: PASS。

- [ ] **Step 6: 提交本任务**

```bash
git add 'web/src/app/(user)/data-center/data-center-view.ts' 'web/src/app/(user)/data-center/data-center-view.test.mts' 'web/src/app/(user)/data-center/use-usage-export.ts' 'web/src/app/(user)/data-center/components/usage-export-modal.tsx' 'web/src/app/(user)/data-center/page.tsx'
git commit -m "feat: add data center usage export UI"
```

## Task 7：文档收口与验收清单

**Files:**
- Modify: `docs/backend-database.md:399-451`
- Modify: `docs/pending-test.md`
- Check: `docs/todo.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 更新数据库说明**

在 `ai_tasks` 字段表加入：

```markdown
| `generated_seconds` | number | 视频任务有效秒数；成功响应提供实际成片时长时更新，非视频为 0 |
```

在后台管理接口表加入 `GET /api/admin/ai-usage-export`，说明管理员日期范围、成员和模型筛选及 XLSX 下载。

- [ ] **Step 2: 更新待验收清单**

新增“用量报表导出”小节，至少覆盖：

- 管理员全员视图可见、普通用户和“我的”视图不可见；
- 一个月和跨周、跨月范围的日周月积分与秒数；
- 成员和模型筛选；
- 失败视频不计秒数、未知流水仍计积分；
- Excel 填写采用秒数后四个汇总页自动更新；
- 输入越界时 Excel 拒绝，敏感字段未出现在文件中；
- 浅色、深色和窄屏下按钮、弹窗无溢出。

- [ ] **Step 3: 检查 todo 与变更日志**

本功能不是从 `docs/todo.md` 的既有条目完成，确认无需删除或移动 todo。向 `CHANGELOG.md` 的 `Unreleased` 增加一条版本级归纳：

```markdown
+ [新增] 数据中心支持按历史范围导出成员 AI 用量报表，汇总积分、模型和成功视频秒数，并提供离线剪辑采用率统计。
```

- [ ] **Step 4: 如用户明确要求全面验收，执行确定性检查**

```bash
go test ./service ./handler ./router -run 'AIUsage|AITaskPersistsGeneratedSeconds' -count=1
cd web && node --experimental-strip-types --test 'src/app/(user)/data-center/data-center-view.test.mts'
```

Expected: 全部 PASS。根据项目默认规则，不额外执行完整构建、lint 或全库测试。

- [ ] **Step 5: 提交文档**

```bash
git add docs/backend-database.md docs/pending-test.md CHANGELOG.md
git commit -m "docs: record usage export verification"
```

## 最终验收矩阵

| 场景 | 预期 |
| --- | --- |
| 普通用户访问导出接口 | 管理员中间件拒绝 |
| 管理员导出空范围 | 统一 JSON 错误，不下载空文件 |
| 范围超过一年 | 明确提示“单次导出范围不能超过一年” |
| 跨北京时间周一/月末 | 日、周、月分组正确且积分总和一致 |
| 图片、文本、Agent | 计净积分，视频秒数为 0 |
| 成功视频 | 计成功视频数和结构化秒数 |
| 失败/取消/运行视频 | 秒数为 0 |
| 成功视频缺失秒数 | 保留记录，显示“时长缺失” |
| 未关联流水 | 保留积分，类型/模型为其他/未知 |
| 填写实际采用秒数 | 总览、日、周、月采用值和采用率自动重算 |
| 采用秒数超出范围 | Excel 数据校验拒绝 |
| 用户名以 `=` 开头 | 作为文本显示，不执行公式 |

## 实施完成定义

- 七个任务均完成，且只提交本计划列出的文件。
- 设计文档 12 条验收标准均可映射到实现或测试。
- `docs/todo.md` 已检查；实现内容已写入 `docs/pending-test.md`，正式功能文档仍等待用户真实验收后更新。
- 未包含 API Key、提示词、请求/响应正文、上游任务 ID 或前端追踪信息。
- 未对当前工作区的其他用户改动做回滚、格式化或重构。
