"use client";

import { useEffect } from "react";
import { App, Form, Modal } from "antd";

import { useAssetStore, type AssetCategory } from "@/stores/use-asset-store";
import { useScriptStore } from "../stores/use-script-store";
import { useCreativeProjectStore } from "../../projects/use-creative-project-store";
import { NEW_ASSET_SUBJECT, AssetBindingFields } from "../../assets/components/asset-binding-fields";
import { defaultAssetVariantName } from "../../assets/asset-subjects";

type Values = {
    projectId: string;
    category: AssetCategory;
    subjectId: string;
    subjectName?: string;
    variantName: string;
    allEpisodes: boolean;
    episodeIds: string[];
};

export function CanvasAssetBindingModal({ assetId, projectId, episodeId, onClose }: { assetId?: string; projectId: string; episodeId: string; onClose: () => void }) {
    const { message } = App.useApp();
    const [form] = Form.useForm<Values>();
    const asset = useAssetStore((state) => state.assets.find((item) => item.id === assetId));
    const subjects = useAssetStore((state) => state.subjects);
    const ensureSubject = useAssetStore((state) => state.ensureSubject);
    const updateAsset = useAssetStore((state) => state.updateAsset);
    const episodes = useScriptStore((state) => state.episodes);
    const projects = useCreativeProjectStore((state) => state.projects);

    useEffect(() => {
        if (!assetId) return;
        form.setFieldsValue({ projectId, category: undefined, subjectId: undefined, subjectName: "", variantName: "", allEpisodes: false, episodeIds: [episodeId] });
    }, [assetId, episodeId, form, projectId]);

    const save = async () => {
        const values = await form.validateFields();
        const subjectId = values.subjectId === NEW_ASSET_SUBJECT ? ensureSubject({ projectId, category: values.category, name: values.subjectName || "", tags: asset?.tags || [] }) : values.subjectId;
        updateAsset(assetId || "", {
            assetBinding: {
                projectId,
                subjectId,
                category: values.category,
                variantName: values.variantName.trim() || defaultAssetVariantName(values.category),
                allEpisodes: values.allEpisodes,
                episodeIds: values.allEpisodes ? [] : Array.from(new Set([episodeId, ...values.episodeIds])),
            },
        });
        message.success("图片已归入项目资产");
        onClose();
    };

    return (
        <Modal rootClassName="studio-modal" title="归类画布图片" open={Boolean(assetId && asset?.kind === "image")} width={760} okText="完成归类" cancelText="暂不归类" onOk={() => void save()} onCancel={onClose} destroyOnHidden>
            <div className="mb-4 flex items-center gap-4 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3">
                {asset?.kind === "image" ? <img src={asset.coverUrl || asset.data.dataUrl} alt={asset.title} className="h-20 w-28 rounded object-cover" /> : null}
                <div className="min-w-0">
                    <div className="truncate font-semibold text-[var(--studio-text-primary)]">{asset?.title || "画布图片"}</div>
                    <div className="mt-1 text-xs leading-5 text-[var(--studio-text-muted)]">项目和当前分集已锁定。取消不会删除画布图片，只会暂时保留为待分类素材。</div>
                </div>
            </div>
            <Form form={form} layout="vertical" requiredMark={false}>
                <AssetBindingFields episodes={episodes} projects={projects} subjects={subjects} lockedProjectId={projectId} lockedEpisodeId={episodeId} />
            </Form>
        </Modal>
    );
}
