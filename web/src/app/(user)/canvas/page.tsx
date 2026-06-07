"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Tag } from "antd";
import { Download, FileUp, Plus } from "lucide-react";

import { readZip } from "@/lib/zip";
import { setMediaBlob } from "@/services/file-storage";
import { setImageBlob } from "@/services/image-storage";
import { CanvasDeleteProjectsDialog } from "./components/canvas-delete-projects-dialog";
import { CanvasCreateProjectModal } from "./components/canvas-create-project-modal";
import { CanvasProjectCard } from "./components/canvas-project-card";
import type { CanvasExportFile } from "./export-types";
import { useCanvasStore } from "./stores/use-canvas-store";
import { useCanvasUiStore } from "./stores/use-canvas-ui-store";
import { useAssetStore } from "@/stores/use-asset-store";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { useCreativeProjectStore } from "../projects/use-creative-project-store";
import { canvasNodeToAsset, hydrateCanvasNodeAssetUrls } from "./utils/canvas-assets";
import { exportCanvasProjects } from "./utils/canvas-export";
import type { CanvasProjectPreset } from "./utils/canvas-project-preset";

export default function CanvasPage() {
    const { message } = App.useApp();
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);
    const effectiveConfig = useEffectiveConfig();
    const [createOpen, setCreateOpen] = useState(false);
    const hydrated = useCanvasStore((state) => state.hydrated);
    const projects = useCanvasStore((state) => state.projects);
    const createProject = useCanvasStore((state) => state.createProject);
    const importProject = useCanvasStore((state) => state.importProject);
    const ensureUnfiledProject = useCreativeProjectStore((state) => state.ensureUnfiledProject);
    const attachCanvasToCreativeProject = useCreativeProjectStore((state) => state.attachCanvas);
    const addAssetOnce = useAssetStore((state) => state.addAssetOnce);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);

    const enterProject = (id: string) => {
        router.push(`/canvas/${id}`);
    };
    const defaultProjectTitle = `眨眼之间 ${projects.length + 1}`;
    const createAndEnter = (title: string, preset: CanvasProjectPreset) => {
        setCreateOpen(false);
        const creativeProjectId = ensureUnfiledProject(preset);
        const canvasId = createProject(title, preset, { projectId: creativeProjectId });
        attachCanvasToCreativeProject(creativeProjectId, canvasId);
        enterProject(canvasId);
    };
    const importCanvas = async (file?: File) => {
        if (!file) return;
        try {
            const zip = await readZip(file);
            const projectFile = zip.get("projects.json");
            if (!projectFile) throw new Error("missing projects.json");
            const data = JSON.parse(await projectFile.text()) as CanvasExportFile;
            const restoredUrls = new Map<string, string>();
            await Promise.all(
                data.projects.flatMap((project) =>
                    project.files.map(async (item) => {
                        const blob = zip.get(item.path);
                        if (!blob) return;
                        const typedBlob = blob.type ? blob : blob.slice(0, blob.size, item.mimeType);
                        const url = await (item.storageKey.startsWith("image:") ? setImageBlob(item.storageKey, typedBlob) : setMediaBlob(item.storageKey, typedBlob));
                        restoredUrls.set(item.storageKey, url);
                    }),
                ),
            );
            let assetCount = 0;
            for (const item of data.projects) {
                const project = { ...item.project, nodes: (item.project.nodes || []).map((node) => hydrateCanvasNodeAssetUrls(node, restoredUrls)) };
                const canvasId = importProject(project);
                if (project.projectId) attachCanvasToCreativeProject(project.projectId, canvasId);
                for (const node of project.nodes) {
                    const asset = canvasNodeToAsset(node);
                    if (!asset) continue;
                    await addAssetOnce(asset);
                    assetCount += 1;
                }
            }
            message.success(`已导入 ${data.projects.length} 个画布${assetCount ? `，${assetCount} 个素材已加入我的素材` : ""}`);
        } catch {
            message.error("导入失败，请选择有效的画布压缩包");
        } finally {
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    return (
        <main className="studio-shell h-full overflow-auto text-stone-950 dark:text-stone-100">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-8">
                <header className="grid gap-5 border-b border-stone-950/10 pb-6 dark:border-white/10 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
                    <div>
                        <p className="text-xs font-medium tracking-[0.22em] text-teal-700 dark:text-teal-200">画布库</p>
                        <h1 className="mt-3 text-4xl font-semibold leading-tight">眨眼之间</h1>
                        <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600 dark:text-stone-300">所有本地画布入口集中在这里，适合回看节点结构、导出压缩包或进入承接画布继续调整。</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Tag className="m-0 border-teal-700/25 bg-teal-700/10 px-3 py-1 text-teal-700 dark:border-teal-200/25 dark:bg-teal-200/10 dark:text-teal-100">画布 {projects.length}</Tag>
                        <Tag className="m-0 border-amber-600/25 bg-amber-500/10 px-3 py-1 text-amber-700 dark:border-amber-300/25 dark:text-amber-200">已选 {selectedIds.length}</Tag>
                        {selectedIds.length ? (
                            <>
                                <Button
                                    disabled={!hydrated}
                                    icon={<Download className="size-4" />}
                                    onClick={() =>
                                        void exportCanvasProjects(
                                            projects.filter((project) => selectedIds.includes(project.id)),
                                            `眨眼之间-${selectedIds.length}个项目`,
                                        )
                                    }
                                >
                                    导出选中
                                </Button>
                                <Button disabled={!hydrated} onClick={() => setDeleteIds(selectedIds)}>
                                    删除选中
                                </Button>
                            </>
                        ) : null}
                        {projects.length ? (
                            <Button disabled={!hydrated} onClick={() => setDeleteIds(projects.map((project) => project.id))}>
                                删除全部
                            </Button>
                        ) : null}
                        <Button disabled={!hydrated} icon={<FileUp className="size-4" />} onClick={() => inputRef.current?.click()}>
                            导入画布
                        </Button>
                        <Button disabled={!hydrated} type="primary" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
                            新建画布
                        </Button>
                    </div>
                </header>

                {!hydrated ? (
                    <section className="flex min-h-[360px] items-center justify-center border-y border-stone-200 text-sm text-stone-500 dark:border-stone-800">正在加载画布...</section>
                ) : projects.length ? (
                    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                        {projects.map((project) => (
                            <CanvasProjectCard key={project.id} project={project} />
                        ))}
                    </div>
                ) : (
                    <section className="flex min-h-[360px] flex-col items-center justify-center border-y border-stone-200 text-center dark:border-stone-800">
                        <h2 className="text-xl font-medium">还没有画布</h2>
                        <p className="mt-3 text-sm text-stone-500">新建一个画布后，就可以独立保存节点、连线和画布外观。</p>
                        <Button type="primary" className="mt-6" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
                            新建画布
                        </Button>
                    </section>
                )}
            </div>

            <input ref={inputRef} type="file" accept="application/zip,.zip" className="hidden" onChange={(event) => void importCanvas(event.target.files?.[0])} />
            <CanvasDeleteProjectsDialog />
            <CanvasCreateProjectModal open={createOpen} defaultTitle={defaultProjectTitle} config={effectiveConfig} onCancel={() => setCreateOpen(false)} onCreate={createAndEnter} />
        </main>
    );
}
