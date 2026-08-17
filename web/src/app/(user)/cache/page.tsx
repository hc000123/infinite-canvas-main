"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { App, Button, Empty, Input, Modal, Select, Spin, Tag } from "antd";
import { Archive, Copy, Database, Download, RefreshCw, Star, Trash2 } from "lucide-react";
import copy from "copy-to-clipboard";
import { saveAs } from "file-saver";

import {
    deleteProjectCache,
    deleteProjectCacheFile,
    downloadProjectCachePackage,
    downloadProjectCacheSelection,
    fetchProjectCacheFileBlob,
    getProjectCache,
    listProjectCaches,
    moveProjectCacheFile,
    preflightProjectCachePackage,
    setProjectCacheFileFavorite,
    type ProjectCacheFile,
    type ProjectCacheManifest,
    type ProjectCacheSummary,
    type UserProjectCacheList,
} from "@/services/api/project-cache";
import { buildProjectCacheSnapshot } from "@/services/project-cache-snapshot";
import { useAssetStore } from "@/stores/use-asset-store";
import { useProjectCacheQueueStore } from "@/stores/use-project-cache-queue-store";
import { useUserStore } from "@/stores/use-user-store";
import { useCanvasStore } from "../canvas/stores/use-canvas-store";
import { useScriptStore } from "../canvas/stores/use-script-store";
import { useStoryboardStore } from "../canvas/stores/use-storyboard-store";
import { useCreativeProjectStore } from "../projects/use-creative-project-store";
import { CacheFileGrid } from "./components/cache-file-grid";
import { CacheFilePreviewModal } from "./components/cache-file-preview-modal";
import { CacheProjectList } from "./components/cache-project-list";
import { createLatestRequestGuard, createProjectCacheViewReset, filterProjectCacheFiles, mergeProjectCacheState, pruneCacheSelection, toggleVisibleCacheSelection } from "./cache-view-model";

export default function CacheManagementPage() {
    const searchParams = useSearchParams();
    const { message, modal } = App.useApp();
    const token = useUserStore((state) => state.token);
    const projects = useCreativeProjectStore((state) => state.projects);
    const canvases = useCanvasStore((state) => state.projects);
    const episodes = useScriptStore((state) => state.episodes);
    const scenes = useScriptStore((state) => state.scenes);
    const storyboardShots = useStoryboardStore((state) => state.tableShots);
    const storyboardGroups = useStoryboardStore((state) => state.shotGroups);
    const assets = useAssetStore((state) => state.assets);
    const folders = useAssetStore((state) => state.folders);
    const pendingItems = useProjectCacheQueueStore((state) => state.items);
    const retryPending = useProjectCacheQueueStore((state) => state.retry);
    const [cacheList, setCacheList] = useState<UserProjectCacheList>();
    const [manifest, setManifest] = useState<ProjectCacheManifest>();
    const [summary, setSummary] = useState<ProjectCacheSummary>();
    const [selectedId, setSelectedId] = useState(searchParams.get("projectId") || "");
    const selectedIdRef = useRef(selectedId);
    selectedIdRef.current = selectedId;
    const [beginDetailRequest] = useState(() => createLatestRequestGuard());
    const [loading, setLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(false);
    const [keyword, setKeyword] = useState("");
    const [category, setCategory] = useState("");
    const [kind, setKind] = useState("");
    const [episodeId, setEpisodeId] = useState("");
    const [previewFile, setPreviewFile] = useState<ProjectCacheFile>();
    const [movingFile, setMovingFile] = useState<ProjectCacheFile>();
    const [moveProjectId, setMoveProjectId] = useState("");
    const [moveEpisodeId, setMoveEpisodeId] = useState("");
    const [moveCategory, setMoveCategory] = useState<ProjectCacheFile["category"]>("other");
    const [moving, setMoving] = useState(false);
    const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(() => new Set());
    const [selectionDownloading, setSelectionDownloading] = useState(false);
    const [favoriteOnly, setFavoriteOnly] = useState(false);
    const [favoriteUpdatingIds, setFavoriteUpdatingIds] = useState<Set<string>>(() => new Set());

    const loadList = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const result = await listProjectCaches(token);
            setCacheList(result);
            setSelectedId((current) => current || result.projects[0]?.projectId || (result.projects.some((item) => !item.projectId) ? "unassigned" : ""));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取缓存失败");
        } finally {
            setLoading(false);
        }
    }, [message, token]);

    const loadDetail = useCallback(async () => {
        if (!token || !selectedId) {
            beginDetailRequest();
            setManifest(undefined);
            setSummary(undefined);
            setDetailLoading(false);
            return;
        }
        const requestProjectId = selectedId;
        const isLatestRequest = beginDetailRequest();
        const isCurrentRequest = () => isLatestRequest() && selectedIdRef.current === requestProjectId;
        setDetailLoading(true);
        try {
            const result = await getProjectCache(requestProjectId, token);
            if (!isCurrentRequest()) return;
            setManifest(result.manifest);
            setSummary(result.summary);
        } catch (error) {
            if (!isCurrentRequest()) return;
            message.error(error instanceof Error ? error.message : "读取项目缓存失败");
        } finally {
            if (isCurrentRequest()) setDetailLoading(false);
        }
    }, [beginDetailRequest, message, selectedId, token]);

    useEffect(() => void loadList(), [loadList]);
    useEffect(() => void loadDetail(), [loadDetail]);
    useEffect(() => {
        const reset = createProjectCacheViewReset();
        setSelectedFileIds(reset.selectedFileIds);
        setCategory(reset.category);
        setKind(reset.kind);
        setEpisodeId(reset.episodeId);
        setFavoriteOnly(reset.favoriteOnly);
    }, [selectedId]);
    useEffect(() => {
        const readyIds = (manifest?.files || []).filter((item) => item.status === "ready").map((item) => item.id);
        setSelectedFileIds((current) => {
            const next = pruneCacheSelection(current, readyIds);
            return next.size === current.size ? current : next;
        });
    }, [manifest?.files]);

    const projectRows = useMemo(() => mergeProjectCacheState(cacheList?.projects || [], projects), [cacheList?.projects, projects]);
    const episodeOptions = useMemo(
        () => Array.from(new Map((manifest?.files || []).filter((item) => item.context.episodeId).map((item) => [item.context.episodeId, { value: item.context.episodeId, label: item.context.episodeName || item.context.episodeId }])).values()),
        [manifest?.files],
    );
    const filteredFiles = useMemo(() => filterProjectCacheFiles(manifest?.files || [], { category, episodeId, favoriteOnly, keyword, kind }), [category, episodeId, favoriteOnly, keyword, kind, manifest?.files]);
    const readyFilteredIds = filteredFiles.filter((item) => item.status === "ready").map((item) => item.id);
    const selectedFiles = (manifest?.files || []).filter((item) => item.status === "ready" && selectedFileIds.has(item.id));
    const allVisibleSelected = readyFilteredIds.length > 0 && readyFilteredIds.every((id) => selectedFileIds.has(id));
    const currentProjectId = manifest?.projectId || "";
    const currentPending = pendingItems.filter((item) => item.context.projectId === currentProjectId || (!currentProjectId && !item.context.projectId));
    const moveProject = projects.find((item) => item.id === moveProjectId);
    const moveEpisodeOptions = episodes.filter((item) => item.projectId === moveProjectId).map((item) => ({ value: item.id, label: item.title }));

    const downloadPackage = async () => {
        if (!token || !manifest || !selectedId || selectedId === "unassigned") return;
        const snapshot = buildProjectCacheSnapshot({
            projectId: manifest.projectId,
            projects: projects as never[],
            canvases: canvases as never[],
            episodes: episodes as never[],
            scenes: scenes as never[],
            storyboardShots: storyboardShots as never[],
            storyboardGroups: storyboardGroups as never[],
            assets: assets as never[],
            folders: folders as never[],
        });
        const packageSnapshot = { ...snapshot, project: snapshot.project || { id: manifest.projectId, title: manifest.projectName, status: manifest.status } };
        const preflight = await preflightProjectCachePackage(manifest.projectId, token);
        const proceed = async (continueOnMissing: boolean) => {
            try {
                await downloadProjectCachePackage(manifest.projectId, packageSnapshot, continueOnMissing, token, `${manifest.projectName || "项目"}.zip`);
                message.success("项目包已开始下载");
            } catch (error) {
                message.error(error instanceof Error ? error.message : "项目包生成失败");
            }
        };
        if (!preflight.missing.length) return proceed(false);
        modal.confirm({ title: "缓存中存在缺失文件", content: `有 ${preflight.missing.length} 个文件缺失。继续打包会在清单中记录缺失项。`, okText: "继续打包", cancelText: "取消", onOk: () => proceed(true) });
    };

    const downloadSelection = async () => {
        if (!token || !manifest || !selectedId || !selectedFiles.length) return;
        setSelectionDownloading(true);
        try {
            if (selectedFiles.length === 1) {
                const result = await fetchProjectCacheFileBlob(selectedFiles[0].id, token);
                saveAs(result.blob, result.filename || selectedFiles[0].originalName || selectedFiles[0].id);
            } else {
                await downloadProjectCacheSelection(selectedId, selectedFiles.map((item) => item.id), token, `${manifest.projectName || "未归属缓存"}__所选缓存.zip`);
            }
            message.success(`已开始下载 ${selectedFiles.length} 个所选文件`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "所选缓存下载失败");
        } finally {
            setSelectionDownloading(false);
        }
    };

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

    const removeFile = (file: ProjectCacheFile) => {
        if (!token) return;
        modal.confirm({
            title: "删除缓存文件？",
            content: "只删除磁盘缓存，不会删除浏览器里的画布和素材。此操作不可恢复。",
            okText: "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: async () => {
                await deleteProjectCacheFile(file.id, token);
                setSelectedFileIds((current) => {
                    const next = new Set(current);
                    next.delete(file.id);
                    return next;
                });
                await Promise.all([loadDetail(), loadList()]);
                message.success("缓存文件已删除");
            },
        });
    };

    const removeProjectCache = () => {
        if (!token || !manifest?.projectId) return;
        modal.confirm({
            title: "清空整个项目缓存？",
            content: "磁盘中的项目缓存将被永久删除；浏览器本地项目不受影响。建议先生成项目包。",
            okText: "永久删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: async () => {
                await deleteProjectCache(manifest.projectId, token);
                setSelectedId("");
                setManifest(undefined);
                setSelectedFileIds(new Set());
                await loadList();
                message.success("项目缓存已清理");
            },
        });
    };

    const openMoveFile = (file: ProjectCacheFile) => {
        setMovingFile(file);
        setMoveProjectId("");
        setMoveEpisodeId("");
        setMoveCategory(file.category || "other");
    };

    const moveFile = async () => {
        if (!token || !movingFile || !moveProject) return;
        const targetEpisode = episodes.find((item) => item.id === moveEpisodeId && item.projectId === moveProject.id);
        setMoving(true);
        try {
            await moveProjectCacheFile(
                movingFile.id,
                { ...movingFile.context, projectId: moveProject.id, projectName: moveProject.title, episodeId: targetEpisode?.id || "", episodeName: targetEpisode?.title || "", canvasId: "", canvasName: "", category: moveCategory, freeCanvas: false },
                token,
            );
            setMovingFile(undefined);
            await Promise.all([loadDetail(), loadList()]);
            message.success("已归属到项目缓存");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "移动缓存失败");
        } finally {
            setMoving(false);
        }
    };

    return (
        <main className="studio-workspace studio-shell h-full min-h-0 overflow-hidden bg-[var(--studio-shell-bg)] p-4 text-[var(--studio-text-primary)] md:p-6">
            <div className="mx-auto flex h-full max-w-[1680px] min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] shadow-[var(--studio-shadow)]">
                <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--studio-border-subtle)] px-5 py-4">
                    <div>
                        <h1 className="text-2xl font-semibold">缓存管理</h1>
                        <p className="mt-1 text-sm text-[var(--studio-text-secondary)]">按项目自动落盘，统一打包与清理</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--studio-text-secondary)]">
                        <Tag icon={<Database className="size-3.5" />}>{cacheList?.totalFiles || 0} 个文件</Tag>
                        <Tag>{formatBytes(cacheList?.totalBytes || 0)}</Tag>
                        {cacheList?.pendingCount || pendingItems.length ? <Tag color="warning">{(cacheList?.pendingCount || 0) + pendingItems.length} 项待处理</Tag> : null}
                        <Button icon={<RefreshCw className="size-4" />} onClick={() => void Promise.all([loadList(), loadDetail()])}>
                            重新检查
                        </Button>
                    </div>
                </header>
                {loading ? (
                    <div className="grid flex-1 place-items-center">
                        <Spin description="正在读取磁盘缓存" />
                    </div>
                ) : projectRows.length ? (
                    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]">
                        <CacheProjectList
                            items={projectRows}
                            selectedId={selectedId}
                            onSelect={setSelectedId}
                        />
                        <section className="thin-scrollbar min-h-0 overflow-y-auto p-5">
                            {detailLoading ? (
                                <div className="grid min-h-80 place-items-center">
                                    <Spin />
                                </div>
                            ) : manifest && summary ? (
                                <>
                                    <div className="flex flex-wrap items-start justify-between gap-4">
                                        <div>
                                            <h2 className="text-xl font-semibold">{manifest.projectName || "未归属缓存"}</h2>
                                            <button
                                                type="button"
                                                className="mt-2 inline-flex max-w-full items-center gap-2 truncate text-xs text-[var(--studio-text-muted)] hover:text-[var(--studio-accent)]"
                                                onClick={() => {
                                                    copy(summary.path);
                                                    message.success("目录路径已复制");
                                                }}
                                            >
                                                <Copy className="size-3.5" />
                                                {summary.path}
                                            </button>
                                        </div>
                                        <div className="flex gap-2">
                                            {currentPending.length ? <Button onClick={() => currentPending.forEach((item) => retryPending(item.id))}>重试 {currentPending.length} 项</Button> : null}
                                            {manifest.projectId ? (
                                                <Button type="primary" icon={<Archive className="size-4" />} onClick={() => void downloadPackage()}>
                                                    生成完整项目包
                                                </Button>
                                            ) : null}
                                            {manifest.projectId ? (
                                                <Button danger icon={<Trash2 className="size-4" />} onClick={removeProjectCache}>
                                                    清理项目缓存
                                                </Button>
                                            ) : null}
                                        </div>
                                    </div>
                                    <div className="mt-5 flex flex-wrap gap-2 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3">
                                        <Input allowClear value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索文件" className="w-56" />
                                        <Select allowClear value={episodeId || undefined} onChange={(value) => setEpisodeId(value || "")} placeholder="全部分集" className="w-40" options={episodeOptions} />
                                        <Select
                                            allowClear
                                            value={category || undefined}
                                            onChange={(value) => setCategory(value || "")}
                                            placeholder="全部分类"
                                            className="w-36"
                                            options={[
                                                { value: "character", label: "角色" },
                                                { value: "scene", label: "场景" },
                                                { value: "prop", label: "道具" },
                                                { value: "storyboard", label: "分镜" },
                                                { value: "other", label: "其他" },
                                            ]}
                                        />
                                        <Select
                                            allowClear
                                            value={kind || undefined}
                                            onChange={(value) => setKind(value || "")}
                                            placeholder="全部类型"
                                            className="w-32"
                                            options={[
                                                { value: "image", label: "图片" },
                                                { value: "video", label: "视频" },
                                                { value: "audio", label: "音频" },
                                            ]}
                                        />
                                        <Button
                                            type={favoriteOnly ? "primary" : "default"}
                                            icon={<Star className={`size-4 ${favoriteOnly ? "fill-current" : ""}`} />}
                                            aria-pressed={favoriteOnly}
                                            onClick={() => setFavoriteOnly((value) => !value)}
                                        >
                                            只看收藏视频
                                        </Button>
                                    </div>
                                    <div className="mt-3 flex flex-wrap items-center gap-2 border-b border-[var(--studio-border-subtle)] pb-3">
                                        <span className="mr-auto text-sm text-[var(--studio-text-secondary)]">已选 <strong className="text-[var(--studio-text-primary)]">{selectedFiles.length}</strong> 项</span>
                                        <Button size="small" disabled={!readyFilteredIds.length} onClick={() => setSelectedFileIds((current) => toggleVisibleCacheSelection(current, readyFilteredIds))}>{allVisibleSelected ? "取消当前全选" : "全选当前结果"}</Button>
                                        <Button size="small" disabled={!selectedFiles.length} onClick={() => setSelectedFileIds(new Set())}>清空</Button>
                                        <Button size="small" type="primary" icon={<Download className="size-3.5" />} loading={selectionDownloading} disabled={!selectedFiles.length} onClick={() => void downloadSelection()}>下载所选{selectedFiles.length ? ` (${selectedFiles.length})` : ""}</Button>
                                    </div>
                                    <div className="mt-4">
                                        <CacheFileGrid files={filteredFiles} favoriteUpdatingIds={favoriteUpdatingIds} selectedIds={selectedFileIds} onToggleFavorite={toggleFavorite} onToggleSelect={(file) => setSelectedFileIds((current) => { const next = new Set(current); if (next.has(file.id)) next.delete(file.id); else next.add(file.id); return next; })} onDelete={removeFile} onMove={!manifest.projectId ? openMoveFile : undefined} onPreview={setPreviewFile} />
                                    </div>
                                </>
                            ) : (
                                <Empty description="请选择一个项目缓存" />
                            )}
                        </section>
                    </div>
                ) : (
                    <Empty className="my-auto" description="还没有项目缓存；生成成功的媒体会自动出现在这里" />
                )}
            </div>
            <CacheFilePreviewModal file={previewFile} onClose={() => setPreviewFile(undefined)} />
            <Modal open={Boolean(movingFile)} title="归属未分类缓存" okText="确认移动" cancelText="取消" confirmLoading={moving} okButtonProps={{ disabled: !moveProjectId }} onCancel={() => setMovingFile(undefined)} onOk={() => void moveFile()}>
                <div className="grid gap-4 py-2">
                    <div>
                        <div className="mb-1.5 text-sm text-[var(--studio-text-secondary)]">目标项目</div>
                        <Select
                            showSearch
                            optionFilterProp="label"
                            className="w-full"
                            value={moveProjectId || undefined}
                            placeholder="选择项目"
                            options={projects.map((item) => ({ value: item.id, label: item.title }))}
                            onChange={(value) => {
                                setMoveProjectId(value);
                                setMoveEpisodeId("");
                            }}
                        />
                    </div>
                    <div>
                        <div className="mb-1.5 text-sm text-[var(--studio-text-secondary)]">分集（可选）</div>
                        <Select allowClear className="w-full" value={moveEpisodeId || undefined} placeholder="不选则归入项目共享" disabled={!moveProjectId} options={moveEpisodeOptions} onChange={(value) => setMoveEpisodeId(value || "")} />
                    </div>
                    <div>
                        <div className="mb-1.5 text-sm text-[var(--studio-text-secondary)]">业务分类</div>
                        <Select
                            className="w-full"
                            value={moveCategory}
                            options={[
                                { value: "character", label: "角色" },
                                { value: "scene", label: "场景" },
                                { value: "prop", label: "道具" },
                                { value: "storyboard", label: "分镜" },
                                { value: "other", label: "其他" },
                            ]}
                            onChange={setMoveCategory}
                        />
                    </div>
                </div>
            </Modal>
        </main>
    );
}

function formatBytes(bytes: number) {
    if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
