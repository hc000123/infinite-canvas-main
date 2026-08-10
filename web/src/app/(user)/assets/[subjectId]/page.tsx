"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { App, Button, Collapse, Empty, Input, Modal, Select, Tag } from "antd";
import { ArrowLeft, ImageIcon, Sparkles } from "lucide-react";

import { uploadImage } from "@/services/image-storage";
import { ImageSettingsPanel } from "@/components/image-settings-panel";
import { ModelPicker } from "@/components/model-picker";
import { canvasThemes } from "@/lib/canvas-theme";
import { useAssetStore, type Asset, type AssetSubject, type AssetVariant, type AssetWorkbenchImage } from "@/stores/use-asset-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { candidateAssetInput, copyWorkbenchImageInput, referenceFromWorkbenchImageInput, workbenchImageReference } from "../asset-workbench";
import { useCreativeProjectStore } from "../../projects/use-creative-project-store";
import { assetCategoryLabel } from "../asset-subjects";
import { buildAssetImageRevisionHref } from "../asset-image-revision";
import { AssetCandidateGrid } from "./components/asset-candidate-grid";
import { AssetRelatedMediaPanel } from "./components/asset-related-media-panel";
import { AssetReferencePanel } from "./components/asset-reference-panel";
import { AssetReferencePicker } from "./components/asset-reference-picker";
import { AssetVariantNav } from "./components/asset-variant-nav";
import { AssetVersionPanel } from "./components/asset-version-panel";
import { useAssetWorkbenchGeneration } from "./use-asset-workbench-generation";

export default function AssetSubjectWorkbenchPage() {
    const params = useParams<{ subjectId: string }>();
    const subjects = useAssetStore((state) => state.subjects);
    const subject = subjects.find((subject) => subject.id === params.subjectId);
    if (!subject) {
        return <div className="studio-shell flex h-full items-center justify-center bg-[var(--studio-shell-bg)] p-6"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到这个资产主体"><Link href="/assets"><Button type="primary">返回资产库</Button></Link></Empty></div>;
    }
    return <AssetSubjectWorkbench subject={subject} />;
}

function AssetSubjectWorkbench({ subject }: { subject: AssetSubject }) {
    const { message, modal } = App.useApp();
    const router = useRouter();
    const candidateInputRef = useRef<HTMLInputElement>(null);
    const referenceInputRef = useRef<HTMLInputElement>(null);
    const assets = useAssetStore((state) => state.assets);
    const variants = useAssetStore((state) => state.variants);
    const workbenchImages = useAssetStore((state) => state.workbenchImages);
    const ensureVariant = useAssetStore((state) => state.ensureVariant);
    const updateVariant = useAssetStore((state) => state.updateVariant);
    const duplicateVariant = useAssetStore((state) => state.duplicateVariant);
    const removeVariant = useAssetStore((state) => state.removeVariant);
    const removeWorkbenchImage = useAssetStore((state) => state.removeWorkbenchImage);
    const addWorkbenchImage = useAssetStore((state) => state.addWorkbenchImage);
    const promoteWorkbenchImage = useAssetStore((state) => state.promoteWorkbenchImage);
    const setVariantCurrentAsset = useAssetStore((state) => state.setVariantCurrentAsset);
    const projects = useCreativeProjectStore((state) => state.projects);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const subjectVariants = useMemo(() => variants.filter((variant) => variant.subjectId === subject.id), [subject.id, variants]);
    const [activeVariantId, setActiveVariantId] = useState("");
    const [referencePickerOpen, setReferencePickerOpen] = useState(false);
    const [copyCandidate, setCopyCandidate] = useState<AssetWorkbenchImage | null>(null);
    const [copyTargetVariantId, setCopyTargetVariantId] = useState("");
    const activeVariant = subjectVariants.find((variant) => variant.id === activeVariantId) || subjectVariants[0];

    useEffect(() => {
        if (!activeVariant || activeVariantId === activeVariant.id) return;
        setActiveVariantId(activeVariant.id);
    }, [activeVariant, activeVariantId]);

    const project = projects.find((item) => item.id === subject.projectId);
    const generationVariant: AssetVariant = activeVariant || { id: "", subjectId: subject.id, name: "", prompt: "", referenceImageIds: [], createdAt: "", updatedAt: "" };
    const references = workbenchImages.filter((image) => image.variantId === generationVariant.id && generationVariant.referenceImageIds.includes(image.id));
    const candidates = workbenchImages.filter((image) => image.variantId === generationVariant.id && image.role === "candidate" && !image.selectedAssetId);
    const formalAssets = assets.filter((asset) => asset.kind === "image" && asset.assetBinding?.subjectId === subject.id && (asset.assetBinding.variantId === generationVariant.id || (!asset.assetBinding.variantId && asset.assetBinding.variantName === generationVariant.name)));
    const relatedMedia = assets.filter((asset) => asset.kind !== "image" && asset.assetBinding?.subjectId === subject.id);
    const currentAsset = formalAssets.find((asset) => asset.id === generationVariant.currentAssetId);
    const generation = useAssetWorkbenchGeneration({ addWorkbenchImage, projectTitle: project ? project.title || "未命名项目" : undefined, references: references.map(workbenchImageReference), subject, variant: generationVariant });
    const savedVariantConfig = activeVariant?.config;
    const updateGenerationConfig = generation.updateConfig;
    useEffect(() => {
        const saved = savedVariantConfig;
        if (!saved) return;
        if (saved.imageModel) updateGenerationConfig("imageModel", saved.imageModel);
        if (saved.quality) updateGenerationConfig("quality", saved.quality);
        if (saved.size) updateGenerationConfig("size", saved.size);
        if (saved.count) updateGenerationConfig("count", saved.count);
    }, [activeVariant?.id, savedVariantConfig, updateGenerationConfig]);
    if (!activeVariant) return null;

    const createVariant = (name: string) => {
        const id = ensureVariant({ subjectId: subject.id, name, prompt: "", referenceImageIds: [] });
        setActiveVariantId(id);
    };
    const copyVariant = (id: string) => {
        const source = subjectVariants.find((variant) => variant.id === id);
        if (!source) return;
        const base = `${source.name} 副本`;
        let name = base;
        let index = 2;
        while (subjectVariants.some((variant) => variant.name === name)) name = `${base} ${index++}`;
        setActiveVariantId(duplicateVariant(id, name));
        message.success("已复制形态配置");
    };
    const deleteVariant = (id: string) => modal.confirm({ title: "删除这个形态？", content: "参考资料和未转正的待选结果会一起移除，历史版本不会删除。", okText: "删除", okButtonProps: { danger: true }, cancelText: "取消", onOk: () => { if (!removeVariant(id)) return message.warning("至少保留一个形态"); setActiveVariantId(""); } });
    const importImages = async (files: FileList | null, role: "candidate" | "reference") => {
        if (!files?.length) return;
        const imageIds: string[] = [];
        let failed = 0;
        for (const file of Array.from(files)) {
            try {
                const stored = await uploadImage(file);
                imageIds.push(addWorkbenchImage({ subjectId: subject.id, variantId: activeVariant.id, role, source: "upload", title: file.name, dataUrl: stored.url, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType }));
            } catch {
                failed += 1;
            }
        }
        if (role === "reference" && imageIds.length) updateVariant(activeVariant.id, { referenceImageIds: [...activeVariant.referenceImageIds, ...imageIds] });
        if (imageIds.length) message.success(`已添加 ${imageIds.length} 张${role === "reference" ? "参考图" : "待选结果"}`);
        if (failed) message.warning(`${failed} 张图片导入失败`);
    };
    const addAssetReference = async (asset: Asset) => {
        if (asset.kind !== "image") return;
        try {
            const stored = await uploadImage(asset.data.dataUrl);
            const imageId = addWorkbenchImage({ subjectId: subject.id, variantId: activeVariant.id, role: "reference", source: "asset", sourceAssetId: asset.id, title: asset.title, dataUrl: stored.url, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType });
            updateVariant(activeVariant.id, { referenceImageIds: [...activeVariant.referenceImageIds, imageId] });
            setReferencePickerOpen(false);
            message.success("已加入当前形态参考资料");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "引用图片失败");
        }
    };
    const promoteCandidate = async (candidate: AssetWorkbenchImage) => {
        if (candidate.selectedAssetId) return;
        try {
            await promoteWorkbenchImage({ candidateId: candidate.id, asset: candidateAssetInput(subject, activeVariant, candidate) });
            message.success("已设为当前版本");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存当前版本失败");
        }
    };
    const useCandidateAsReference = (candidate: AssetWorkbenchImage) => {
        const imageId = addWorkbenchImage(referenceFromWorkbenchImageInput(candidate, activeVariant.id));
        updateVariant(activeVariant.id, { referenceImageIds: [...activeVariant.referenceImageIds, imageId] });
        message.success("已加入当前形态参考资料");
    };
    const openCopyCandidate = (candidate: AssetWorkbenchImage) => {
        const target = subjectVariants.find((variant) => variant.id !== activeVariant.id);
        if (!target) return message.warning("请先新建另一个形态");
        setCopyCandidate(candidate);
        setCopyTargetVariantId(target.id);
    };
    const confirmCopyCandidate = () => {
        if (!copyCandidate || !copyTargetVariantId) return;
        addWorkbenchImage(copyWorkbenchImageInput(copyCandidate, copyTargetVariantId));
        setCopyCandidate(null);
        message.success("已复制到目标形态的待选结果");
    };

    return (
        <div className="studio-workspace flex h-full flex-col overflow-hidden bg-[var(--studio-shell-bg)] text-[var(--studio-text-primary)]">
            <header className="studio-toolbar m-3 mb-0 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                    <Link href="/assets" className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--studio-text-muted)] transition hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)]"><ArrowLeft className="size-4" /></Link>
                    <div className="min-w-0"><div className="flex items-center gap-2 text-xs text-[var(--studio-text-muted)]"><span>{project?.title || "项目已移除"}</span><span>/</span><span>{assetCategoryLabel(subject.category)}</span><Tag bordered={false} className="!m-0">{subject.code}</Tag></div><h1 className="mt-0.5 truncate text-lg font-semibold">{subject.name}</h1></div>
                </div>
                <div className="text-xs text-[var(--studio-text-muted)]">所有修改已保存在本机</div>
            </header>

            <main className="studio-shell grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[320px_minmax(0,1fr)] lg:overflow-hidden">
                <aside className="studio-rail thin-scrollbar grid content-start gap-4 overflow-y-auto p-3">
                    <AssetVariantNav compact={subjectVariants.length === 1} activeId={activeVariant.id} variants={subjectVariants} onCreate={createVariant} onDelete={deleteVariant} onDuplicate={copyVariant} onRename={(id, name) => updateVariant(id, { name })} onSelect={setActiveVariantId} />
                    <section className="rounded-xl border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-3">
                        <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">画面描述</h2><Sparkles className="size-4 text-[var(--studio-accent)]" /></div>
                        <Input.TextArea value={activeVariant.prompt} autoSize={{ minRows: 7, maxRows: 14 }} placeholder="描述主体外观、环境、构图和需要保持的一致性…" onChange={(event) => updateVariant(activeVariant.id, { prompt: event.target.value })} />
                        <Collapse ghost size="small" className="!mt-2" items={[{ key: "settings", label: "生成设置", children: <div className="grid gap-3"><ModelPicker config={generation.effectiveConfig} modelType="image" value={generation.model} onChange={(value) => { generation.updateConfig("imageModel", value); updateVariant(activeVariant.id, { config: { ...activeVariant.config, imageModel: value } }); }} fullWidth allowCustomModel={generation.allowCustomModel} onMissingConfig={() => generation.openConfigDialog(false)} /><ImageSettingsPanel config={generation.effectiveConfig} onConfigChange={(key, value) => { generation.updateConfig(key, value); updateVariant(activeVariant.id, { config: { ...activeVariant.config, [key]: String(value) } }); }} theme={theme} showTitle={false} className="space-y-3" maxCount={10} quickCount={4} compact /></div> }]} />
                        <Button type="primary" block size="large" className="!mt-2" icon={<Sparkles className="size-4" />} loading={generation.running} disabled={!activeVariant.prompt.trim()} onClick={() => void generation.generate()}>生成待选结果</Button>
                    </section>
                    <AssetReferencePanel references={references} sourceMissing={(image) => Boolean(image.sourceAssetId && !assets.some((asset) => asset.id === image.sourceAssetId))} onOpenPicker={() => setReferencePickerOpen(true)} onRemove={removeWorkbenchImage} onUpload={() => referenceInputRef.current?.click()} />
                </aside>

                <div className="thin-scrollbar min-h-0 overflow-y-auto">
                    <div className="grid gap-3 pb-3">
                        <section className="relative min-h-72 overflow-hidden rounded-xl border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)]">
                            <div className="absolute left-3 top-3 z-10 rounded-lg bg-[var(--studio-media-overlay)] px-2.5 py-1 text-xs text-[var(--studio-on-media)]">当前版本 · {activeVariant.name}</div>
                            {currentAsset ? <img src={currentAsset.coverUrl || (currentAsset.kind === "image" ? currentAsset.data.dataUrl : "")} alt={currentAsset.title} className="h-full max-h-[520px] w-full object-contain" /> : <div className="flex min-h-72 flex-col items-center justify-center text-[var(--studio-text-muted)]"><ImageIcon className="mb-3 size-10" /><div className="text-sm font-medium">当前形态还没有版本</div><div className="mt-1 text-xs">从待选结果中设定一张后，它会出现在这里</div></div>}
                        </section>
                        <AssetCandidateGrid candidates={candidates} running={generation.running} slots={generation.slots} onCopy={openCopyCandidate} onDelete={(image) => removeWorkbenchImage(image.id)} onGenerate={() => void generation.generate()} onPromote={(candidate) => void promoteCandidate(candidate)} onRetry={(slotId) => void generation.retrySlot(slotId)} onUpload={() => candidateInputRef.current?.click()} onUseAsReference={useCandidateAsReference} />
                        <AssetVersionPanel assets={formalAssets} currentAssetId={activeVariant.currentAssetId} onRevise={(asset) => { if (asset.kind === "image") router.push(buildAssetImageRevisionHref(asset, `/assets/${subject.id}`)); }} onSetCurrent={(assetId) => setVariantCurrentAsset(activeVariant.id, assetId)} />
                        <AssetRelatedMediaPanel assets={relatedMedia} projectId={subject.projectId} />
                    </div>
                </div>
            </main>
            <AssetReferencePicker assets={assets} currentProjectId={subject.projectId} open={referencePickerOpen} projectTitles={Object.fromEntries(projects.map((project) => [project.id, project.title || "未命名项目"]))} onCancel={() => setReferencePickerOpen(false)} onSelect={(asset) => void addAssetReference(asset)} />
            <Modal open={Boolean(copyCandidate)} title="复制到其他形态" okText="复制" cancelText="取消" okButtonProps={{ disabled: !copyTargetVariantId }} onCancel={() => setCopyCandidate(null)} onOk={confirmCopyCandidate} destroyOnHidden>
                <div className="mb-2 mt-3 text-sm text-[var(--studio-text-muted)]">待选图片和生成配置会复制过去，原形态保持不变。</div>
                <Select className="w-full" value={copyTargetVariantId} options={subjectVariants.filter((variant) => variant.id !== activeVariant.id).map((variant) => ({ label: variant.name, value: variant.id }))} onChange={setCopyTargetVariantId} />
            </Modal>
            <input ref={referenceInputRef} type="file" accept="image/*" multiple hidden onChange={(event) => { void importImages(event.target.files, "reference"); event.target.value = ""; }} />
            <input ref={candidateInputRef} type="file" accept="image/*" multiple hidden onChange={(event) => { void importImages(event.target.files, "candidate"); event.target.value = ""; }} />
        </div>
    );
}
