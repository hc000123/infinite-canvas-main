"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { App, Button, Empty, Select } from "antd";
import { ArrowRight, Clapperboard, FolderPlus } from "lucide-react";
import { saveAs } from "file-saver";
import { useRouter, useSearchParams } from "next/navigation";

import { AssetPickerModal, type InsertAssetPayload } from "@/app/(user)/canvas/components/asset-picker-modal";
import { canvasEpisodeContextFromEpisode } from "@/app/(user)/canvas/utils/canvas-episode-context";
import { episodeMainCanvas } from "@/app/(user)/canvas/utils/episode-canvas-hierarchy";
import { createUserScopedLocalForage } from "@/lib/user-scoped-localforage";
import { deleteStoredImages, uploadImage } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import { useCanvasStore } from "../canvas/stores/use-canvas-store";
import { useScriptStore } from "../canvas/stores/use-script-store";
import { useStoryboardStore } from "../canvas/stores/use-storyboard-store";
import type { StoryboardTableShot, StoryboardWorkbenchImage } from "../canvas/utils/storyboard-management";
import { useCreativeProjectStore } from "../projects/use-creative-project-store";
import { StoryboardCandidateGrid } from "./components/storyboard-candidate-grid";
import { StoryboardShotEditor } from "./components/storyboard-shot-editor";
import { StoryboardShotRail } from "./components/storyboard-shot-rail";
import { useStoryboardImageGeneration } from "./use-storyboard-image-generation";
import { copyableShotConfig, defaultShotImagePrompt, orderedEpisodeShots, storyboardCandidateAssetInput } from "./storyboard-workbench";

const selectionStore = createUserScopedLocalForage("storyboard_image_workbench_selection");
type SavedSelection = { projectId: string; episodeId: string };

export function StoryboardImageWorkbench() {
    const { message, modal } = App.useApp();
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialized = useRef(false);
    const projectsHydrated = useCreativeProjectStore((state) => state.hydrated);
    const projects = useCreativeProjectStore((state) => state.projects);
    const scriptHydrated = useScriptStore((state) => state.hydrated);
    const episodes = useScriptStore((state) => state.episodes);
    const scenes = useScriptStore((state) => state.scenes);
    const canvases = useCanvasStore((state) => state.projects);
    const ensureEpisodeMainCanvas = useCanvasStore((state) => state.ensureEpisodeMainCanvas);
    const tableShots = useStoryboardStore((state) => state.tableShots);
    const workbenchImages = useStoryboardStore((state) => state.workbenchImages);
    const addTableShot = useStoryboardStore((state) => state.addTableShot);
    const updateTableShot = useStoryboardStore((state) => state.updateTableShot);
    const removeTableShot = useStoryboardStore((state) => state.removeTableShot);
    const reorderTableShot = useStoryboardStore((state) => state.reorderTableShot);
    const addWorkbenchImage = useStoryboardStore((state) => state.addWorkbenchImage);
    const updateWorkbenchImage = useStoryboardStore((state) => state.updateWorkbenchImage);
    const removeWorkbenchImage = useStoryboardStore((state) => state.removeWorkbenchImage);
    const selectCandidate = useStoryboardStore((state) => state.selectCandidate);
    const addAssetOnce = useAssetStore((state) => state.addAssetOnce);
    const [projectId, setProjectId] = useState(searchParams.get("projectId") || "");
    const [episodeId, setEpisodeId] = useState(searchParams.get("episodeId") || "");
    const [activeShotId, setActiveShotId] = useState("");
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);

    const activeProjects = useMemo(() => projects.filter((project) => project.status === "active"), [projects]);
    const activeProject = activeProjects.find((project) => project.id === projectId);
    const projectEpisodes = useMemo(() => episodes.filter((episode) => episode.projectId === projectId).sort((left, right) => left.order - right.order), [episodes, projectId]);
    const activeEpisode = projectEpisodes.find((episode) => episode.id === episodeId);
    const boundCanvas = activeProject && activeEpisode ? episodeMainCanvas(canvases, activeProject.id, activeEpisode.id) : undefined;
    const shots = useMemo(() => (boundCanvas && activeEpisode ? orderedEpisodeShots(tableShots, boundCanvas.id, activeEpisode.id) : []), [activeEpisode, boundCanvas, tableShots]);
    const activeShot = shots.find((shot) => shot.id === activeShotId) || shots[0];
    const activeReferences = useMemo(() => {
        if (!activeShot) return [];
        const byId = new Map(workbenchImages.map((image) => [image.id, image]));
        return (activeShot.referenceImageIds || []).map((id) => byId.get(id)).filter((image): image is StoryboardWorkbenchImage => Boolean(image?.role === "reference"));
    }, [activeShot, workbenchImages]);
    const activeCandidates = useMemo(() => workbenchImages.filter((image) => image.shotId === activeShot?.id && image.role === "candidate").sort((left, right) => right.createdAt.localeCompare(left.createdAt)), [activeShot?.id, workbenchImages]);
    const candidatesById = useMemo(() => new Map(workbenchImages.filter((image) => image.role === "candidate").map((image) => [image.id, image])), [workbenchImages]);
    const generation = useStoryboardImageGeneration({ shot: activeShot, references: activeReferences, addWorkbenchImage });

    useEffect(() => {
        if (!projectsHydrated || !scriptHydrated || initialized.current) return;
        initialized.current = true;
        void selectionStore.getItem<SavedSelection>("last").then((saved) => {
            const queryProjectId = searchParams.get("projectId") || "";
            const nextProjectId = activeProjects.some((project) => project.id === queryProjectId) ? queryProjectId : activeProjects.some((project) => project.id === saved?.projectId) ? saved!.projectId : activeProjects[0]?.id || "";
            const scoped = episodes.filter((episode) => episode.projectId === nextProjectId).sort((left, right) => left.order - right.order);
            const queryEpisodeId = searchParams.get("episodeId") || "";
            const nextEpisodeId = scoped.some((episode) => episode.id === queryEpisodeId) ? queryEpisodeId : scoped.some((episode) => episode.id === saved?.episodeId) ? saved!.episodeId : scoped[0]?.id || "";
            setProjectId(nextProjectId);
            setEpisodeId(nextEpisodeId);
        });
    }, [activeProjects, episodes, projectsHydrated, scriptHydrated, searchParams]);

    useEffect(() => {
        if (!projectId) return;
        const params = new URLSearchParams(searchParams.toString());
        params.set("projectId", projectId);
        if (episodeId) params.set("episodeId", episodeId);
        else params.delete("episodeId");
        const nextQuery = params.toString();
        if (nextQuery !== searchParams.toString()) router.replace(`/storyboard?${nextQuery}`, { scroll: false });
        void selectionStore.setItem("last", { projectId, episodeId } satisfies SavedSelection);
    }, [episodeId, projectId, router, searchParams]);

    useEffect(() => {
        if (!shots.length) {
            setActiveShotId("");
            return;
        }
        if (!shots.some((shot) => shot.id === activeShotId)) setActiveShotId(shots[0].id);
    }, [activeShotId, shots]);

    const chooseProject = (nextProjectId: string) => {
        const firstEpisode = episodes.filter((episode) => episode.projectId === nextProjectId).sort((left, right) => left.order - right.order)[0];
        setProjectId(nextProjectId);
        setEpisodeId(firstEpisode?.id || "");
        setActiveShotId("");
    };

    const ensureCanvas = () => {
        if (!activeProject || !activeEpisode) return "";
        if (boundCanvas) return boundCanvas.id;
        return ensureEpisodeMainCanvas({
            projectId: activeProject.id,
            title: `${activeProject.title} / ${activeEpisode.title}`,
            preset: activeProject.preset,
            episodeContext: canvasEpisodeContextFromEpisode(activeProject.id, activeEpisode, scenes.filter((scene) => scene.episodeId === activeEpisode.id)),
        });
    };

    const addShots = (count: number) => {
        const canvasId = ensureCanvas();
        if (!canvasId || !activeProject || !activeEpisode) return;
        const startOrder = tableShots.filter((shot) => shot.canvasId === canvasId && shot.episodeId === activeEpisode.id).reduce((max, shot) => Math.max(max, shot.order), 0);
        let firstId = "";
        for (let index = 0; index < count; index += 1) {
            const order = startOrder + index + 1;
            const id = addTableShot({ projectId: activeProject.id, canvasId, episodeId: activeEpisode.id, sceneName: "未分场", location: "", timeOfDay: "", title: `镜头 ${order}`, scriptText: "", visualDescription: "", characters: [], dialogue: "", action: "", emotion: "", shotSize: "", cameraMovement: "", estimatedDuration: 5, assetNeeds: [], assetRefs: [], productionBibleRefs: [] });
            if (!firstId) firstId = id;
        }
        setActiveShotId(firstId);
    };

    const deleteShot = (id: string) => {
        const index = shots.findIndex((shot) => shot.id === id);
        const related = workbenchImages.filter((image) => image.shotId === id && !image.savedAssetId);
        void deleteStoredImages(related.map((image) => image.storageKey).filter((key): key is string => Boolean(key)));
        removeTableShot(id);
        setActiveShotId(shots[index + 1]?.id || shots[index - 1]?.id || "");
    };

    const appendReference = async (payload: Blob | string, title: string, source: StoryboardWorkbenchImage["source"], sourceAssetId?: string) => {
        if (!activeShot) return;
        const stored = await uploadImage(payload);
        const id = addWorkbenchImage({ projectId: activeShot.projectId, canvasId: activeShot.canvasId, episodeId: activeShot.episodeId, shotId: activeShot.id, role: "reference", source, sourceAssetId, title, dataUrl: stored.url, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType });
        const latest = useStoryboardStore.getState().tableShots.find((shot) => shot.id === activeShot.id);
        updateTableShot(activeShot.id, { referenceImageIds: [...(latest?.referenceImageIds || []), id] });
    };

    const uploadReferences = async (files: FileList | null) => {
        let failed = 0;
        for (const file of Array.from(files || []).filter((item) => item.type.startsWith("image/"))) {
            try { await appendReference(file, file.name, "upload"); } catch { failed += 1; }
        }
        if (failed) message.warning(`${failed} 张参考图上传失败`);
    };

    const addClipboardReferences = async () => {
        try {
            const items = await navigator.clipboard.read();
            const blobs = await Promise.all(items.flatMap((item) => item.types.filter((type) => type.startsWith("image/")).map((type) => item.getType(type))));
            if (!blobs.length) return message.warning("剪切板里没有图片");
            for (const [index, blob] of blobs.entries()) await appendReference(blob, `剪切板参考图 ${index + 1}`, "clipboard");
        } catch { message.error("无法读取剪切板图片"); }
    };

    const insertAssetReference = async (payload: InsertAssetPayload) => {
        if (payload.kind !== "image") return;
        await appendReference(payload.dataUrl, payload.title, "asset", payload.sourceAssetId);
        setAssetPickerOpen(false);
    };

    const reusePrevious = async () => {
        if (!activeShot) return;
        const index = shots.findIndex((shot) => shot.id === activeShot.id);
        const previous = shots[index - 1];
        if (!previous) return;
        const sourceReferences = (previous.referenceImageIds || []).map((id) => workbenchImages.find((image) => image.id === id)).filter((image): image is StoryboardWorkbenchImage => Boolean(image));
        const clonedIds: string[] = [];
        for (const reference of sourceReferences) {
            const stored = await uploadImage(reference.dataUrl);
            clonedIds.push(addWorkbenchImage({ projectId: activeShot.projectId, canvasId: activeShot.canvasId, episodeId: activeShot.episodeId, shotId: activeShot.id, role: "reference", source: reference.source, sourceAssetId: reference.sourceAssetId, title: reference.title, dataUrl: stored.url, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType }));
        }
        const copied = copyableShotConfig(previous);
        updateTableShot(activeShot.id, { imagePrompt: copied.imagePrompt, imageConfig: copied.imageConfig, referenceImageIds: clonedIds });
        message.success("已复用上一镜的提示词、参考图和图片参数");
    };

    const addCandidateAsReference = async (candidate: StoryboardWorkbenchImage) => {
        await appendReference(candidate.dataUrl, `${candidate.title} · 参考`, "candidate");
        message.success("已加入当前镜头参考图");
    };

    const removeReference = (reference: StoryboardWorkbenchImage) => {
        if (reference.storageKey) void deleteStoredImages([reference.storageKey]);
        removeWorkbenchImage(reference.id);
    };

    const deleteCandidate = (candidate: StoryboardWorkbenchImage) => modal.confirm({ title: "删除这张候选图？", content: candidate.savedAssetId ? "正式资产会保留，只移除工作台候选记录。" : "该候选的本地工作文件会被移除。", okText: "删除", okButtonProps: { danger: true }, cancelText: "取消", onOk: () => { if (!candidate.savedAssetId && candidate.storageKey) void deleteStoredImages([candidate.storageKey]); removeWorkbenchImage(candidate.id); } });

    const saveCandidateAsset = async (candidate: StoryboardWorkbenchImage) => {
        if (!activeShot || candidate.savedAssetId) return;
        const assetId = await addAssetOnce(storyboardCandidateAssetInput(activeShot, candidate));
        updateWorkbenchImage(candidate.id, { savedAssetId: assetId });
        message.success("已保存到资产库");
    };

    if (!projectsHydrated || !scriptHydrated) return <div className="grid h-full place-items-center bg-[var(--studio-shell-bg)] text-sm text-[var(--studio-text-muted)]">正在读取项目分镜…</div>;
    if (!activeProjects.length) return <EmptyState title="还没有可用项目" description="先创建项目和剧本集数，再开始制作分镜。" action={<Button type="primary" onClick={() => router.push("/projects")}>前往项目中心</Button>} />;

    return (
        <div className="studio-workspace flex h-full min-h-0 flex-col overflow-hidden bg-[var(--studio-shell-bg)] text-[var(--studio-text-primary)]">
            <header className="border-b border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div><div className="flex items-center gap-2 text-xs text-[var(--studio-accent)]"><Clapperboard className="size-3.5" />分镜制作</div><h1 className="mt-1 text-xl font-semibold">分镜制作台</h1></div>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2"><Select className="min-w-44" value={projectId || undefined} placeholder="选择项目" options={activeProjects.map((project) => ({ label: project.title, value: project.id }))} onChange={chooseProject} /><ArrowRight className="size-4 text-[var(--studio-text-muted)]" /><Select className="min-w-44" value={episodeId || undefined} placeholder="选择集数" options={projectEpisodes.map((episode) => ({ label: `${episode.code} · ${episode.title}`, value: episode.id }))} onChange={(value) => { setEpisodeId(value); setActiveShotId(""); }} /></div>
                </div>
            </header>
            {!projectEpisodes.length ? <EmptyState title="当前项目还没有集数" description="请先在项目详情导入或创建剧本集数。" action={<Button type="primary" onClick={() => router.push(`/projects/${projectId}`)}>打开项目</Button>} /> : <>
                <StoryboardShotRail shots={shots} activeId={activeShot?.id || ""} candidatesById={candidatesById} onAdd={addShots} onDelete={deleteShot} onReorder={reorderTableShot} onSelect={setActiveShotId} />
                {activeShot ? <main className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(360px,420px)_minmax(0,1fr)] lg:overflow-hidden"><StoryboardShotEditor shot={activeShot} references={activeReferences} running={generation.running} hasPrevious={shots.findIndex((shot) => shot.id === activeShot.id) > 0} onAddClipboard={() => void addClipboardReferences()} onGenerate={() => { if (!activeShot.imagePrompt) updateTableShot(activeShot.id, { imagePrompt: defaultShotImagePrompt(activeShot) }); void generation.generate(); }} onOpenAssets={() => setAssetPickerOpen(true)} onRemoveReference={removeReference} onReusePrevious={() => void reusePrevious()} onUpdate={(patch) => updateTableShot(activeShot.id, patch)} onUpload={(files) => void uploadReferences(files)} /><StoryboardCandidateGrid candidates={activeCandidates} selectedId={activeShot.selectedCandidateId} slots={generation.slots} onAddReference={(candidate) => void addCandidateAsReference(candidate)} onDelete={deleteCandidate} onDownload={(candidate) => saveAs(candidate.dataUrl, `${activeShot.title || "storyboard"}-${candidate.id}.png`)} onRetry={(slotId) => void generation.retry(slotId)} onSaveAsset={(candidate) => void saveCandidateAsset(candidate)} onSelect={(candidate) => selectCandidate(activeShot.id, activeShot.selectedCandidateId === candidate.id ? undefined : candidate.id)} /></main> : <EmptyState title="当前集还没有分镜槽位" description="新增一个镜头，或一次创建 5 个空槽位开始制作。" action={<div className="flex gap-2"><Button onClick={() => addShots(5)}>新增 5 镜</Button><Button type="primary" icon={<FolderPlus className="size-4" />} onClick={() => addShots(1)}>新增镜头</Button></div>} />}
            </>}
            <AssetPickerModal open={assetPickerOpen} title="选择分镜参考图" defaultTab="my-assets" allowedKinds={["image"]} projectId={projectId} episodeId={episodeId} onInsert={(payload) => void insertAssetReference(payload)} onClose={() => setAssetPickerOpen(false)} />
        </div>
    );
}

function EmptyState({ title, description, action }: { title: string; description: string; action: ReactNode }) {
    return <div className="grid min-h-0 flex-1 place-items-center bg-[var(--studio-shell-bg)] p-6"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<div><div className="text-base font-semibold text-[var(--studio-text-primary)]">{title}</div><div className="mt-1 text-sm text-[var(--studio-text-muted)]">{description}</div><div className="mt-4 flex justify-center">{action}</div></div>} /></div>;
}
