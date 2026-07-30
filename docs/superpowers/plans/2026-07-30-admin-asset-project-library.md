# Admin Asset Project Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the admin asset long-form workflow with an independent project and folder file manager that supports direct multi-file upload and post-upload organization.

**Architecture:** Add server-backed asset projects and nested folders, extend assets with project, folder and episode scope, and expose focused admin CRUD/batch endpoints. Rebuild the existing admin asset page as a project browser plus in-project file manager; keep the public asset library contract intact while allowing optional project filtering.

**Tech Stack:** Go, Gin, GORM, Next.js App Router, React, TypeScript, Ant Design, TanStack Query.

---

### Task 1: Persist asset projects, folders and episode scope

**Files:**
- Create: `model/asset_project.go`
- Modify: `model/asset.go`
- Modify: `model/query.go`
- Modify: `repository/db.go`
- Modify: `docs/backend-database.md`

- [ ] **Step 1: Define project and folder models**

```go
type AssetProject struct {
    ID string `json:"id" gorm:"primaryKey"`
    Name string `json:"name" gorm:"uniqueIndex"`
    CreatedAt string `json:"createdAt"`
    UpdatedAt string `json:"updatedAt"`
}

type AssetFolder struct {
    ID string `json:"id" gorm:"primaryKey"`
    ProjectID string `json:"projectId" gorm:"uniqueIndex:idx_asset_folder_sibling;index"`
    ParentID string `json:"parentId" gorm:"uniqueIndex:idx_asset_folder_sibling;index"`
    Name string `json:"name" gorm:"uniqueIndex:idx_asset_folder_sibling"`
    CreatedAt string `json:"createdAt"`
    UpdatedAt string `json:"updatedAt"`
}
```

- [ ] **Step 2: Extend assets and list query**

```go
ProjectID string `json:"projectId" gorm:"index"`
FolderID string `json:"folderId" gorm:"index"`
EpisodeNumbers []string `json:"episodeNumbers" gorm:"serializer:json"`
AllEpisodes bool `json:"allEpisodes"`
```

Add `ProjectID`, `FolderID`, `FolderScope`, `EpisodeNumber`, and `AllEpisodes` to `model.Query` so admin asset filters do not overload generic fields.

- [ ] **Step 3: Register the new tables**

Add `&model.AssetProject{}` and `&model.AssetFolder{}` immediately before `&model.Asset{}` in `repository/db.go`.

- [ ] **Step 4: Document the schema**

Add `asset_projects`, `asset_folders`, and the four new `assets` columns to `docs/backend-database.md`, including the same-parent folder-name uniqueness rule.

- [ ] **Step 5: Commit**

```bash
git add model/asset_project.go model/asset.go model/query.go repository/db.go docs/backend-database.md
git commit -m "feat: add asset project and folder models"
```

### Task 2: Add project and folder repository/service operations

**Files:**
- Create: `repository/asset_project.go`
- Create: `service/asset_project.go`
- Modify: `repository/asset.go`

- [ ] **Step 1: Add project repository operations**

Implement list, get, save and transactional delete functions with these signatures:

```go
func ListAssetProjects() ([]model.AssetProjectSummary, error)
func GetAssetProject(id string) (model.AssetProject, error)
func SaveAssetProject(item model.AssetProject) (model.AssetProject, error)
func DeleteAssetProject(id string) ([]model.Asset, error)
```

`ListAssetProjects` returns `assetCount` using one grouped query. `DeleteAssetProject` returns the deleted assets so the service can safely remove local uploads after the transaction commits.

- [ ] **Step 2: Add folder repository operations**

```go
func ListAssetFolders(projectID string) ([]model.AssetFolder, error)
func GetAssetFolder(id string) (model.AssetFolder, error)
func SaveAssetFolder(item model.AssetFolder) (model.AssetFolder, error)
func DeleteAssetFolder(projectID string, folderID string) ([]model.Asset, error)
```

Load the project's folder list, calculate descendants in memory, then delete descendant assets and folders in one transaction.

- [ ] **Step 3: Add validated services**

```go
func ListAssetProjects() ([]model.AssetProjectSummary, error)
func SaveAssetProject(item model.AssetProject) (model.AssetProject, error)
func DeleteAssetProject(id string) error
func ListAssetFolders(projectID string) ([]model.AssetFolder, error)
func SaveAssetFolder(item model.AssetFolder) (model.AssetFolder, error)
func DeleteAssetFolder(projectID string, folderID string) error
```

Trim names, generate `asset-project` / `asset-folder` IDs, validate parent ownership, and turn duplicate-name database failures into `safeMessageError` messages.

- [ ] **Step 4: Add safe uploaded-file cleanup**

Only delete URLs beginning with `/api/uploaded-assets/library/`; resolve the relative path under `config.Cfg.PublicAssetDir`, reject paths escaping that root, and ignore external URLs.

- [ ] **Step 5: Commit**

```bash
git add repository/asset_project.go repository/asset.go service/asset_project.go
git commit -m "feat: manage asset projects and folders"
```

### Task 3: Extend asset list, direct upload and batch organization

**Files:**
- Modify: `handler/response.go`
- Modify: `handler/assets.go`
- Modify: `service/assets.go`
- Modify: `repository/asset.go`
- Modify: `router/router.go`

- [ ] **Step 1: Parse the new filters**

Read `projectId`, `folderId`, `folderScope`, `episodeNumber`, and `allEpisodes` in `parseQuery`.

- [ ] **Step 2: Apply project/folder/organization filters**

In `applyAssetFilters`, require matching `project_id` when supplied, match `folder_id` only for `folderScope=current`, filter `category`, reuse JSON tag filtering, filter `episode_numbers`, and parse `allEpisodes` as a boolean only when present.

- [ ] **Step 3: Make upload create the asset record**

Change the admin upload handler to pass `projectId` and `folderId`. Add:

```go
func ImportAssetMedia(projectID string, folderID string, file multipart.File, header *multipart.FileHeader) (model.Asset, error)
```

Validate project/folder ownership, call the existing byte/MIME storage helper, derive the title from the original filename, save the asset, and return the complete record.

- [ ] **Step 4: Add batch update/delete**

```go
type AssetBatchUpdate struct {
    IDs []string `json:"ids"`
    ProjectID string `json:"projectId"`
    FolderID *string `json:"folderId,omitempty"`
    Category *string `json:"category,omitempty"`
    Tags *[]string `json:"tags,omitempty"`
    EpisodeNumbers *[]string `json:"episodeNumbers,omitempty"`
    AllEpisodes *bool `json:"allEpisodes,omitempty"`
}
```

Validate all IDs belong to `ProjectID`, validate target folder ownership, enforce episode/all-episodes exclusivity, then update only non-nil fields. Batch delete removes records in one transaction and cleans local uploaded files afterwards.

- [ ] **Step 5: Add admin routes**

```go
admin.GET("/asset-projects", gin.WrapF(handler.AdminAssetProjects))
admin.POST("/asset-projects", gin.WrapF(handler.AdminSaveAssetProject))
admin.PATCH("/asset-projects/:id", ...)
admin.DELETE("/asset-projects/:id", ...)
admin.GET("/asset-projects/:id/folders", ...)
admin.POST("/asset-projects/:id/folders", ...)
admin.PATCH("/asset-projects/:id/folders/:folderId", ...)
admin.DELETE("/asset-projects/:id/folders/:folderId", ...)
admin.POST("/assets/batch-update", gin.WrapF(handler.AdminBatchUpdateAssets))
admin.POST("/assets/batch-delete", gin.WrapF(handler.AdminBatchDeleteAssets))
```

- [ ] **Step 6: Commit**

```bash
git add handler/response.go handler/assets.go service/assets.go repository/asset.go router/router.go
git commit -m "feat: add direct and batch asset management APIs"
```

### Task 4: Add typed frontend asset project APIs

**Files:**
- Modify: `web/src/services/api/admin.ts`

- [ ] **Step 1: Extend asset types**

Add `projectId`, `folderId`, `episodeNumbers`, and `allEpisodes` to `AdminAsset`, plus `AdminAssetProject`, `AdminAssetFolder`, and `AdminAssetBatchUpdate` types.

- [ ] **Step 2: Add project/folder calls**

Add typed GET/POST/PATCH/DELETE calls for the routes from Task 3 using the existing request helpers.

- [ ] **Step 3: Replace the upload return type**

Send `projectId` and optional `folderId` in the upload form and return `AdminAsset`; keep the file field named `file`.

- [ ] **Step 4: Add batch calls**

Add `batchUpdateAdminAssets(token, input)` and `batchDeleteAdminAssets(token, projectId, ids)`.

- [ ] **Step 5: Commit**

```bash
git add web/src/services/api/admin.ts
git commit -m "feat: add admin asset project client APIs"
```

### Task 5: Build project browser and file-manager hooks

**Files:**
- Replace: `web/src/app/(admin)/admin/assets/use-admin-assets.ts`
- Create: `web/src/app/(admin)/admin/assets/use-admin-asset-projects.ts`
- Create: `web/src/app/(admin)/admin/assets/use-admin-asset-upload.ts`

- [ ] **Step 1: Add project and folder query/mutation hook**

Expose projects, folders, loading states and create/rename/delete actions. Invalidate `['admin','asset-projects']`, `['admin','asset-folders', projectId]`, and project asset queries after mutations.

- [ ] **Step 2: Scope the asset hook to a project**

Accept `projectId`, `folderId`, `folderScope`, keyword, type, category, tag, episode and all-episodes filters. Expose selection-safe refresh, save, batch update and batch delete actions.

- [ ] **Step 3: Add a three-worker upload queue**

Represent each entry as `{ id, file, status, error }`, upload at most three files concurrently, keep failed rows for retry, invalidate the asset/project queries after successes, and expose `enqueue`, `retry`, and `clearFinished`.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/\(admin\)/admin/assets/use-admin-assets.ts web/src/app/\(admin\)/admin/assets/use-admin-asset-projects.ts web/src/app/\(admin\)/admin/assets/use-admin-asset-upload.ts
git commit -m "feat: add admin asset manager hooks"
```

### Task 6: Replace the long form with the project file manager UI

**Files:**
- Replace: `web/src/app/(admin)/admin/assets/page.tsx`
- Create: `web/src/app/(admin)/admin/assets/components/asset-project-browser.tsx`
- Create: `web/src/app/(admin)/admin/assets/components/asset-folder-tree.tsx`
- Create: `web/src/app/(admin)/admin/assets/components/asset-file-grid.tsx`
- Create: `web/src/app/(admin)/admin/assets/components/asset-upload-queue.tsx`
- Create: `web/src/app/(admin)/admin/assets/components/asset-detail-drawer.tsx`
- Create: `web/src/app/(admin)/admin/assets/components/asset-batch-organizer.tsx`

- [ ] **Step 1: Build the project browser**

Render project cards with name, asset count and updated time. “新建项目” opens a one-field modal; card actions support rename and confirmed delete.

- [ ] **Step 2: Build folder navigation**

Render an Ant Design `Tree` with a synthetic project-root node. Use current folder as the parent for new folders, and provide rename/delete actions for real folder nodes.

- [ ] **Step 3: Build the asset area**

Render search and type/category/tag/episode filters, current-folder/project-wide scope, grid/list toggle, pagination, checkbox selection and an empty drag target. Use theme tokens and existing studio CSS variables instead of hard-coded light/dark colors.

- [ ] **Step 4: Build direct multi-file upload**

Use one hidden input with `multiple` and `accept="image/*,video/*,audio/*"`; enqueue all selected or dropped files immediately. Show the queue in a compact drawer with status, error, retry and clear-finished actions.

- [ ] **Step 5: Build post-upload editing**

The detail drawer edits name, category, tags, description, episode numbers and all-episodes. The batch organizer supports move, category, replacement tags, episode numbers/all-episodes and confirmed delete. Keep text creation as a small name/content modal.

- [ ] **Step 6: Preserve Volcengine review actions**

Show submit/refresh review actions in the detail drawer for supported media without making review configuration or status part of upload.

- [ ] **Step 7: Commit**

```bash
git add web/src/app/\(admin\)/admin/assets
git commit -m "feat: rebuild admin assets as project file manager"
```

### Task 7: Update product documentation and pending verification

**Files:**
- Modify: `docs/features.md`
- Modify: `docs/pending-test.md`
- Modify: `docs/todo.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update the feature description**

Replace the old admin asset bullets with independent projects, nested folders, direct multi-file upload, post-upload organization, batch operations and episode filtering.

- [ ] **Step 2: Record pending user verification**

Add a concise entry covering project/folder creation, mixed multi-file upload, partial failure retry, batch organization, filtering, public-library visibility and safe recursive deletion.

- [ ] **Step 3: Check todo and changelog scope**

Remove a matching todo only if one exists; otherwise leave `docs/todo.md` unchanged. Add one version-level `Unreleased` summary without duplicating the pending-test checklist.

- [ ] **Step 4: Commit**

```bash
git add docs/features.md docs/pending-test.md docs/todo.md CHANGELOG.md
git commit -m "docs: document asset project file manager"
```

### Task 8: Focused verification

**Files:**
- Test: `service/assets_test.go`
- Test: `repository/asset_test.go`
- Test: `web/src/app/(admin)/admin/assets/admin-asset-manager.test.mts`

- [ ] **Step 1: Add backend behavior tests**

Cover MIME-derived direct import, folder ownership rejection, descendant folder deletion, batch episode/all-episodes exclusivity and safe local-file cleanup.

- [ ] **Step 2: Add frontend wiring tests**

Statically assert the page uses a multiple file input, drag/drop, the folder tree, project-wide scope, episode filters and batch operations without restoring required cover/category/description fields.

- [ ] **Step 3: Run focused tests only when explicitly requested**

```bash
go test ./service ./repository
cd web && node --test 'src/app/(admin)/admin/assets/admin-asset-manager.test.mts'
```

Expected: all focused tests pass. Project instructions otherwise leave test/build execution to explicit user request.

- [ ] **Step 4: Commit**

```bash
git add service/assets_test.go repository/asset_test.go web/src/app/\(admin\)/admin/assets/admin-asset-manager.test.mts
git commit -m "test: cover admin asset project manager"
```
