# Cache File Card Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cache file table with responsive media cards that support authenticated previews and a secure new-tab original-file viewer.

**Architecture:** Keep the existing cache listing and management API, adding one frontend Blob-fetch helper and one page-local object-URL hook. The cache page owns selection and management actions, cards lazy-load only image thumbnails, a modal loads media on demand, and `/cache/files/[fileId]` independently reads the active session token before fetching the protected file.

**Tech Stack:** Next.js App Router, React, TypeScript, Ant Design, Tailwind CSS, Zustand, Axios, file-saver

---

### Task 1: Add the authenticated cache-file Blob client

**Files:**
- Modify: `web/src/services/api/project-cache.ts`

- [ ] **Step 1: Add the Blob response contract and filename parser**

Add a `ProjectCacheFileBlob` type containing `blob`, `mimeType`, and `filename`. Parse `filename*=UTF-8''...` first, then quoted `filename=`, and fall back to the file ID when the header has no filename:

```ts
export type ProjectCacheFileBlob = { blob: Blob; mimeType: string; filename: string };

function cacheFileName(disposition: string | undefined, fallback: string) {
    const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    if (encoded) {
        try {
            return decodeURIComponent(encoded);
        } catch {
            return encoded;
        }
    }
    return disposition?.match(/filename="([^"]+)"/i)?.[1] || fallback;
}
```

- [ ] **Step 2: Fetch the protected file as a Blob**

Add this API helper beside the existing cache endpoints:

```ts
export async function fetchProjectCacheFileBlob(fileId: string, token: string, signal?: AbortSignal): Promise<ProjectCacheFileBlob> {
    const response = await axios.get<Blob>(`/api/v1/project-cache/files/${encodeURIComponent(fileId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: "blob",
        signal,
    });
    return {
        blob: response.data,
        mimeType: response.headers["content-type"] || response.data.type || "application/octet-stream",
        filename: cacheFileName(response.headers["content-disposition"], fileId),
    };
}
```

- [ ] **Step 3: Perform the safe static check**

```bash
git diff --check -- web/src/services/api/project-cache.ts
```

Expected: command exits successfully with no output.

### Task 2: Add a reusable page-local object-URL hook

**Files:**
- Create: `web/src/app/(user)/cache/use-cache-file-object-url.ts`

- [ ] **Step 1: Implement abortable loading and URL cleanup**

Create a client hook that reads the active token from `useUserStore`, starts loading only when `enabled` is true, returns `{ url, blob, filename, mimeType, loading, error }`, and revokes every object URL during cleanup:

```ts
"use client";

import { useEffect, useState } from "react";
import { fetchProjectCacheFileBlob, type ProjectCacheFileBlob } from "@/services/api/project-cache";
import { useUserStore } from "@/stores/use-user-store";

export function useCacheFileObjectUrl(fileId: string, enabled: boolean) {
    const token = useUserStore((state) => state.token);
    const [result, setResult] = useState<ProjectCacheFileBlob>();
    const [url, setUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!enabled || !fileId || !token) {
            setResult(undefined);
            setUrl("");
            setLoading(false);
            setError(enabled && !token ? "登录状态不可用，请重新登录" : "");
            return;
        }
        const controller = new AbortController();
        let objectUrl = "";
        setLoading(true);
        setError("");
        void fetchProjectCacheFileBlob(fileId, token, controller.signal)
            .then((value) => {
                objectUrl = URL.createObjectURL(value.blob);
                setResult(value);
                setUrl(objectUrl);
            })
            .catch((reason) => {
                if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "缓存文件读取失败");
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => {
            controller.abort();
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [enabled, fileId, token]);

    return { ...result, url, loading, error };
}
```

- [ ] **Step 2: Perform the safe static check**

```bash
git diff --check -- 'web/src/app/(user)/cache/use-cache-file-object-url.ts'
```

Expected: command exits successfully with no output.

### Task 3: Replace the table with lazy media cards

**Files:**
- Create: `web/src/app/(user)/cache/components/cache-file-grid.tsx`
- Delete: `web/src/app/(user)/cache/components/cache-file-table.tsx`

- [ ] **Step 1: Build a responsive grid contract**

The exported component accepts the existing management callbacks plus `onPreview`:

```ts
export function CacheFileGrid({
    files,
    onDelete,
    onMove,
    onPreview,
}: {
    files: ProjectCacheFile[];
    onDelete: (file: ProjectCacheFile) => void;
    onMove?: (file: ProjectCacheFile) => void;
    onPreview: (file: ProjectCacheFile) => void;
})
```

Render an empty state or this responsive container:

```tsx
<div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-4">
    {files.map((file) => <CacheFileCard key={file.id} file={file} onDelete={onDelete} onMove={onMove} onPreview={onPreview} />)}
</div>
```

- [ ] **Step 2: Lazy-load image thumbnails only**

Each card preview uses an `IntersectionObserver` to enable `useCacheFileObjectUrl(file.id, visible && file.kind === "image" && file.status === "ready")`. Render the object URL in an `img` with `loading="lazy"`, `object-contain`, and the original filename as alt text. Video and audio use `Video` and `AudioLines` icon covers without calling the hook.

- [ ] **Step 3: Preserve card metadata and management actions**

Show the original name, category label, episode name or “项目共享”, formatted byte size, and a separate “文件缺失” state. The preview button is disabled for missing files. Add an anchor-style Ant Design button with:

```tsx
href={`/cache/files/${encodeURIComponent(file.id)}`}
target="_blank"
rel="noreferrer"
```

Use `event.stopPropagation()` on new-tab, move, and delete controls. Keep the move control conditional on `onMove`.

- [ ] **Step 4: Remove the superseded table**

Delete `cache-file-table.tsx` after the cache page import has been migrated in Task 5 so no stale implementation remains.

### Task 4: Add the on-demand preview modal and viewer page

**Files:**
- Create: `web/src/app/(user)/cache/components/cache-file-preview-modal.tsx`
- Create: `web/src/app/(user)/cache/files/[fileId]/page.tsx`

- [ ] **Step 1: Implement the preview modal**

The modal accepts `file?: ProjectCacheFile` and `onClose`. Call `useCacheFileObjectUrl(file?.id || "", Boolean(file && file.status === "ready"))`, show a centered spinner during loading and an Ant Design `Alert` on error. Render by `file.kind`:

```tsx
file.kind === "image" ? (
    <img src={url} alt={file.originalName} className="max-h-[70vh] max-w-full object-contain" />
) : file.kind === "video" ? (
    <video src={url} controls className="max-h-[70vh] max-w-full" />
) : (
    <audio src={url} controls className="w-full" />
)
```

The footer includes “新标签查看原文件” and `saveAs(blob, filename || file.originalName || file.id)` download actions. Use `destroyOnHidden` so media playback and Blob state end when the modal closes.

- [ ] **Step 2: Implement the authenticated new-tab viewer**

The page uses `useParams<{ fileId: string }>()`, `useUserStore` readiness, and the same object-URL hook. It renders the media kind from `mimeType` (`image/`, `video/`, `audio/`), a loading state, an error state, a download button, and a “关闭页面” button. It must never put the token, Blob URL, or disk path into a link copied from the address bar.

- [ ] **Step 3: Provide a safe unsupported-file fallback**

If MIME is not image, video, or audio, show “当前文件类型不支持浏览器预览” while keeping download available.

### Task 5: Wire cards and preview state into the cache page

**Files:**
- Modify: `web/src/app/(user)/cache/page.tsx`
- Modify: `web/src/app/(user)/cache/cache-view-model.ts`

- [ ] **Step 1: Replace table wiring with card and modal wiring**

Replace `CacheFileTable` with `CacheFileGrid`, add `const [previewFile, setPreviewFile] = useState<ProjectCacheFile>();`, and render:

```tsx
<CacheFileGrid files={filteredFiles} onDelete={removeFile} onMove={!manifest.projectId ? openMoveFile : undefined} onPreview={setPreviewFile} />
<CacheFilePreviewModal file={previewFile} onClose={() => setPreviewFile(undefined)} />
```

Preserve the existing search, filters, delete confirmation, move modal, retry, package, and cache cleanup behavior.

- [ ] **Step 2: Correct the project association label**

Change only the orphaned label branch:

```ts
return status === "deleted" ? "项目已删除" : status === "orphaned" ? "未关联当前项目" : status === "unassigned" ? "未归属" : "正常";
```

- [ ] **Step 3: Perform static source checks**

```bash
rg -n "CacheFileTable|本地项目不存在" 'web/src/app/(user)/cache' || true
rg -n "CacheFileGrid|CacheFilePreviewModal|新标签查看原文件|未关联当前项目" 'web/src/app/(user)/cache'
git diff --check -- web/src/services/api/project-cache.ts 'web/src/app/(user)/cache'
```

Expected: the first search prints no matches, the second finds all four contracts, and `git diff --check` exits successfully.

### Task 6: Record pending manual acceptance and commit the implementation

**Files:**
- Modify: `docs/pending-test.md`
- Review only: `docs/todo.md`

- [ ] **Step 1: Add the manual acceptance record**

Append this section without overwriting or staging unrelated existing edits:

```markdown
### 缓存文件卡片与安全预览

- 缓存文件区由长表格改为响应式卡片；图片卡片按需显示缩略图，视频和音频列表不预加载原文件。
- 正常文件可在页面内预览，也可通过“新标签查看原文件”进入鉴权查看页；缺失、未登录和读取失败会显示明确状态。
- 项目磁盘清单未匹配当前浏览器项目时改为“未关联当前项目”，与实际文件缺失分开提示。
- 人工验收：在缓存页分别预览图片、视频、音频，检查新标签播放、下载、筛选、删除、未归属移动和项目打包仍可用；关闭预览后媒体停止播放。
```

- [ ] **Step 2: Review todo impact**

Read `docs/todo.md`. Do not add a new todo because Range streaming and project relinking were explicitly excluded, not promised follow-up work. Do not stage the already-mixed documentation files.

- [ ] **Step 3: Run the always-safe final static review**

```bash
git diff --check -- web/src/services/api/project-cache.ts 'web/src/app/(user)/cache'
git status --short
```

Expected: no whitespace errors; only owned source files will be staged.

- [ ] **Step 4: Commit only owned source files**

```bash
git add web/src/services/api/project-cache.ts 'web/src/app/(user)/cache/page.tsx' 'web/src/app/(user)/cache/cache-view-model.ts' 'web/src/app/(user)/cache/components/cache-file-grid.tsx' 'web/src/app/(user)/cache/components/cache-file-preview-modal.tsx' 'web/src/app/(user)/cache/use-cache-file-object-url.ts' 'web/src/app/(user)/cache/files/[fileId]/page.tsx'
git rm 'web/src/app/(user)/cache/components/cache-file-table.tsx'
git diff --cached --check
git commit -m "feat: add cache file card previews"
```

Do not stage `docs/pending-test.md`, `docs/todo.md`, or unrelated dirty files.
