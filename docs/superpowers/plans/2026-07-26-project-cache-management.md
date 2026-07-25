# Project Cache Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically persist generated media into user- and project-scoped local disk folders, expose a global cache manager, and stream complete project ZIP packages without adding cloud storage or a cache database.

**Architecture:** The Go service owns a portable filesystem layout and atomically updated `manifest.json` files under `PROJECT_CACHE_DIR`. The browser keeps its current IndexedDB copies, submits generated blobs and project context through authenticated APIs, and records failed uploads in a user-scoped local retry queue. `/cache` reads backend summaries and local project snapshots, while project detail links into the same page with a project filter.

**Tech Stack:** Go 1.25, Gin, Go `archive/zip`/`crypto/sha256`, Next.js App Router, React 19, TypeScript, Ant Design, Tailwind, Zustand, localforage.

---

## File map

### Backend

- Modify `config/config.go`: add and normalize `PROJECT_CACHE_DIR`.
- Create `service/project_cache_types.go`: public request/response and manifest types.
- Create `service/project_cache_paths.go`: safe display segments, stable hashes, project scope paths and MIME/category normalization.
- Create `service/project_cache_store.go`: atomic archive, manifest read/write, list, status, move and delete operations.
- Create `service/project_cache_package.go`: package preflight and streaming ZIP writer.
- Create `service/project_cache_store_test.go`: filesystem, dedupe, user isolation and consistency tests.
- Create `service/project_cache_package_test.go`: package manifest and missing-file tests.
- Create `handler/project_cache.go`: authenticated multipart/JSON handlers and raw file/ZIP responses.
- Create `handler/project_cache_test.go`: handler auth/response tests.
- Modify `router/router.go`: register project-cache routes and retire new use of the flat canvas cache endpoint.

### Frontend data and integration

- Create `web/src/services/api/project-cache.ts`: API types and request functions.
- Create `web/src/services/project-cache-archive.ts`: convert generated assets/files into cache uploads without coupling components to multipart details.
- Create `web/src/stores/use-project-cache-queue-store.ts`: persisted retry metadata.
- Create `web/src/hooks/use-project-cache-queue-runner.ts`: retry pending local Blob uploads after login.
- Create `web/src/services/project-cache-context.ts`: pure classification and context normalization.
- Create `web/src/services/project-cache-context.test.mts`: context/category tests.
- Create `web/src/services/project-cache-snapshot.ts`: build package metadata from existing local stores.
- Create `web/src/services/project-cache-snapshot.test.mts`: project-scoping tests.
- Modify `web/src/app/(user)/canvas/hooks/use-canvas-generated-asset-archive.ts`: enqueue image/video cache after local asset archive.
- Modify `web/src/app/(user)/canvas/hooks/use-canvas-media-cache.ts`: route generated/imported video/audio through project cache and keep failures non-fatal.
- Modify `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`: pass current project/episode/canvas context.
- Modify `web/src/app/(user)/image/page.tsx`: cache successful direct-tool images, using source project context or `unassigned`.
- Modify `web/src/app/(user)/user-layout-client.tsx`: mount the retry runner after account-scoped storage is ready.
- Modify `web/src/app/(user)/canvas/types.ts`: add structured project-cache metadata.

### Cache manager UI and docs

- Create `web/src/app/(user)/cache/cache-view-model.ts`: summary, filters and deleted/orphan status merge.
- Create `web/src/app/(user)/cache/cache-view-model.test.mts`: filter and status tests.
- Create `web/src/app/(user)/cache/components/cache-project-list.tsx`: global project rail.
- Create `web/src/app/(user)/cache/components/cache-file-table.tsx`: classified file list.
- Create `web/src/app/(user)/cache/page.tsx`: global cache center and destructive confirmations.
- Modify `web/src/constant/navigation-tools.ts`: add “缓存管理”.
- Modify `web/src/app/(user)/user-layout-client.tsx`: treat `/cache` as a workspace page.
- Modify `web/src/app/(user)/projects/[id]/components/project-episode-board.tsx`: add one project-cache shortcut prop/button.
- Modify `web/src/app/(user)/projects/[id]/page.tsx`: route shortcut to `/cache?projectId=${encodeURIComponent(project.id)}`.
- Modify `web/src/app/(user)/projects/page.tsx`: mark disk cache deleted after local project deletion without deleting files.
- Modify `docs/pending-test.md`: add the actual cache-management acceptance entry.
- Modify `docs/todo.md`: record that no cloud-storage milestone moved and that this local-cache item is implemented pending test.
- Modify `.env.example` and deployment examples that already list `PUBLIC_ASSET_DIR`: document `PROJECT_CACHE_DIR`.

### Dirty-worktree rule

The current branch already contains user changes in the project, canvas, asset and documentation files above. Before every patch, inspect the exact current hunk. Never restore or rewrite those files wholesale. Do not stage or commit an already-modified file unless its pre-existing user changes have been intentionally included by the user; use exact-path commits only for newly created/unmodified files.

---

### Task 1: Cache configuration and safe paths

**Files:**
- Modify: `config/config.go`
- Create: `service/project_cache_types.go`
- Create: `service/project_cache_paths.go`
- Test: `service/project_cache_store_test.go`

- [ ] **Step 1: Write the failing safe-path tests**

Add tests that call the not-yet-implemented path helpers:

```go
func TestProjectCacheScopePathIsStableAndSafe(t *testing.T) {
    root := t.TempDir()
    got := projectCacheScopePath(root, "user/../1", ProjectCacheContext{
        ProjectID: "project/a", ProjectName: "东海人鱼国 / 第一季",
    })
    if !strings.HasPrefix(got, root+string(os.PathSeparator)) { t.Fatalf("path escaped root: %s", got) }
    if strings.Contains(filepath.Base(got), "/") || strings.Contains(filepath.Base(got), "..") { t.Fatalf("unsafe path: %s", got) }
    if got != projectCacheScopePath(root, "user/../1", ProjectCacheContext{ProjectID: "project/a", ProjectName: "东海人鱼国 / 第一季"}) { t.Fatal("path is not stable") }
}

func TestProjectCacheRelativeDirectoryUsesProductionContext(t *testing.T) {
    tests := []struct { name string; input ProjectCacheContext; want string }{
        {"shared", ProjectCacheContext{ProjectID: "p", Category: "character"}, filepath.Join("shared", "character", "images")},
        {"episode", ProjectCacheContext{ProjectID: "p", EpisodeID: "e1", EpisodeName: "第01集", Category: "storyboard"}, filepath.Join("episodes", safeNamedID("第01集", "e1"), "storyboard", "videos")},
        {"free", ProjectCacheContext{ProjectID: "p", CanvasID: "c1", CanvasName: "灵感板", Category: "other", FreeCanvas: true}, filepath.Join("free-canvas", safeNamedID("灵感板", "c1"), "videos")},
        {"unassigned", ProjectCacheContext{}, "videos"},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            if got := projectCacheRelativeDirectory(tt.input, tt.want[strings.LastIndex(tt.want, string(os.PathSeparator))+1:]); got != tt.want { t.Fatalf("got %q want %q", got, tt.want) }
        })
    }
}
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `go test ./service -run 'TestProjectCache(ScopePath|RelativeDirectory)'`

Expected: compile failure because `ProjectCacheContext`, `projectCacheScopePath`, `safeNamedID`, and `projectCacheRelativeDirectory` do not exist.

- [ ] **Step 3: Add configuration, types and minimal path implementation**

Add to `Config` and normalize in `Load`:

```go
ProjectCacheDir string `env:"PROJECT_CACHE_DIR" envDefault:"data/project-cache"`
```

Define the stable contracts:

```go
const ProjectCacheFormatVersion = 1

type ProjectCacheContext struct {
    ProjectID string `json:"projectId"`
    ProjectName string `json:"projectName"`
    EpisodeID string `json:"episodeId"`
    EpisodeName string `json:"episodeName"`
    CanvasID string `json:"canvasId"`
    CanvasName string `json:"canvasName"`
    NodeID string `json:"nodeId"`
    AssetID string `json:"assetId"`
    VersionID string `json:"versionId"`
    Source string `json:"source"`
    Category string `json:"category"`
    Prompt string `json:"prompt"`
    Model string `json:"model"`
    Provider string `json:"provider"`
    FreeCanvas bool `json:"freeCanvas"`
}

type ProjectCacheFile struct {
    ID string `json:"id"`
    RelativePath string `json:"relativePath"`
    OriginalName string `json:"originalName"`
    MIMEType string `json:"mimeType"`
    SHA256 string `json:"sha256"`
    Kind string `json:"kind"`
    Category string `json:"category"`
    CreatedAt string `json:"createdAt"`
    Bytes int64 `json:"bytes"`
    Context ProjectCacheContext `json:"context"`
    Status string `json:"status"`
}

type ProjectCacheManifest struct {
    FormatVersion int `json:"formatVersion"`
    ProjectID string `json:"projectId"`
    ProjectName string `json:"projectName"`
    Status string `json:"status"`
    CreatedAt string `json:"createdAt"`
    UpdatedAt string `json:"updatedAt"`
    Files []ProjectCacheFile `json:"files"`
}
```

Implement `stableSegmentHash`, `safeDisplaySegment`, `safeNamedID`, `projectCacheUserRoot`, `projectCacheScopePath`, `normalizeProjectCacheCategory`, `projectCacheKindFromMIME`, and `projectCacheRelativeDirectory`. Preserve Unicode letters/numbers, replace punctuation with `-`, cap display segments at 48 runes, and use the first 12 hex SHA-256 characters for stable suffixes.

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `go test ./service -run 'TestProjectCache(ScopePath|RelativeDirectory)'`

Expected: PASS.

- [ ] **Step 5: Commit only the new/unmodified backend foundation files**

```bash
git add config/config.go service/project_cache_types.go service/project_cache_paths.go service/project_cache_store_test.go
git commit -m "feat: define project cache filesystem layout"
```

---

### Task 2: Atomic media archive and manifest consistency

**Files:**
- Create: `service/project_cache_store.go`
- Modify: `service/project_cache_store_test.go`

- [ ] **Step 1: Write failing archive, dedupe and concurrency tests**

Test the public API with real temporary files:

```go
func TestArchiveProjectCacheFileWritesMediaAndManifest(t *testing.T) {
    root := t.TempDir()
    result, err := ArchiveProjectCacheFile(root, "user-1", ProjectCacheArchiveInput{
        Context: ProjectCacheContext{ProjectID: "p1", ProjectName: "东海人鱼国", EpisodeID: "e1", EpisodeName: "第01集", Category: "storyboard", NodeID: "node-1"},
        Filename: "shot.mp4", MIMEType: "video/mp4", Reader: strings.NewReader("video-bytes"),
    })
    if err != nil { t.Fatal(err) }
    if result.File.Kind != "video" || result.File.SHA256 == "" { t.Fatalf("unexpected result: %#v", result) }
    if _, err := os.Stat(filepath.Join(result.ProjectPath, result.File.RelativePath)); err != nil { t.Fatal(err) }
    manifest, err := ReadProjectCacheManifest(result.ManifestPath)
    if err != nil || len(manifest.Files) != 1 { t.Fatalf("manifest=%#v err=%v", manifest, err) }
}

func TestArchiveProjectCacheFileDeduplicatesSameReference(t *testing.T) {
    root := t.TempDir()
    input := ProjectCacheArchiveInput{Context: ProjectCacheContext{ProjectID: "p1", NodeID: "n1"}, Filename: "image.png", MIMEType: "image/png"}
    input.Reader = strings.NewReader("same")
    first, err := ArchiveProjectCacheFile(root, "u1", input)
    if err != nil { t.Fatal(err) }
    input.Reader = strings.NewReader("same")
    second, err := ArchiveProjectCacheFile(root, "u1", input)
    if err != nil { t.Fatal(err) }
    if first.File.ID != second.File.ID { t.Fatalf("duplicate IDs %q %q", first.File.ID, second.File.ID) }
    manifest, _ := ReadProjectCacheManifest(first.ManifestPath)
    if len(manifest.Files) != 1 { t.Fatalf("files=%d", len(manifest.Files)) }
}

func TestArchiveProjectCacheFileKeepsDistinctVersions(t *testing.T) {
    root := t.TempDir()
    ids := map[string]bool{}
    for _, version := range []string{"v1", "v2"} {
        result, err := ArchiveProjectCacheFile(root, "u1", ProjectCacheArchiveInput{Context: ProjectCacheContext{ProjectID: "p1", NodeID: "n1", VersionID: version}, Filename: "image.png", MIMEType: "image/png", Reader: strings.NewReader("same")})
        if err != nil { t.Fatal(err) }
        ids[result.File.ID] = true
    }
    if len(ids) != 2 { t.Fatalf("version references collapsed: %#v", ids) }
}

func TestArchiveProjectCacheFileConcurrentWritesRemainReadable(t *testing.T) {
    root := t.TempDir()
    var wg sync.WaitGroup
    errs := make(chan error, 20)
    for index := 0; index < 20; index++ {
        wg.Add(1)
        go func(index int) {
            defer wg.Done()
            _, err := ArchiveProjectCacheFile(root, "u1", ProjectCacheArchiveInput{Context: ProjectCacheContext{ProjectID: "p1", NodeID: fmt.Sprintf("n-%d", index)}, Filename: "image.png", MIMEType: "image/png", Reader: strings.NewReader(fmt.Sprintf("image-%d", index))})
            errs <- err
        }(index)
    }
    wg.Wait()
    close(errs)
    for err := range errs { if err != nil { t.Fatal(err) } }
    manifestPath := filepath.Join(projectCacheScopePath(root, "u1", ProjectCacheContext{ProjectID: "p1"}), "manifest.json")
    manifest, err := ReadProjectCacheManifest(manifestPath)
    if err != nil || len(manifest.Files) != 20 { t.Fatalf("manifest=%#v err=%v", manifest, err) }
}

func TestArchiveProjectCacheFileSeparatesUsers(t *testing.T) {
    root := t.TempDir()
    input := ProjectCacheArchiveInput{Context: ProjectCacheContext{ProjectID: "p1"}, Filename: "image.png", MIMEType: "image/png"}
    input.Reader = strings.NewReader("a")
    first, _ := ArchiveProjectCacheFile(root, "u1", input)
    input.Reader = strings.NewReader("a")
    second, _ := ArchiveProjectCacheFile(root, "u2", input)
    if first.ProjectPath == second.ProjectPath { t.Fatalf("shared user directory: %s", first.ProjectPath) }
}
```

- [ ] **Step 2: Run the archive tests and verify RED**

Run: `go test ./service -run 'TestArchiveProjectCacheFile'`

Expected: compile failure because archive functions and inputs are undefined.

- [ ] **Step 3: Implement atomic archive**

Add:

```go
type ProjectCacheArchiveInput struct {
    Context ProjectCacheContext
    Filename, MIMEType string
    Reader io.Reader
}

type ProjectCacheArchiveResult struct {
    File ProjectCacheFile `json:"file"`
    ProjectPath string `json:"projectPath"`
    ManifestPath string `json:"manifestPath"`
}

func ArchiveProjectCacheFile(root, userID string, input ProjectCacheArchiveInput) (ProjectCacheArchiveResult, error)
func ReadProjectCacheManifest(path string) (ProjectCacheManifest, error)
```

Use a keyed mutex per user/project scope. Stream the upload to `.<id>.tmp`, calculate SHA-256 through `io.MultiWriter`, validate non-zero bytes and the detected media kind, `os.Rename` to the final file, append/merge the manifest, then write `manifest.json.tmp` and rename it. If manifest writing fails, remove only the newly created file. Dedupe when checksum plus `NodeID/AssetID/VersionID/Source` match; retain separate manifest references for distinct versions.

- [ ] **Step 4: Run archive tests and verify GREEN**

Run: `go test ./service -run 'TestArchiveProjectCacheFile'`

Expected: PASS, including the race-safe manifest read after concurrent writes.

- [ ] **Step 5: Commit**

```bash
git add service/project_cache_store.go service/project_cache_store_test.go
git commit -m "feat: archive project media atomically"
```

---

### Task 3: Cache listing, status, move and explicit deletion

**Files:**
- Modify: `service/project_cache_types.go`
- Modify: `service/project_cache_store.go`
- Modify: `service/project_cache_store_test.go`

- [ ] **Step 1: Write failing management tests**

```go
func TestListUserProjectCachesReportsMissingFilesWithoutBlockingOtherProjects(t *testing.T) {
    root := t.TempDir()
    first, _ := ArchiveProjectCacheFile(root, "u1", ProjectCacheArchiveInput{Context: ProjectCacheContext{ProjectID: "p1", ProjectName: "A"}, Filename: "a.png", MIMEType: "image/png", Reader: strings.NewReader("a")})
    _, _ = ArchiveProjectCacheFile(root, "u1", ProjectCacheArchiveInput{Context: ProjectCacheContext{ProjectID: "p2", ProjectName: "B"}, Filename: "b.png", MIMEType: "image/png", Reader: strings.NewReader("b")})
    if err := os.Remove(filepath.Join(first.ProjectPath, first.File.RelativePath)); err != nil { t.Fatal(err) }
    list, err := ListUserProjectCaches(root, "u1")
    if err != nil || len(list.Projects) != 2 { t.Fatalf("list=%#v err=%v", list, err) }
    if list.Projects[0].MissingCount+list.Projects[1].MissingCount != 1 { t.Fatalf("missing not reported: %#v", list.Projects) }
}

func TestSetProjectCacheStatusDoesNotDeleteFiles(t *testing.T) {
    root := t.TempDir()
    archived, _ := ArchiveProjectCacheFile(root, "u1", ProjectCacheArchiveInput{Context: ProjectCacheContext{ProjectID: "p1"}, Filename: "a.png", MIMEType: "image/png", Reader: strings.NewReader("a")})
    manifest, err := SetUserProjectCacheStatus(root, "u1", "p1", "deleted")
    if err != nil || manifest.Status != "deleted" { t.Fatalf("manifest=%#v err=%v", manifest, err) }
    if _, err := os.Stat(filepath.Join(archived.ProjectPath, archived.File.RelativePath)); err != nil { t.Fatal(err) }
}

func TestMoveUnassignedCacheFileMovesMediaAndManifestReference(t *testing.T) {
    root := t.TempDir()
    archived, _ := ArchiveProjectCacheFile(root, "u1", ProjectCacheArchiveInput{Context: ProjectCacheContext{}, Filename: "a.png", MIMEType: "image/png", Reader: strings.NewReader("a")})
    moved, err := MoveUserProjectCacheFile(root, "u1", archived.File.ID, ProjectCacheContext{ProjectID: "p1", ProjectName: "A", EpisodeID: "e1", EpisodeName: "第01集", Category: "character"})
    if err != nil || moved.Context.ProjectID != "p1" { t.Fatalf("moved=%#v err=%v", moved, err) }
    oldManifest, _ := ReadProjectCacheManifest(archived.ManifestPath)
    if len(oldManifest.Files) != 0 { t.Fatalf("old reference remains: %#v", oldManifest.Files) }
}

func TestDeleteProjectCacheRequiresExactUserScope(t *testing.T) {
    root := t.TempDir()
    archived, _ := ArchiveProjectCacheFile(root, "u1", ProjectCacheArchiveInput{Context: ProjectCacheContext{ProjectID: "p1"}, Filename: "a.png", MIMEType: "image/png", Reader: strings.NewReader("a")})
    if err := DeleteUserProjectCache(root, "u2", "p1"); err == nil { t.Fatal("other user deleted cache") }
    if _, err := os.Stat(archived.ProjectPath); err != nil { t.Fatal(err) }
}
```

- [ ] **Step 2: Run and verify RED**

Run: `go test ./service -run 'Test(ListUserProjectCaches|SetProjectCacheStatus|MoveUnassignedCacheFile|DeleteProjectCache)'`

Expected: compile failure for missing management functions.

- [ ] **Step 3: Implement management APIs**

Define:

```go
type ProjectCacheSummary struct {
    ProjectID string `json:"projectId"`
    ProjectName string `json:"projectName"`
    Status string `json:"status"`
    Path string `json:"path"`
    UpdatedAt string `json:"updatedAt"`
    Bytes int64 `json:"bytes"`
    FileCount int `json:"fileCount"`
    MissingCount int `json:"missingCount"`
}

type UserProjectCacheList struct {
    RootPath string `json:"rootPath"`
    TotalBytes int64 `json:"totalBytes"`
    TotalFiles int `json:"totalFiles"`
    PendingCount int `json:"pendingCount"`
    Projects []ProjectCacheSummary `json:"projects"`
}
```

Implement `ListUserProjectCaches`, `GetUserProjectCache`, `SetUserProjectCacheStatus`, `MoveUserProjectCacheFile`, `DeleteUserProjectCacheFile`, and `DeleteUserProjectCache`. Resolve all targets by scanning manifests inside the authenticated user's hashed root; never accept a filesystem path from the request. Mark missing manifest references with `Status="missing"`; report untracked files as a consistency warning but do not delete them.

- [ ] **Step 4: Run and verify GREEN**

Run: `go test ./service -run 'Test(ListUserProjectCaches|SetProjectCacheStatus|MoveUnassignedCacheFile|DeleteProjectCache)'`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add service/project_cache_types.go service/project_cache_store.go service/project_cache_store_test.go
git commit -m "feat: manage project cache manifests"
```

---

### Task 4: Complete project package streaming

**Files:**
- Create: `service/project_cache_package.go`
- Test: `service/project_cache_package_test.go`

- [ ] **Step 1: Write failing package tests**

```go
func TestWriteProjectCachePackageIncludesMetadataMediaAndChecksums(t *testing.T) {
    root := t.TempDir()
    // Archive one image and build a snapshot with project/canvases/scripts/storyboards/assets.
    var output bytes.Buffer
    result, err := WriteProjectCachePackage(&output, root, "user-1", ProjectCachePackageInput{ProjectID: "p1", Snapshot: ProjectCachePackageSnapshot{Project: json.RawMessage(`{"id":"p1"}`), Canvases: json.RawMessage(`[]`), Scripts: json.RawMessage(`[]`), Storyboards: json.RawMessage(`[]`), Assets: json.RawMessage(`[]`)}})
    if err != nil { t.Fatal(err) }
    zr, err := zip.NewReader(bytes.NewReader(output.Bytes()), int64(output.Len()))
    if err != nil { t.Fatal(err) }
    names := zipEntryNames(zr.File)
    for _, name := range []string{"package-manifest.json", "metadata/project.json", "metadata/canvases.json", "metadata/scripts.json", "metadata/storyboards.json", "metadata/assets.json"} {
        if !names[name] { t.Fatalf("missing %s", name) }
    }
    if result.Filename == "" { t.Fatal("missing filename") }
}

func TestProjectCachePackagePreflightReportsMissingMedia(t *testing.T) {
    root := t.TempDir()
    archived, _ := ArchiveProjectCacheFile(root, "u1", ProjectCacheArchiveInput{Context: ProjectCacheContext{ProjectID: "p1"}, Filename: "a.png", MIMEType: "image/png", Reader: strings.NewReader("a")})
    if err := os.Remove(filepath.Join(archived.ProjectPath, archived.File.RelativePath)); err != nil { t.Fatal(err) }
    result, err := PreflightProjectCachePackage(root, "u1", "p1")
    if err != nil || len(result.Missing) != 1 || result.Missing[0] != archived.File.RelativePath { t.Fatalf("result=%#v err=%v", result, err) }
}

func TestWriteProjectCachePackageRejectsMissingMediaWithoutContinueFlag(t *testing.T) {
    root := t.TempDir()
    archived, _ := ArchiveProjectCacheFile(root, "u1", ProjectCacheArchiveInput{Context: ProjectCacheContext{ProjectID: "p1"}, Filename: "a.png", MIMEType: "image/png", Reader: strings.NewReader("a")})
    _ = os.Remove(filepath.Join(archived.ProjectPath, archived.File.RelativePath))
    var output bytes.Buffer
    _, err := WriteProjectCachePackage(&output, root, "u1", ProjectCachePackageInput{ProjectID: "p1", Snapshot: ProjectCachePackageSnapshot{}, ContinueOnMissing: false})
    if err == nil || output.Len() != 0 { t.Fatalf("err=%v bytes=%d", err, output.Len()) }
}
```

- [ ] **Step 2: Run and verify RED**

Run: `go test ./service -run 'Test(WriteProjectCachePackage|ProjectCachePackagePreflight)'`

Expected: compile failure for missing package functions.

- [ ] **Step 3: Implement preflight and streaming ZIP**

Define a typed snapshot instead of accepting arbitrary path-bearing JSON:

```go
type ProjectCachePackageSnapshot struct {
    Project json.RawMessage `json:"project"`
    Canvases json.RawMessage `json:"canvases"`
    Scripts json.RawMessage `json:"scripts"`
    Storyboards json.RawMessage `json:"storyboards"`
    Assets json.RawMessage `json:"assets"`
}

type ProjectCachePackageInput struct {
    ProjectID string
    Snapshot ProjectCachePackageSnapshot
    ContinueOnMissing bool
}

type ProjectCachePackagePreflight struct {
    Missing []string `json:"missing"`
    FileCount int `json:"fileCount"`
    Bytes int64 `json:"bytes"`
}
```

Implement `PreflightProjectCachePackage(root, userID, projectID string) (ProjectCachePackagePreflight, error)` and `WriteProjectCachePackage(writer io.Writer, root, userID string, input ProjectCachePackageInput) (ProjectCachePackageResult, error)`. Use `archive/zip`, `io.Copy`, relative manifest paths only, and a package manifest containing format/app version, export time, media hashes and missing warnings. Do not build an in-memory copy of media or save a second ZIP on disk.

- [ ] **Step 4: Run and verify GREEN**

Run: `go test ./service -run 'Test(WriteProjectCachePackage|ProjectCachePackagePreflight)'`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add service/project_cache_package.go service/project_cache_package_test.go
git commit -m "feat: stream complete project cache packages"
```

---

### Task 5: Authenticated handlers and routes

**Files:**
- Create: `handler/project_cache.go`
- Create: `handler/project_cache_test.go`
- Modify: `router/router.go`

- [ ] **Step 1: Write failing handler tests**

```go
func TestProjectCacheUploadUsesAuthenticatedUser(t *testing.T) {
    oldRoot := config.Cfg.ProjectCacheDir
    config.Cfg.ProjectCacheDir = t.TempDir()
    t.Cleanup(func() { config.Cfg.ProjectCacheDir = oldRoot })
    var body bytes.Buffer
    writer := multipart.NewWriter(&body)
    part, _ := writer.CreateFormFile("file", "a.png")
    _, _ = part.Write([]byte("png"))
    _ = writer.WriteField("context", `{"projectId":"p1","projectName":"A"}`)
    _ = writer.Close()
    request := httptest.NewRequest(http.MethodPost, "/api/v1/project-cache/files", &body)
    request.Header.Set("Content-Type", writer.FormDataContentType())
    request = request.WithContext(service.WithUser(request.Context(), model.AuthUser{ID: "u1"}))
    response := httptest.NewRecorder()
    UploadProjectCacheFile(response, request)
    if response.Code != http.StatusOK || !bytes.Contains(response.Body.Bytes(), []byte(`"code":0`)) { t.Fatalf("status=%d body=%s", response.Code, response.Body.String()) }
}

func TestProjectCacheUploadRejectsAnonymousRequest(t *testing.T) {
    request := httptest.NewRequest(http.MethodPost, "/api/v1/project-cache/files", nil)
    response := httptest.NewRecorder()
    UploadProjectCacheFile(response, request)
    if !bytes.Contains(response.Body.Bytes(), []byte("未登录")) { t.Fatalf("body=%s", response.Body.String()) }
}

func TestProjectCacheFileCannotBeReadByAnotherUser(t *testing.T) {
    oldRoot := config.Cfg.ProjectCacheDir
    config.Cfg.ProjectCacheDir = t.TempDir()
    t.Cleanup(func() { config.Cfg.ProjectCacheDir = oldRoot })
    archived, _ := service.ArchiveProjectCacheFile(config.Cfg.ProjectCacheDir, "u1", service.ProjectCacheArchiveInput{Context: service.ProjectCacheContext{ProjectID: "p1"}, Filename: "a.png", MIMEType: "image/png", Reader: strings.NewReader("a")})
    request := httptest.NewRequest(http.MethodGet, "/api/v1/project-cache/files/"+archived.File.ID, nil)
    request = request.WithContext(service.WithUser(request.Context(), model.AuthUser{ID: "u2"}))
    response := httptest.NewRecorder()
    ProjectCacheFile(response, request, archived.File.ID)
    if response.Code == http.StatusOK { t.Fatalf("other user read file: %s", response.Body.String()) }
}

func TestProjectCachePackageReturnsZipHeaders(t *testing.T) {
    oldRoot := config.Cfg.ProjectCacheDir
    config.Cfg.ProjectCacheDir = t.TempDir()
    t.Cleanup(func() { config.Cfg.ProjectCacheDir = oldRoot })
    _, _ = service.ArchiveProjectCacheFile(config.Cfg.ProjectCacheDir, "u1", service.ProjectCacheArchiveInput{Context: service.ProjectCacheContext{ProjectID: "p1", ProjectName: "A"}, Filename: "a.png", MIMEType: "image/png", Reader: strings.NewReader("a")})
    request := httptest.NewRequest(http.MethodPost, "/api/v1/project-cache/projects/p1/package", strings.NewReader(`{"snapshot":{"project":{},"canvases":[],"scripts":{},"storyboards":{},"assets":[]}}`))
    request.Header.Set("Content-Type", "application/json")
    request = request.WithContext(service.WithUser(request.Context(), model.AuthUser{ID: "u1"}))
    response := httptest.NewRecorder()
    DownloadProjectCachePackage(response, request, "p1")
    if response.Header().Get("Content-Type") != "application/zip" || !strings.Contains(response.Header().Get("Content-Disposition"), "attachment") { t.Fatalf("headers=%v", response.Header()) }
}
```

- [ ] **Step 2: Run and verify RED**

Run: `go test ./handler -run 'TestProjectCache'`

Expected: compile failure because handlers are missing.

- [ ] **Step 3: Implement handlers and register routes**

Handlers must call `service.UserFromContext`, cap multipart bodies at the existing 200 MB limit, parse a `context` JSON form field, and use `config.Cfg.ProjectCacheDir`. Keep business logic in service files.

Register:

```go
v1.POST("/project-cache/files", gin.WrapF(handler.UploadProjectCacheFile))
v1.GET("/project-cache/projects", gin.WrapF(handler.ProjectCaches))
v1.GET("/project-cache/projects/:id", func(c *gin.Context) { handler.ProjectCache(c.Writer, c.Request, c.Param("id")) })
v1.POST("/project-cache/projects/:id/status", func(c *gin.Context) { handler.UpdateProjectCacheStatus(c.Writer, c.Request, c.Param("id")) })
v1.POST("/project-cache/projects/:id/package/preflight", func(c *gin.Context) { handler.PreflightProjectCachePackage(c.Writer, c.Request, c.Param("id")) })
v1.POST("/project-cache/projects/:id/package", func(c *gin.Context) { handler.DownloadProjectCachePackage(c.Writer, c.Request, c.Param("id")) })
v1.GET("/project-cache/files/:id", func(c *gin.Context) { handler.ProjectCacheFile(c.Writer, c.Request, c.Param("id")) })
v1.POST("/project-cache/files/:id/move", func(c *gin.Context) { handler.MoveProjectCacheFile(c.Writer, c.Request, c.Param("id")) })
v1.DELETE("/project-cache/files/:id", func(c *gin.Context) { handler.DeleteProjectCacheFile(c.Writer, c.Request, c.Param("id")) })
v1.DELETE("/project-cache/projects/:id", func(c *gin.Context) { handler.DeleteProjectCache(c.Writer, c.Request, c.Param("id")) })
```

Return normal `{code,data,msg}` envelopes except raw authenticated file and ZIP responses.

- [ ] **Step 4: Run and verify GREEN**

Run: `go test ./handler -run 'TestProjectCache' && go test ./router`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add handler/project_cache.go handler/project_cache_test.go router/router.go
git commit -m "feat: expose authenticated project cache APIs"
```

---

### Task 6: Frontend cache client, classification and retry queue

**Files:**
- Create: `web/src/services/api/project-cache.ts`
- Create: `web/src/services/project-cache-context.ts`
- Create: `web/src/services/project-cache-context.test.mts`
- Create: `web/src/services/project-cache-archive.ts`
- Create: `web/src/stores/use-project-cache-queue-store.ts`
- Create: `web/src/hooks/use-project-cache-queue-runner.ts`
- Modify: `web/src/app/(user)/user-layout-client.tsx`

- [ ] **Step 1: Write failing context and queue reducer tests**

```ts
test("classifies storyboard video inside its episode", () => {
  assert.deepEqual(projectCacheContextFromGeneration({
    projectId: "p1", projectName: "东海人鱼国", episodeId: "e1", episodeName: "第01集",
    canvasId: "c1", canvasName: "第01集制作", kind: "video", metadata: { storyboardShotId: "shot-1" },
  }), { projectId: "p1", projectName: "东海人鱼国", episodeId: "e1", episodeName: "第01集", canvasId: "c1", canvasName: "第01集制作", category: "storyboard", freeCanvas: false });
});

test("keeps direct tool generation unassigned", () => {
  assert.equal(projectCacheContextFromGeneration({ kind: "image", metadata: {}, source: "image-page" }).projectId, "");
});

test("retry transition stops automatic retries but remains pending", () => {
  const next = projectCacheRetryFailure({ attempts: 2, status: "retrying" }, "磁盘空间不足", 3);
  assert.equal(next.status, "pending");
  assert.equal(next.attempts, 3);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `cd web && node --experimental-strip-types --test src/services/project-cache-context.test.mts`

Expected: module/function-not-found failure.

- [ ] **Step 3: Implement API, context and queue**

Expose TypeScript contracts mirroring the Go JSON types and functions:

```ts
export function uploadProjectCacheFile(file: Blob, filename: string, context: ProjectCacheContext, token: string)
export function listProjectCaches(token: string)
export function getProjectCache(projectId: string, token: string)
export function updateProjectCacheStatus(projectId: string, status: "active" | "deleted", token: string)
export function deleteProjectCacheFile(fileId: string, token: string)
export function deleteProjectCache(projectId: string, token: string)
export function preflightProjectCachePackage(projectId: string, snapshot: ProjectCachePackageSnapshot, token: string)
export function downloadProjectCachePackage(projectId: string, snapshot: ProjectCachePackageSnapshot, continueOnMissing: boolean, token: string)
```

Persist only retry metadata (`storageKey`, media kind, filename, context, attempts, error); reuse the existing image/media localforage stores for Blobs. `useProjectCacheQueueRunner` resolves the Blob with `getImageBlob` or `getMediaBlob`, retries at most three automatic attempts, and never changes the original generation result status.

- [ ] **Step 4: Run and verify GREEN**

Run: `cd web && node --experimental-strip-types --test src/services/project-cache-context.test.mts`

Expected: PASS.

- [ ] **Step 5: Commit new frontend data files only**

Do not stage `user-layout-client.tsx` yet because later UI work also touches it.

```bash
git add web/src/services/api/project-cache.ts web/src/services/project-cache-context.ts web/src/services/project-cache-context.test.mts web/src/services/project-cache-archive.ts web/src/stores/use-project-cache-queue-store.ts web/src/hooks/use-project-cache-queue-runner.ts
git commit -m "feat: add project cache client and retry queue"
```

---

### Task 7: Automatic cache integration for generated and imported media

**Files:**
- Modify: `web/src/app/(user)/canvas/types.ts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-generated-asset-archive.ts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-media-cache.ts`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
- Modify: `web/src/app/(user)/image/page.tsx`
- Modify: `web/src/app/(user)/user-layout-client.tsx`
- Test: `web/src/services/project-cache-context.test.mts`

- [ ] **Step 1: Extend failing tests for asset metadata classification**

Add cases for character/scene/prop bindings, free canvases, generated image versions and imported audio. Assert prompt/model/provider are forwarded but API keys and config objects are not.

- [ ] **Step 2: Run and verify RED**

Run: `cd web && node --experimental-strip-types --test src/services/project-cache-context.test.mts`

Expected: FAIL on the new category and sanitization assertions.

- [ ] **Step 3: Integrate non-fatal automatic caching**

Add metadata:

```ts
export type CanvasProjectCacheMetadata = {
  fileId?: string;
  relativePath?: string;
  status: "ready" | "pending" | "error";
  error?: string;
};
```

After `addAssetOnce` completes in `useCanvasGeneratedAssetArchive`, call `archiveAssetToProjectCache`. Do not await it in a way that blocks canvas success; resolve the stored Blob, upload, then update the asset/node cache metadata or queue retry metadata. Change `useCanvasMediaCache` so video/audio cache failure returns `{projectCache:{status:"pending"}}` instead of throwing. Pass current creative project, episode and canvas names from the canvas assembly layer.

In the image workbench, immediately after each successful result is converted with `uploadImage`, enqueue/upload it with `sourceContext`; empty project IDs become `unassigned`. Mount `useProjectCacheQueueRunner` only after user storage scope activation.

- [ ] **Step 4: Run and verify GREEN**

Run: `cd web && node --experimental-strip-types --test src/services/project-cache-context.test.mts src/app/\(user\)/canvas/utils/canvas-generated-asset.test.mts`

Expected: PASS.

- [ ] **Step 5: Preserve overlapping user changes**

Run `git diff --` for every modified canvas/project file. Do not commit these already-dirty files as a blanket commit. Commit only files that were clean before this task; leave overlapping files unstaged for combined review.

---

### Task 8: Project snapshot and complete package client

**Files:**
- Create: `web/src/services/project-cache-snapshot.ts`
- Create: `web/src/services/project-cache-snapshot.test.mts`

- [ ] **Step 1: Write failing project-scoping tests**

```ts
test("builds a package snapshot with only the selected project", () => {
  const snapshot = buildProjectCacheSnapshot({
    projectId: "p1",
    projects: [{ id: "p1", title: "A" }, { id: "p2", title: "B" }],
    canvases: [{ id: "c1", projectId: "p1" }, { id: "c2", projectId: "p2" }],
    episodes: [{ id: "e1", projectId: "p1" }, { id: "e2", projectId: "p2" }],
    scenes: [{ id: "s1", episodeId: "e1" }, { id: "s2", episodeId: "e2" }],
    storyboardShots: [{ id: "sh1", projectId: "p1" }, { id: "sh2", projectId: "p2" }],
    storyboardGroups: [], assets: [{ id: "a1", metadata: { projectId: "p1" } }],
  });
  assert.equal(snapshot.project.id, "p1");
  assert.deepEqual(snapshot.canvases.map((item) => item.id), ["c1"]);
  assert.deepEqual(snapshot.scripts.episodes.map((item) => item.id), ["e1"]);
  assert.deepEqual(snapshot.storyboards.shots.map((item) => item.id), ["sh1"]);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `cd web && node --experimental-strip-types --test src/services/project-cache-snapshot.test.mts`

Expected: module/function-not-found failure.

- [ ] **Step 3: Implement minimal snapshot builder**

Return `{project, canvases, scripts:{episodes,scenes}, storyboards:{shots,groups}, assets}`. Strip transient object URLs and API configuration; retain storage keys and cache file IDs as references. Keep this module pure and independent of Zustand by accepting arrays.

- [ ] **Step 4: Run and verify GREEN**

Run: `cd web && node --experimental-strip-types --test src/services/project-cache-snapshot.test.mts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/services/project-cache-snapshot.ts web/src/services/project-cache-snapshot.test.mts
git commit -m "feat: build portable project cache snapshots"
```

---

### Task 9: Global cache center and project shortcut

**Files:**
- Create: `web/src/app/(user)/cache/cache-view-model.ts`
- Create: `web/src/app/(user)/cache/cache-view-model.test.mts`
- Create: `web/src/app/(user)/cache/components/cache-project-list.tsx`
- Create: `web/src/app/(user)/cache/components/cache-file-table.tsx`
- Create: `web/src/app/(user)/cache/page.tsx`
- Modify: `web/src/constant/navigation-tools.ts`
- Modify: `web/src/app/(user)/user-layout-client.tsx`
- Modify: `web/src/app/(user)/projects/[id]/components/project-episode-board.tsx`
- Modify: `web/src/app/(user)/projects/[id]/page.tsx`
- Modify: `web/src/app/(user)/projects/page.tsx`

- [ ] **Step 1: Write failing view-model tests**

```ts
test("marks disk cache orphaned when the local project is absent", () => {
  const rows = mergeProjectCacheState([{ projectId: "p1", status: "active", bytes: 10 }], []);
  assert.equal(rows[0].displayStatus, "orphaned");
});

test("filters by project, scope, category, media kind and keyword", () => {
  const result = filterProjectCacheFiles(filesFixture, { projectId: "p1", episodeId: "e1", category: "storyboard", kind: "video", keyword: "shot-01" });
  assert.deepEqual(result.map((item) => item.id), ["file-1"]);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/cache/cache-view-model.test.mts'`

Expected: module/function-not-found failure.

- [ ] **Step 3: Implement the view model and page**

Build the selected C layout: compact summary header; project rail for all/unassigned/deleted; main filters and file table. Use existing `studio-*` tokens, Ant Design `Button/Input/Select/Modal/Empty/Spin`, and lucide icons. Do not add page-private global CSS or hardcoded light/dark colors.

Actions:

- Copy the returned disk path.
- Recheck/refetch manifests.
- Retry locally pending uploads.
- Move an unassigned file to a project/category.
- Run package preflight, show missing-file warnings, then download ZIP.
- Delete a file or full project cache only through a danger confirmation that states browser project data is unaffected.

Add “缓存管理” to `navigationTools`, add `/cache` to workspace shell paths, add `onOpenProjectCache` to `ProjectEpisodeBoard`, and route it to `/cache?projectId=${encodeURIComponent(project.id)}`. On local project deletion, fire-and-forget `updateProjectCacheStatus(project.id,"deleted",token)` after the local delete; API failure must not block local deletion and the global page will still detect the orphan by ID comparison.

- [ ] **Step 4: Run and verify GREEN**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/cache/cache-view-model.test.mts' src/services/project-cache-snapshot.test.mts src/services/project-cache-context.test.mts`

Expected: PASS.

- [ ] **Step 5: Review overlapping diffs instead of blanket-staging**

Run:

```bash
git diff -- web/src/app/'(user)'/projects/'[id]'/page.tsx web/src/app/'(user)'/projects/'[id]'/components/project-episode-board.tsx web/src/app/'(user)'/projects/page.tsx web/src/app/'(user)'/user-layout-client.tsx
```

Confirm cache edits are narrow and all existing user changes remain. Stage/commit only the new cache page, view model, components, tests, and previously clean navigation file:

```bash
git add web/src/app/\(user\)/cache web/src/constant/navigation-tools.ts
git commit -m "feat: add project cache management center"
```

---

### Task 10: Documentation and targeted verification

**Files:**
- Modify: `.env.example`
- Modify: deployment example files containing `PUBLIC_ASSET_DIR`
- Modify: `docs/pending-test.md`
- Modify: `docs/todo.md`

- [ ] **Step 1: Add configuration and acceptance documentation**

Document:

```dotenv
# Generated media copied to project-scoped local disk folders.
PROJECT_CACHE_DIR=data/project-cache
```

Add a pending-test entry covering automatic image/video caching, project/episode/category directories, unassigned results, retry behavior, cache center statistics, deleted-project retention, missing-file warnings, explicit deletion and complete ZIP contents. State clearly that this is local backend disk storage, not cloud sync.

- [ ] **Step 2: Check todo movement**

Do not mark M10 cloud assets implemented. If no pre-existing local project-cache todo exists, add no new roadmap scope; note in the pending-test entry that `docs/todo.md` was checked and unchanged except any exact completed local-cache item found during implementation.

- [ ] **Step 3: Run backend targeted tests**

Run:

```bash
go test ./service -run 'Test(ProjectCache|ArchiveProjectCache|ListUserProjectCaches|SetProjectCacheStatus|MoveUnassignedCacheFile|DeleteProjectCache|WriteProjectCachePackage)'
go test ./handler -run 'TestProjectCache'
go test ./router
```

Expected: PASS.

- [ ] **Step 4: Run frontend targeted tests**

Run:

```bash
cd web
node --experimental-strip-types --test src/services/project-cache-context.test.mts src/services/project-cache-snapshot.test.mts 'src/app/(user)/cache/cache-view-model.test.mts' 'src/app/(user)/canvas/utils/canvas-generated-asset.test.mts'
```

Expected: PASS without warnings. Do not run full build, full test suite or full typecheck because the project instructions reserve those for explicit comprehensive validation.

- [ ] **Step 5: Inspect changed files and documentation overlap**

Run `git status --short`, `git diff --check`, and exact-path diffs. Confirm no existing user changes were removed, no cloud-sync claim was added, and `docs/todo.md`/`docs/pending-test.md` modifications only describe this feature.

- [ ] **Step 6: Leave overlapping user files unstaged**

Do not create a final blanket commit in this dirty worktree. Report which implementation commits were created and which overlapping files remain as combined user changes.
