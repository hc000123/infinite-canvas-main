"use client";

import { useRef } from "react";
import { Button, Input } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { ClipboardPaste, FolderPlus, Images, Sparkles, Trash2, Upload } from "lucide-react";

import { ImageSettingsPanel } from "@/components/image-settings-panel";
import { ModelPicker } from "@/components/model-picker";
import { canvasThemes } from "@/lib/canvas-theme";
import { useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import type { StoryboardImageConfig, StoryboardTableShot, StoryboardWorkbenchImage } from "../../canvas/utils/storyboard-management";
import { defaultShotImagePrompt, referenceToken } from "../storyboard-workbench";

type Props = {
    shot: StoryboardTableShot;
    references: StoryboardWorkbenchImage[];
    running: boolean;
    hasPrevious: boolean;
    onAddClipboard: () => void;
    onGenerate: () => void;
    onOpenAssets: () => void;
    onRemoveReference: (reference: StoryboardWorkbenchImage) => void;
    onReusePrevious: () => void;
    onUpdate: (patch: Partial<StoryboardTableShot>) => void;
    onUpload: (files: FileList | null) => void;
};

export function StoryboardShotEditor({ shot, references, running, hasPrevious, onAddClipboard, onGenerate, onOpenAssets, onRemoveReference, onReusePrevious, onUpdate, onUpload }: Props) {
    const promptRef = useRef<TextAreaRef>(null);
    const uploadRef = useRef<HTMLInputElement>(null);
    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const updateGlobalConfig = useConfigStore((state) => state.updateConfig);
    const allowCustomModel = useConfigStore((state) => state.publicSettings?.modelChannel.allowCustomChannel !== false);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const prompt = shot.imagePrompt ?? defaultShotImagePrompt(shot);
    const localConfig = shot.imageConfig;
    const mergedConfig = { ...effectiveConfig, ...(localConfig || {}) } as AiConfig;
    const model = localConfig?.imageModel || effectiveConfig.imageModel || effectiveConfig.model;

    const updateImageConfig = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => {
        updateGlobalConfig(key, value);
        const next: StoryboardImageConfig = {
            imageModel: key === "imageModel" ? String(value) : model,
            quality: key === "quality" ? String(value) : String(mergedConfig.quality || ""),
            size: key === "size" ? String(value) : String(mergedConfig.size || ""),
            count: key === "count" ? String(value) : String(mergedConfig.count || "1"),
        };
        onUpdate({ imageConfig: next });
    };

    const insertReference = (index: number) => {
        const textarea = promptRef.current?.resizableTextArea?.textArea;
        const start = textarea?.selectionStart ?? prompt.length;
        const end = textarea?.selectionEnd ?? prompt.length;
        const token = referenceToken(index);
        const prefix = prompt.slice(0, start);
        const suffix = prompt.slice(end);
        const left = prefix && !/\s$/.test(prefix) ? " " : "";
        const right = suffix && !/^\s/.test(suffix) ? " " : "";
        const next = `${prefix}${left}${token}${right}${suffix}`;
        onUpdate({ imagePrompt: next });
        requestAnimationFrame(() => {
            const caret = prefix.length + left.length + token.length;
            promptRef.current?.focus();
            textarea?.setSelectionRange(caret, caret);
        });
    };

    return (
        <aside className="thin-scrollbar min-h-0 overflow-y-auto border-r border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4 lg:p-5">
            <div className="mb-4 flex items-start justify-between gap-3 border-b border-[var(--studio-border-subtle)] pb-4">
                <div><div className="text-xs text-[var(--studio-accent)]">当前镜头配置</div><h2 className="mt-1 text-lg font-semibold text-[var(--studio-text-primary)]">镜头 {shot.order} · {shot.title}</h2></div>
                <Button size="small" icon={<Images className="size-3.5" />} disabled={!hasPrevious} onClick={onReusePrevious}>复用上一镜</Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <label className="col-span-2 text-xs text-[var(--studio-text-secondary)]">镜头标题<Input className="!mt-1.5" value={shot.title} onChange={(event) => onUpdate({ title: event.target.value })} /></label>
                <label className="col-span-2 text-xs text-[var(--studio-text-secondary)]">场次<Input className="!mt-1.5" value={shot.sceneName} placeholder="未分场" onChange={(event) => onUpdate({ sceneName: event.target.value })} /></label>
                <label className="text-xs text-[var(--studio-text-secondary)]">景别<Input className="!mt-1.5" value={shot.shotSize} placeholder="中景" onChange={(event) => onUpdate({ shotSize: event.target.value })} /></label>
                <label className="text-xs text-[var(--studio-text-secondary)]">运镜<Input className="!mt-1.5" value={shot.cameraMovement} placeholder="手持跟拍" onChange={(event) => onUpdate({ cameraMovement: event.target.value })} /></label>
                <label className="col-span-2 text-xs text-[var(--studio-text-secondary)]">画面描述<Input.TextArea className="!mt-1.5" value={shot.visualDescription} autoSize={{ minRows: 2, maxRows: 5 }} placeholder="角色动作、环境、光线与构图" onChange={(event) => onUpdate({ visualDescription: event.target.value })} /></label>
            </div>

            <div className="mt-5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold">参考资产</span><div className="flex flex-wrap gap-1.5"><Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={onOpenAssets}>素材库</Button><Button size="small" icon={<ClipboardPaste className="size-3.5" />} onClick={onAddClipboard}>剪切板</Button><Button size="small" icon={<Upload className="size-3.5" />} onClick={() => uploadRef.current?.click()}>上传</Button></div></div>
                <div className="flex min-h-24 gap-2 overflow-x-auto rounded-lg border border-dashed border-[var(--studio-border-strong)] bg-[var(--studio-panel-muted-bg)] p-2">
                    {references.map((reference, index) => <div key={reference.id} className="group relative size-20 shrink-0 overflow-hidden rounded-md border border-[var(--studio-border-subtle)]"><img src={reference.dataUrl} alt={reference.title} className="size-full object-cover" /><button type="button" className="absolute left-1 top-1 rounded bg-[var(--studio-media-overlay)] px-1 py-0.5 text-[10px] text-[var(--studio-on-media)]" onClick={() => insertReference(index)}>{referenceToken(index)}</button><button type="button" className="absolute right-1 top-1 hidden size-6 place-items-center rounded bg-[var(--studio-media-overlay)] text-[var(--studio-on-media)] group-hover:grid" onClick={() => onRemoveReference(reference)} aria-label="移除参考图"><Trash2 className="size-3" /></button></div>)}
                    {!references.length ? <div className="grid min-w-full place-items-center text-xs text-[var(--studio-text-muted)]">暂无参考图</div> : null}
                </div>
            </div>

            <label className="mt-5 block text-sm font-semibold">分镜画面提示词
                <Input.TextArea ref={promptRef} className="!mt-2 !rounded-md !p-3 !leading-6" value={prompt} autoSize={{ minRows: 6, maxRows: 12 }} placeholder="描述画面构图、角色动作、环境、光线与连续性…" onChange={(event) => onUpdate({ imagePrompt: event.target.value })} />
            </label>

            <div className="mt-5 grid gap-3">
                <ModelPicker config={{ ...config, ...mergedConfig }} modelType="image" value={model} onChange={(value) => updateImageConfig("imageModel", value)} fullWidth allowCustomModel={allowCustomModel} onMissingConfig={() => openConfigDialog(false)} />
                <ImageSettingsPanel config={mergedConfig} onConfigChange={updateImageConfig} theme={theme} showTitle={false} className="space-y-3" maxCount={10} quickCount={4} compact />
            </div>

            <Button className="!mt-5" type="primary" size="large" block icon={<Sparkles className="size-4" />} loading={running} disabled={!prompt.trim() || running} onClick={onGenerate}>为镜头 {shot.order} 生成 {Number(mergedConfig.count) || 1} 张候选</Button>
            <input ref={uploadRef} type="file" accept="image/*" multiple hidden onChange={(event) => { onUpload(event.target.files); event.target.value = ""; }} />
        </aside>
    );
}
