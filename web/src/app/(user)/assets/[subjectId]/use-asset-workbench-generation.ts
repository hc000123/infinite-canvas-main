"use client";

import { useRef, useState } from "react";
import { App } from "antd";
import { nanoid } from "nanoid";

import { requestEdit, requestGeneration } from "@/services/api/image";
import { uploadImage } from "@/services/image-storage";
import { useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import type { AssetSubject, AssetVariant, AssetWorkbenchImage } from "@/stores/use-asset-store";
import type { ReferenceImage } from "@/types/image";
import { buildCandidateImageInput, buildGenerationTrace, imageRequestMode } from "../asset-workbench-generation";

export type WorkbenchGenerationSlot = { id: string; status: "pending" | "failed"; error?: string };
type GenerationSnapshot = { config: AiConfig; model: string; prompt: string; references: ReferenceImage[] };

export function useAssetWorkbenchGeneration({ addWorkbenchImage, projectAvailable, references, subject, variant }: { addWorkbenchImage: (image: Omit<AssetWorkbenchImage, "createdAt" | "id">) => string; projectAvailable: boolean; references: ReferenceImage[]; subject: AssetSubject; variant: AssetVariant }) {
    const { message } = App.useApp();
    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const allowCustomModel = useConfigStore((state) => state.publicSettings?.modelChannel.allowCustomChannel !== false);
    const [slots, setSlots] = useState<WorkbenchGenerationSlot[]>([]);
    const [running, setRunning] = useState(false);
    const snapshotRef = useRef<GenerationSnapshot | null>(null);
    const model = effectiveConfig.imageModel || effectiveConfig.model;

    const buildSnapshot = () => {
        const prompt = variant.prompt.trim();
        if (!prompt) {
            message.warning("请先填写画面描述");
            return null;
        }
        if (!projectAvailable) {
            message.warning("所属项目已不存在，请先重新绑定项目");
            return null;
        }
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning("请先完成图片模型配置");
            openConfigDialog(true);
            return null;
        }
        return { prompt, model, references: [...references], config: { ...effectiveConfig, model, count: "1" } } satisfies GenerationSnapshot;
    };

    const runSlot = async (slotId: string, snapshot: GenerationSnapshot, index: number) => {
        setSlots((value) => value.map((slot) => (slot.id === slotId ? { id: slot.id, status: "pending" } : slot)));
        try {
            const trace = buildGenerationTrace(subject, variant, snapshot.references.length);
            const result = imageRequestMode(snapshot.references.length) === "edit" ? await requestEdit(snapshot.config, snapshot.prompt, snapshot.references, undefined, trace) : await requestGeneration(snapshot.config, snapshot.prompt, undefined, trace);
            const image = result[0];
            if (!image) throw new Error("接口没有返回图片");
            const stored = await uploadImage(image.dataUrl);
            const createdAt = new Date().toISOString();
            addWorkbenchImage(buildCandidateImageInput(subject, { ...variant, prompt: snapshot.prompt }, stored, { model: snapshot.model, quality: snapshot.config.quality, size: snapshot.config.size }, createdAt, index + 1));
            setSlots((value) => value.filter((slot) => slot.id !== slotId));
        } catch (error) {
            setSlots((value) => value.map((slot) => (slot.id === slotId ? { id: slot.id, status: "failed", error: error instanceof Error ? error.message : "生成失败" } : slot)));
            throw error;
        }
    };

    const generate = async () => {
        if (running) return;
        const snapshot = buildSnapshot();
        if (!snapshot) return;
        snapshotRef.current = snapshot;
        const count = Math.max(1, Math.min(10, Number(config.count) || 1));
        const nextSlots = Array.from({ length: count }, () => ({ id: nanoid(), status: "pending" as const }));
        setSlots(nextSlots);
        setRunning(true);
        const result = await Promise.allSettled(nextSlots.map((slot, index) => runSlot(slot.id, snapshot, index)));
        const successCount = result.filter((item) => item.status === "fulfilled").length;
        const failed = result.length - successCount;
        setRunning(false);
        if (successCount) message.success(`已生成 ${successCount} 张候选图`);
        if (failed) message.warning(`${failed} 张生成失败，可在失败卡片重试`);
    };

    const retrySlot = async (slotId: string) => {
        const snapshot = snapshotRef.current || buildSnapshot();
        if (!snapshot) return;
        setRunning(true);
        try {
            await runSlot(slotId, snapshot, 0);
            message.success("重试成功");
        } catch {
            message.error("重试仍然失败");
        } finally {
            setRunning(false);
        }
    };

    return { allowCustomModel, config, effectiveConfig, generate, model, openConfigDialog, retrySlot, running, slots, updateConfig };
}
