# Cache Selected Download and Video Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project-scoped cache file selection downloads and expose the recorded generation prompt for cached videos.

**Architecture:** Keep selection state in the cache page and pure selection calculations in `cache-view-model.ts`. Single-file downloads reuse the existing authenticated file endpoint; multi-file downloads use a new project-scoped ZIP endpoint whose service validates ownership and membership before writing any response. Video prompt metadata is read from the existing `ProjectCacheContext` and rendered in the preview modal.

**Tech Stack:** Next.js App Router, React, TypeScript, Ant Design, Tailwind CSS, Axios, file-saver, Go, Gin, standard-library `archive/zip`, Node test runner, Go test.

---

### Task 1: Selected cache ZIP service

**Files:**
- Modify: `service/project_cache_types.go`
- Modify: `service/project_cache_package.go`
- Test: `service/project_cache_test.go`

- [ ] **Step 1: Write failing service tests**

Add tests that archive two files in project `p1`, request only one ID, open the returned ZIP, and assert it contains only that media path plus `selection-manifest.json`. Add rejection cases for an unknown ID, a file from project `p2`, duplicate IDs, and a selected file removed from disk.

```go
result, err := WriteProjectCacheSelectionPackage(&output, root, "u1", ProjectCacheSelectionInput{
    ProjectID: "p1",
    FileIDs: []string{first.File.ID},
})
if err != nil { t.Fatal(err) }
if result.Manifest.FileCount != 1 { t.Fatalf("manifest=%#v", result.Manifest) }
```

- [ ] **Step 2: Run service tests and confirm RED**

Run: `go test ./service -run 'ProjectCacheSelection' -count=1`

Expected: FAIL because `ProjectCacheSelectionInput` and `WriteProjectCacheSelectionPackage` do not exist.

- [ ] **Step 3: Add selection types and writer**

Define:

```go
type ProjectCacheSelectionInput struct {
    ProjectID string   `json:"-"`
    FileIDs   []string `json:"fileIds"`
}
```

Implement `WriteProjectCacheSelectionPackage(writer, root, userID, input)` to resolve the authenticated project manifest, reject an empty list or duplicates, resolve every ID strictly inside that manifest, reject missing media before creating the ZIP, then write `selection-manifest.json` and the selected relative paths. Return a timestamped `<项目名>__所选缓存__YYYYMMDD-HHMMSS.zip` filename.

- [ ] **Step 4: Run service tests and confirm GREEN**

Run: `go test ./service -run 'ProjectCacheSelection' -count=1`

Expected: PASS.

### Task 2: Selected cache download API

**Files:**
- Modify: `handler/project_cache.go`
- Modify: `handler/project_cache_test.go`
- Modify: `router/router.go`
- Test: `router/router_test.go`

- [ ] **Step 1: Write failing handler and route tests**

Add a handler test that posts `{"fileIds":["<archived-id>"]}` as authenticated user `u1` and asserts `Content-Type: application/zip`, attachment disposition, and a valid ZIP body. Extend router wiring coverage to require:

```go
v1.POST("/project-cache/projects/:id/package/selection", func(c *gin.Context) {
    handler.DownloadProjectCacheSelection(c.Writer, c.Request, c.Param("id"))
})
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `go test ./handler ./router -run 'ProjectCacheSelection|ProjectCacheRoutes' -count=1`

Expected: FAIL because the handler and route do not exist.

- [ ] **Step 3: Implement handler and route**

Decode `ProjectCacheSelectionInput`, set `ProjectID` from the route, write to a temporary ZIP first, and only set ZIP response headers after the service succeeds. Reuse the authenticated-user and safe-error patterns from `DownloadProjectCachePackage`.

- [ ] **Step 4: Run tests and confirm GREEN**

Run: `go test ./handler ./router -run 'ProjectCacheSelection|ProjectCacheRoutes' -count=1`

Expected: PASS.

### Task 3: Frontend selection model and download client

**Files:**
- Modify: `web/src/app/(user)/cache/cache-view-model.ts`
- Modify: `web/src/app/(user)/cache/cache-view-model.test.mts`
- Modify: `web/src/services/api/project-cache.ts`
- Create: `web/src/app/(user)/cache/cache-selection-wiring.test.mts`

- [ ] **Step 1: Write failing selection tests**

Test that toggling all visible ready IDs preserves hidden selected IDs, toggling again removes only visible IDs, and pruning removes IDs absent from the current manifest.

```ts
assert.deepEqual([...toggleVisibleCacheSelection(new Set(["hidden"]), ["a", "b"])].sort(), ["a", "b", "hidden"]);
assert.deepEqual([...toggleVisibleCacheSelection(new Set(["a", "b", "hidden"]), ["a", "b"])], ["hidden"]);
assert.deepEqual([...pruneCacheSelection(new Set(["a", "gone"]), ["a"])], ["a"]);
```

- [ ] **Step 2: Run frontend tests and confirm RED**

Run: `cd web && node --experimental-strip-types 'src/app/(user)/cache/cache-view-model.test.mts'`

Expected: FAIL because the selection helpers do not exist.

- [ ] **Step 3: Implement helpers and API client**

Add pure Set-returning helpers to `cache-view-model.ts`. Add `downloadProjectCacheSelection(projectId, fileIds, token, filename)` to post to the selection endpoint, validate the ZIP end signature like the full-package client, and save the blob.

- [ ] **Step 4: Run frontend tests and confirm GREEN**

Run: `cd web && node --experimental-strip-types 'src/app/(user)/cache/cache-view-model.test.mts'`

Expected: PASS.

### Task 4: Cache selection UI and video generation context

**Files:**
- Modify: `web/src/app/(user)/cache/page.tsx`
- Modify: `web/src/app/(user)/cache/components/cache-file-grid.tsx`
- Modify: `web/src/app/(user)/cache/components/cache-file-preview-modal.tsx`
- Test: `web/src/app/(user)/cache/cache-selection-wiring.test.mts`

- [ ] **Step 1: Write failing wiring assertions**

Assert the cache page contains `selectedFileIds`, “全选当前结果”, “下载所选”, the grid accepts `selectedIds`/`onToggleSelect`, and the preview contains “生成提示词” plus a copy action.

- [ ] **Step 2: Run wiring test and confirm RED**

Run: `cd web && node --experimental-strip-types 'src/app/(user)/cache/cache-selection-wiring.test.mts'`

Expected: FAIL with missing selection and prompt UI markers.

- [ ] **Step 3: Implement the cache UI**

Use an Ant Design checkbox overlay on ready cards. Add a compact toolbar below filters with selected count, select-current, clear, and primary download button. Reset selection on project change, prune it after detail refresh, and keep it after download errors. For one selected item call `fetchProjectCacheFileBlob` and `saveAs`; for multiple call `downloadProjectCacheSelection`.

In the preview modal, keep the media area dominant and add a bordered prompt section only for video files. Render `context.prompt` with preserved whitespace, show optional model/provider tags, add a copy button, and show “该缓存未记录生成提示词” when empty.

- [ ] **Step 4: Run frontend focused tests and confirm GREEN**

Run:

```bash
cd web
node --experimental-strip-types 'src/app/(user)/cache/cache-view-model.test.mts'
node --experimental-strip-types 'src/app/(user)/cache/cache-selection-wiring.test.mts'
```

Expected: PASS.

### Task 5: Documentation and focused verification

**Files:**
- Modify: `docs/pending-test.md`
- Inspect: `docs/todo.md`

- [ ] **Step 1: Record user-testable changes**

Add acceptance items for selecting one/multiple filtered files, downloading only selected content, project-switch selection reset, and inspecting/copying recorded video prompts. Leave `docs/todo.md` unchanged because this task adds completed behavior rather than a roadmap item.

- [ ] **Step 2: Run focused verification**

Run:

```bash
go test ./service ./handler ./router -run 'ProjectCacheSelection|ProjectCacheRoutes' -count=1
cd web
node --experimental-strip-types 'src/app/(user)/cache/cache-view-model.test.mts'
node --experimental-strip-types 'src/app/(user)/cache/cache-selection-wiring.test.mts'
git diff --check -- service/project_cache_types.go service/project_cache_package.go service/project_cache_test.go handler/project_cache.go handler/project_cache_test.go router/router.go router/router_test.go web/src/services/api/project-cache.ts 'web/src/app/(user)/cache' docs/pending-test.md
```

Expected: all focused tests pass and `git diff --check` prints no output.
