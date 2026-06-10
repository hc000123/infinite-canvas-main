"use client";

import { useState } from "react";
import { Form, type FormInstance } from "antd";

import { readFileAsDataUrl } from "@/lib/image-utils";
import { uploadMediaFile } from "@/services/file-storage";
import { uploadImage } from "@/services/image-storage";
import type { Asset, AssetKind, AssetWriteInput } from "@/stores/use-asset-store";
import { buildAssetVersionedUpdatePatch } from "./asset-version-history";
import type { AssetFormValues, ImageDraft, MediaDraft } from "./components/asset-editor-modal";

type MessageApi = {
    error: (content: string) => unknown;
    success: (content: string) => unknown;
};

type Props = {
    activeFolderId?: string;
    addAsset: (asset: AssetWriteInput) => string;
    addAssetOnce: (asset: AssetWriteInput) => Promise<string>;
    form: FormInstance<AssetFormValues>;
    message: MessageApi;
    updateAsset: (id: string, patch: Partial<Omit<Asset, "id" | "createdAt">>) => void;
};

export function useAssetEditorActions({ activeFolderId, addAsset, addAssetOnce, form, message, updateAsset }: Props) {
    const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
    const [isAssetOpen, setIsAssetOpen] = useState(false);
    const [formKind, setFormKind] = useState<AssetKind>("text");
    const [imageDraft, setImageDraft] = useState<ImageDraft>(null);
    const [mediaDraft, setMediaDraft] = useState<MediaDraft>(null);
    const coverUrl = Form.useWatch("coverUrl", form) || "";
    const title = Form.useWatch("title", form) || "";
    const tags = Form.useWatch("tags", form) || [];
    const content = Form.useWatch("content", form) || "";

    const openCreate = () => {
        setEditingAsset(null);
        setImageDraft(null);
        setMediaDraft(null);
        setFormKind("text");
        form.setFieldsValue({ kind: "text", title: "", coverUrl: "", folderId: activeFolderId || "", tags: [], source: "手动添加", note: "", content: "" });
        setIsAssetOpen(true);
    };

    const openEdit = (asset: Asset) => {
        setEditingAsset(asset);
        setFormKind(asset.kind);
        setImageDraft(asset.kind === "image" ? asset.data : null);
        setMediaDraft(asset.kind === "video" || asset.kind === "audio" ? asset.data : null);
        form.setFieldsValue({
            kind: asset.kind,
            title: asset.title,
            coverUrl: asset.coverUrl,
            folderId: asset.folderId || "",
            tags: asset.tags || [],
            source: asset.source,
            note: asset.note,
            content: asset.kind === "text" ? asset.data.content : "",
        });
        setIsAssetOpen(true);
    };

    const updateEditedAsset = (current: Asset, patch: AssetWriteInput) => {
        updateAsset(current.id, buildAssetVersionedUpdatePatch(current, patch, new Date().toISOString()));
    };

    const saveAsset = async () => {
        const values = await form.validateFields();
        const base = {
            title: values.title.trim(),
            coverUrl: values.coverUrl?.trim() || (values.kind === "image" && imageDraft ? imageDraft.dataUrl : ""),
            folderId: values.folderId || undefined,
            tags: values.tags || [],
            source: values.source?.trim(),
            note: values.note?.trim(),
            metadata: editingAsset?.metadata || { source: "manual" },
        };

        if (values.kind === "text") {
            const asset = { ...base, kind: "text" as const, data: { content: (values.content || "").trim() } };
            if (editingAsset) updateEditedAsset(editingAsset, asset);
            else addAsset(asset);
        } else if (values.kind === "image") {
            if (!imageDraft) {
                message.error("请选择图片文件");
                return;
            }
            const asset = { ...base, kind: "image" as const, data: imageDraft };
            if (editingAsset) updateEditedAsset(editingAsset, asset);
            else await addAssetOnce(asset);
        } else {
            if (!mediaDraft) {
                message.error(values.kind === "video" ? "请选择视频文件" : "请选择音频文件");
                return;
            }
            const asset = { ...base, kind: values.kind, data: mediaDraft } as AssetWriteInput;
            if (editingAsset) updateEditedAsset(editingAsset, asset);
            else await addAssetOnce(asset);
        }

        message.success(editingAsset ? "素材已更新" : "素材已保存");
        setIsAssetOpen(false);
    };

    const updateFormKind = (value: AssetKind) => {
        setFormKind(value);
        if (value === "text") {
            setImageDraft(null);
            setMediaDraft(null);
        }
        if (value === "image") setMediaDraft(null);
        if (value === "video" || value === "audio") {
            setImageDraft(null);
            setMediaDraft(null);
        }
    };

    const readCoverFile = async (file?: File) => {
        if (!file) return;
        const dataUrl = await readFileAsDataUrl(file);
        form.setFieldValue("coverUrl", dataUrl);
    };

    const readImageFile = async (file?: File) => {
        if (!file || !file.type.startsWith("image/")) return;
        const image = await uploadImage(file);
        const draft = { dataUrl: image.url, storageKey: image.storageKey, width: image.width, height: image.height, bytes: image.bytes, mimeType: image.mimeType };
        setImageDraft(draft);
        if (!form.getFieldValue("coverUrl")) form.setFieldValue("coverUrl", draft.dataUrl);
        if (!form.getFieldValue("title")) form.setFieldValue("title", file.name);
    };

    const readMediaFile = async (file?: File) => {
        if (!file || (!file.type.startsWith("video/") && !file.type.startsWith("audio/"))) return;
        const kind = file.type.startsWith("video/") ? "video" : "audio";
        const media = await uploadMediaFile(file, kind);
        const draft =
            kind === "video"
                ? { url: media.url, storageKey: media.storageKey, width: media.width || 1280, height: media.height || 720, bytes: media.bytes, mimeType: media.mimeType }
                : { url: media.url, storageKey: media.storageKey, bytes: media.bytes, mimeType: media.mimeType };
        setMediaDraft(draft);
        setFormKind(kind);
        form.setFieldValue("kind", kind);
        if (!form.getFieldValue("title")) form.setFieldValue("title", file.name);
    };

    return {
        content,
        coverUrl,
        editingAsset,
        formKind,
        imageDraft,
        isAssetOpen,
        mediaDraft,
        tags,
        title,
        openCreate,
        openEdit,
        readCoverFile,
        readImageFile,
        readMediaFile,
        saveAsset,
        setIsAssetOpen,
        updateFormKind,
    };
}
