# Cache Video Favorites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep cache asset names permanently visible and let users persistently favorite, filter, select, and download generated videos.

**Architecture:** Store the favorite flag beside each `ProjectCacheFile` in the existing per-user manifest, update it through one authenticated API, and feed the returned file back into the current page manifest. Reuse the existing cache filters and selection/download pipeline; the UI adds only a video star action, a favorite filter, and a stable two-line name area.

**Tech Stack:** Go, Gin, JSON project-cache manifests, Next.js App Router, React, TypeScript, Ant Design, Tailwind CSS, lucide-react, Node test runner.

---

## File map

- `service/project_cache_types.go`: add the persisted `favorite` field and carry it through archive input.
- `service/project_cache_store.go`: save favorite changes under the manifest lock and preserve the flag when moving a file.
- `service/project_cache_test.go`: prove persistence, idempotency, user isolation, and move preservation.
- `handler/project_cache.go`: decode the favorite request and return the updated cache file.
- `handler/project_cache_test.go`: prove authentication and the response envelope.
- `router/router.go`: register the authenticated favorite route.
- `router/router_test.go`: lock the route/auth boundary.
- `web/src/services/api/project-cache.ts`: expose the field and favorite API call.
- `web/src/app/(user)/cache/cache-view-model.ts`: compose the favorite-video filter with existing filters.
- `web/src/app/(user)/cache/cache-view-model.test.mts`: test filter combinations.
- `web/src/app/(user)/cache/components/cache-file-grid.tsx`: render the persistent title and video-only star action.
- `web/src/app/(user)/cache/page.tsx`: own favorite filter/request state and update the manifest from the server response.
- `web/src/app/(user)/cache/cache-selection-wiring.test.mts`: protect the favorite UI/API wiring and existing selection/download wiring.
- `docs/pending-test.md`: add the browser acceptance path without overwriting the existing uncommitted video-upscale entry.

### Task 1: Persist favorite state in project-cache manifests

**Files:**
- Modify: `service/project_cache_types.go:28-57`
- Modify: `service/project_cache_store.go:26-121,252-282`
- Test: `service/project_cache_test.go`

- [ ] **Step 1: Write failing service tests**

Add tests that archive a video, set it favorite twice, reload the manifest, reject a second user, cancel the favorite, and preserve the flag while moving an unassigned file:

```go
func TestSetUserProjectCacheFileFavoritePersistsAndSeparatesUsers(t *testing.T) {
	root := t.TempDir()
	archived, err := ArchiveProjectCacheFile(root, "u1", ProjectCacheArchiveInput{
		Context: ProjectCacheContext{ProjectID: "p1", ProjectName: "A"},
		Filename: "shot.mp4", MIMEType: "video/mp4", Reader: strings.NewReader("video"),
	})
	if err != nil {
		t.Fatal(err)
	}
	favorite, err := SetUserProjectCacheFileFavorite(root, "u1", archived.File.ID, true)
	if err != nil || !favorite.Favorite {
		t.Fatalf("favorite=%+v err=%v", favorite, err)
	}
	if _, err := SetUserProjectCacheFileFavorite(root, "u1", archived.File.ID, true); err != nil {
		t.Fatalf("idempotent favorite: %v", err)
	}
	manifest, _, err := GetUserProjectCache(root, "u1", "p1")
	if err != nil || len(manifest.Files) != 1 || !manifest.Files[0].Favorite {
		t.Fatalf("manifest=%+v err=%v", manifest, err)
	}
	if _, err := SetUserProjectCacheFileFavorite(root, "u2", archived.File.ID, false); err == nil {
		t.Fatal("other user changed favorite")
	}
	unfavorite, err := SetUserProjectCacheFileFavorite(root, "u1", archived.File.ID, false)
	if err != nil || unfavorite.Favorite {
		t.Fatalf("unfavorite=%+v err=%v", unfavorite, err)
	}
}

func TestMoveUserProjectCacheFilePreservesFavorite(t *testing.T) {
	root := t.TempDir()
	archived, err := ArchiveProjectCacheFile(root, "u1", ProjectCacheArchiveInput{
		Context: ProjectCacheContext{}, Filename: "shot.mp4", MIMEType: "video/mp4", Reader: strings.NewReader("video"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := SetUserProjectCacheFileFavorite(root, "u1", archived.File.ID, true); err != nil {
		t.Fatal(err)
	}
	moved, err := MoveUserProjectCacheFile(root, "u1", archived.File.ID, ProjectCacheContext{ProjectID: "p1", ProjectName: "A"})
	if err != nil || !moved.File.Favorite {
		t.Fatalf("moved=%+v err=%v", moved, err)
	}
}
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
go test ./service -run 'Test(SetUserProjectCacheFileFavoritePersistsAndSeparatesUsers|MoveUserProjectCacheFilePreservesFavorite)$' -count=1
```

Expected: compilation fails because `Favorite` and `SetUserProjectCacheFileFavorite` do not exist.

- [ ] **Step 3: Add the persisted fields**

Update the two types:

```go
type ProjectCacheFile struct {
	ID           string              `json:"id"`
	RelativePath string              `json:"relativePath"`
	OriginalName string              `json:"originalName"`
	MIMEType     string              `json:"mimeType"`
	SHA256       string              `json:"sha256"`
	Kind         string              `json:"kind"`
	Category     string              `json:"category"`
	CreatedAt    string              `json:"createdAt"`
	Bytes        int64               `json:"bytes"`
	Context      ProjectCacheContext `json:"context"`
	Status       string              `json:"status"`
	Favorite     bool                `json:"favorite"`
}

type ProjectCacheArchiveInput struct {
	Context  ProjectCacheContext
	Filename string
	MIMEType string
	Reader   io.Reader
	Favorite bool
}
```

Set `Favorite: input.Favorite` when constructing a new `ProjectCacheFile`. In `MoveUserProjectCacheFile`, pass `Favorite: item.Favorite` to `ArchiveProjectCacheFile`.

- [ ] **Step 4: Implement the locked, idempotent update**

Add this service function next to the existing project/file status mutations:

```go
func SetUserProjectCacheFileFavorite(root, userID, fileID string, favorite bool) (ProjectCacheFile, error) {
	path, _, _, err := findUserProjectCacheFile(root, userID, fileID)
	if err != nil {
		return ProjectCacheFile{}, err
	}
	lock := projectCacheLock(path)
	lock.Lock()
	defer lock.Unlock()
	manifest, err := ReadProjectCacheManifest(path)
	if err != nil {
		return ProjectCacheFile{}, err
	}
	for index := range manifest.Files {
		if manifest.Files[index].ID != fileID {
			continue
		}
		manifest.Files[index].Favorite = favorite
		manifest.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
		if err := writeProjectCacheManifest(path, manifest); err != nil {
			return ProjectCacheFile{}, err
		}
		return manifest.Files[index], nil
	}
	return ProjectCacheFile{}, safeMessageError{message: "缓存文件不存在"}
}
```

- [ ] **Step 5: Run service tests**

Run:

```bash
go test ./service -run 'Test(SetUserProjectCacheFileFavoritePersistsAndSeparatesUsers|MoveUserProjectCacheFilePreservesFavorite)$' -count=1
```

Expected: PASS.

- [ ] **Step 6: Commit only the service slice**

```bash
git add service/project_cache_types.go service/project_cache_store.go service/project_cache_test.go
git commit -m "feat: persist cache video favorites"
```

### Task 2: Expose the authenticated favorite API

**Files:**
- Modify: `handler/project_cache.go:81-130`
- Modify: `handler/project_cache_test.go`
- Modify: `router/router.go:232-242`
- Modify: `router/router_test.go`

- [ ] **Step 1: Write failing handler and route tests**

Add a handler test that calls the new action as the owner and checks the response, plus a router test that proves the route reaches authentication:

```go
func TestSetProjectCacheFileFavoriteUsesAuthenticatedUser(t *testing.T) {
	oldRoot := config.Cfg.ProjectCacheDir
	config.Cfg.ProjectCacheDir = t.TempDir()
	t.Cleanup(func() { config.Cfg.ProjectCacheDir = oldRoot })
	archived, err := service.ArchiveProjectCacheFile(config.Cfg.ProjectCacheDir, "u1", service.ProjectCacheArchiveInput{
		Context: service.ProjectCacheContext{ProjectID: "p1"}, Filename: "shot.mp4", MIMEType: "video/mp4", Reader: strings.NewReader("video"),
	})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/v1/project-cache/files/"+archived.File.ID+"/favorite", strings.NewReader(`{"favorite":true}`))
	request.Header.Set("Content-Type", "application/json")
	request = request.WithContext(service.WithUser(request.Context(), model.AuthUser{ID: "u1"}))
	response := httptest.NewRecorder()
	SetProjectCacheFileFavorite(response, request, archived.File.ID)
	if !bytes.Contains(response.Body.Bytes(), []byte(`"code":0`)) || !bytes.Contains(response.Body.Bytes(), []byte(`"favorite":true`)) {
		t.Fatalf("body=%s", response.Body.String())
	}
}

func TestProjectCacheFavoriteRouteRequiresAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)
	app := New()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/project-cache/files/file-1/favorite", strings.NewReader(`{"favorite":true}`))
	app.ServeHTTP(recorder, request)
	if recorder.Code == http.StatusNotFound || !strings.Contains(recorder.Body.String(), `"code":1001`) {
		t.Fatalf("favorite route missing auth: status=%d body=%s", recorder.Code, recorder.Body.String())
	}
}
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
go test ./handler ./router -run 'Test(SetProjectCacheFileFavoriteUsesAuthenticatedUser|ProjectCacheFavoriteRouteRequiresAuth)$' -count=1
```

Expected: compilation fails because the handler is missing, and the route test fails or cannot compile.

- [ ] **Step 3: Implement the handler**

Add:

```go
func SetProjectCacheFileFavorite(w http.ResponseWriter, r *http.Request, fileID string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input struct {
		Favorite bool `json:"favorite"`
	}
	if !decodeProjectCacheJSON(w, r, &input) {
		return
	}
	result, err := service.SetUserProjectCacheFileFavorite(config.Cfg.ProjectCacheDir, user.ID, fileID, input.Favorite)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}
```

- [ ] **Step 4: Register the route**

Place it beside the existing file move/delete routes:

```go
v1.POST("/project-cache/files/:id/favorite", func(c *gin.Context) {
	handler.SetProjectCacheFileFavorite(c.Writer, c.Request, c.Param("id"))
})
```

- [ ] **Step 5: Run handler and router tests**

Run:

```bash
go test ./handler ./router -run 'Test(SetProjectCacheFileFavoriteUsesAuthenticatedUser|ProjectCacheFavoriteRouteRequiresAuth)$' -count=1
```

Expected: PASS.

- [ ] **Step 6: Commit the API slice**

```bash
git add handler/project_cache.go handler/project_cache_test.go router/router.go router/router_test.go
git commit -m "feat: add cache favorite endpoint"
```

### Task 3: Add the frontend API contract and composed filter

**Files:**
- Modify: `web/src/services/api/project-cache.ts:7-90`
- Modify: `web/src/app/(user)/cache/cache-view-model.ts:13-21`
- Test: `web/src/app/(user)/cache/cache-view-model.test.mts`

- [ ] **Step 1: Write the failing filter test**

Extend the view-model fixture with `status` and `favorite`, then add:

```ts
test("favorite filter returns only ready favorite videos and composes with other filters", () => {
    const files = [
        { id: "favorite-video", originalName: "shot-01.mp4", kind: "video", category: "storyboard", status: "ready", favorite: true, context: { episodeId: "e1" } },
        { id: "plain-video", originalName: "shot-02.mp4", kind: "video", category: "storyboard", status: "ready", favorite: false, context: { episodeId: "e1" } },
        { id: "favorite-image", originalName: "hero.png", kind: "image", category: "character", status: "ready", favorite: true, context: { episodeId: "e1" } },
        { id: "missing-video", originalName: "lost.mp4", kind: "video", category: "storyboard", status: "missing", favorite: true, context: { episodeId: "e1" } },
    ];
    const result = filterProjectCacheFiles(files, { favoriteOnly: true, episodeId: "e1", category: "storyboard", keyword: "shot" });
    assert.deepEqual(result.map((item) => item.id), ["favorite-video"]);
});
```

- [ ] **Step 2: Run the view-model test and verify failure**

Run:

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/cache/cache-view-model.test.mts'
```

Expected: FAIL because `favoriteOnly` is not part of the filter contract.

- [ ] **Step 3: Extend the API type and request function**

Add `favorite: boolean` to `ProjectCacheFile`, then add:

```ts
export function setProjectCacheFileFavorite(fileId: string, favorite: boolean, token: string) {
    return apiPost<ProjectCacheFile>(`/api/v1/project-cache/files/${encodeURIComponent(fileId)}/favorite`, { favorite }, token);
}
```

- [ ] **Step 4: Implement the composed filter**

Use the existing filter order and add the favorite-video condition:

```ts
export function filterProjectCacheFiles<T extends { category: string; context: { episodeId?: string }; kind: string; originalName: string; id: string; status: string; favorite?: boolean }>(
    files: T[],
    filters: { episodeId?: string; category?: string; kind?: string; keyword?: string; favoriteOnly?: boolean },
) {
    const keyword = filters.keyword?.trim().toLowerCase() || "";
    return files.filter((item) => {
        if (filters.favoriteOnly && !(item.favorite && item.kind === "video" && item.status === "ready")) return false;
        if (filters.episodeId && item.context.episodeId !== filters.episodeId) return false;
        if (filters.category && item.category !== filters.category) return false;
        if (filters.kind && item.kind !== filters.kind) return false;
        return !keyword || `${item.originalName} ${item.id}`.toLowerCase().includes(keyword);
    });
}
```

Update existing test fixtures with `status: "ready"` and `favorite: false` so they satisfy the stronger generic contract.

- [ ] **Step 5: Run the view-model test**

Run:

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/cache/cache-view-model.test.mts'
```

Expected: all cache view-model tests PASS.

- [ ] **Step 6: Commit the frontend contract slice**

```bash
git add web/src/services/api/project-cache.ts 'web/src/app/(user)/cache/cache-view-model.ts' 'web/src/app/(user)/cache/cache-view-model.test.mts'
git commit -m "feat: filter favorite cache videos"
```

### Task 4: Wire the star action and persistent two-line title

**Files:**
- Modify: `web/src/app/(user)/cache/components/cache-file-grid.tsx:3-69`
- Modify: `web/src/app/(user)/cache/page.tsx:3-347`
- Test: `web/src/app/(user)/cache/cache-selection-wiring.test.mts`

- [ ] **Step 1: Add failing UI wiring assertions**

Extend the existing wiring test:

```ts
test("cache videos expose persistent favorites without replacing batch selection", () => {
    const page = read("./page.tsx");
    const grid = read("./components/cache-file-grid.tsx");
    const api = read("../../../services/api/project-cache.ts");
    assert.match(page, /favoriteOnly/);
    assert.match(page, /只看收藏视频/);
    assert.match(page, /setProjectCacheFileFavorite/);
    assert.match(grid, /file\.kind === "video"/);
    assert.match(grid, /aria-pressed/);
    assert.match(grid, /line-clamp-2/);
    assert.match(api, /\/favorite/);
    assert.match(grid, /Checkbox/);
    assert.match(page, /下载所选/);
});
```

- [ ] **Step 2: Run the wiring test and verify failure**

Run:

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/cache/cache-selection-wiring.test.mts'
```

Expected: FAIL on the missing favorite wiring.

- [ ] **Step 3: Add the video-only star to the card**

Import `Star` from `lucide-react`. Extend `CacheFileGrid` and `CacheFileCard` props with:

```ts
onToggleFavorite: (file: ProjectCacheFile) => void;
favoriteUpdatingIds: ReadonlySet<string>;
```

Render this beside the existing top-left checkbox, stopping propagation:

```tsx
{file.kind === "video" ? (
    <Button
        type="text"
        shape="circle"
        size="small"
        className="!absolute !right-2 !top-2 !z-10 !bg-[color-mix(in_srgb,var(--studio-panel-bg)_88%,transparent)] !text-[var(--studio-text-secondary)] backdrop-blur"
        icon={<Star className={`size-4 ${file.favorite ? "fill-current text-amber-400" : ""}`} />}
        disabled={missing || favoriteUpdatingIds.has(file.id)}
        loading={favoriteUpdatingIds.has(file.id)}
        aria-label={file.favorite ? `取消收藏 ${file.originalName || file.id}` : `收藏 ${file.originalName || file.id}`}
        aria-pressed={file.favorite}
        title={file.favorite ? "取消收藏" : "收藏视频"}
        onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite(file);
        }}
    />
) : null}
```

Replace the single-line title with a fixed two-line area:

```tsx
<div className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-[var(--studio-text-primary)]" title={file.originalName || file.id}>
    {file.originalName || file.id}
</div>
```

- [ ] **Step 4: Add page state, request handling, and filter control**

Import `Star` and `setProjectCacheFileFavorite`. Add:

```ts
const [favoriteOnly, setFavoriteOnly] = useState(false);
const [favoriteUpdatingIds, setFavoriteUpdatingIds] = useState<Set<string>>(() => new Set());
```

Pass `favoriteOnly` into `filterProjectCacheFiles` and include it in the memo dependencies. Reset it when switching projects.

Add the request action:

```ts
const toggleFavorite = async (file: ProjectCacheFile) => {
    if (!token || file.kind !== "video" || file.status !== "ready") return;
    setFavoriteUpdatingIds((current) => new Set(current).add(file.id));
    try {
        const updated = await setProjectCacheFileFavorite(file.id, !file.favorite, token);
        setManifest((current) => current ? { ...current, files: current.files.map((item) => item.id === updated.id ? updated : item) } : current);
    } catch (error) {
        message.error(error instanceof Error ? error.message : "收藏状态保存失败");
    } finally {
        setFavoriteUpdatingIds((current) => {
            const next = new Set(current);
            next.delete(file.id);
            return next;
        });
    }
};
```

Place this button beside the existing type filter:

```tsx
<Button
    type={favoriteOnly ? "primary" : "default"}
    icon={<Star className={`size-4 ${favoriteOnly ? "fill-current" : ""}`} />}
    onClick={() => setFavoriteOnly((value) => !value)}
>
    只看收藏视频
</Button>
```

Pass `onToggleFavorite={toggleFavorite}` and `favoriteUpdatingIds={favoriteUpdatingIds}` to `CacheFileGrid`. Keep all existing selection and download props unchanged.

- [ ] **Step 5: Run the cache frontend tests**

Run:

```bash
cd web && node --experimental-strip-types --test \
  'src/app/(user)/cache/cache-view-model.test.mts' \
  'src/app/(user)/cache/cache-selection-wiring.test.mts'
```

Expected: all tests PASS.

- [ ] **Step 6: Commit the UI slice**

```bash
git add 'web/src/app/(user)/cache/components/cache-file-grid.tsx' 'web/src/app/(user)/cache/page.tsx' 'web/src/app/(user)/cache/cache-selection-wiring.test.mts'
git commit -m "feat: favorite cached videos"
```

### Task 5: Document and verify the complete change

**Files:**
- Modify: `docs/pending-test.md` under `### 缓存文件卡片与安全预览`
- Check: `docs/todo.md`

- [ ] **Step 1: Add the acceptance entry**

Add one bullet without altering the existing video-upscale edits already present in the file:

```markdown
- 缓存视频卡右上角新增长期收藏星标，收藏状态写入当前用户的项目缓存清单；刷新、重启和移动未归属缓存后仍保留。筛选区可“只看收藏视频”，并继续使用“全选当前结果 / 下载所选”。素材名称固定显示两行，图片与音频不显示收藏入口。
```

- [ ] **Step 2: Check the roadmap**

Read `docs/todo.md`. This feature closes a small cache usability gap and does not add or complete a roadmap milestone, so leave `docs/todo.md` unchanged.

- [ ] **Step 3: Run focused backend and frontend verification**

Run:

```bash
go test ./service ./handler ./router -run 'ProjectCache|SetUserProjectCacheFileFavorite' -count=1
cd web && node --experimental-strip-types --test \
  'src/app/(user)/cache/cache-view-model.test.mts' \
  'src/app/(user)/cache/cache-selection-wiring.test.mts'
```

Expected: all focused tests PASS.

- [ ] **Step 4: Run formatting and patch checks**

Run:

```bash
gofmt -w service/project_cache_types.go service/project_cache_store.go service/project_cache_test.go handler/project_cache.go handler/project_cache_test.go router/router.go router/router_test.go
git diff --check
git status --short
```

Expected: no `git diff --check` output. `git status` still shows the pre-existing video-upscale/Docker changes plus this task's `docs/pending-test.md` change; no unrelated file is added by this feature.

- [ ] **Step 5: Perform the cache-page smoke test**

With the existing development services running:

1. Open `/cache` and choose a project containing at least two generated videos.
2. Confirm each filename is visible in a stable two-line area without hover.
3. Favorite one video and confirm its star fills while image/audio cards have no star.
4. Refresh the page and confirm the star remains filled.
5. Enable “只看收藏视频” and confirm only ready favorite videos remain.
6. Click “全选当前结果”, then confirm the selected count and “下载所选” use the existing workflow.
7. For an unassigned favorite video, move it into a project and confirm the favorite survives.
8. Check the browser console for errors.

- [ ] **Step 6: Preserve the dirty-worktree boundary**

Do not stage `Dockerfile`, video-upscale service/tests, `web/src/lib/dreamina-docker-build-contract.test.mts`, or `web/src/lib/video-tools-docker-contract.test.mts` as part of this feature. Because `docs/pending-test.md` already contains an unrelated uncommitted video-upscale edit, leave its combined documentation change unstaged until the final release integration instead of creating a misleading cache-only documentation commit.
