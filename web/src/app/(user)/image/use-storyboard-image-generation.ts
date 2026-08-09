"use client";

import { useRef, useState } from "react";
import { App } from "antd";
import { nanoid } from "nanoid";

import { requestEdit, requestGeneration } from "@/services/api/image";
import { uploadImage } from "@/services/image-storage";
import { useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { StoryboardTableShot, StoryboardWorkbenchImage } from "../canvas/utils/storyboard-management";
import { buildShotReferencePrompt, defaultShotImagePrompt } from "./storyboard-workbench";
import type { StoryboardGenerationSlotView } from "./components/storyboard-candidate-grid";

type Snapshot = {
    shot: StoryboardTableShot;
    prompt: string;
    requestPrompt: string;
    references: ReferenceImage[];
    config: AiConfig;
    model: string;
};

type Props = {
    shot?: StoryboardTableShot;
    references: StoryboardWorkbenchImage[];
    addWorkbenchImage: (image: Omit<StoryboardWorkbenchImage, "createdAt" | "id">) => string;
};

export function useStoryboardImageGeneration({ shot, references, addWorkbenchImage }: Props) {
    const { message } = App.useApp();
    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const [slots, setSlots] = useState<StoryboardGenerationSlotView[]>([]);
    const [running, setRunning] = useState(false);
    const snapshots = useRef(new Map<string, Snapshot>());

    const buildSnapshot = () => {
        if (!shot) return null;
        const prompt = (shot.imagePrompt ?? defaultShotImagePrompt(shot)).trim();
        if (!prompt) {
            message.warning("请先填写当前镜头的画面提示词");
            return null;
        }
        const model = shot.imageConfig?.imageModel || effectiveConfig.imageModel || effectiveConfig.model;
        const merged = { ...effectiveConfig, ...(shot.imageConfig || {}), model, count: "1" } as AiConfig;
        if (!isAiConfigReady(merged, model)) {
            message.warning("请先完成图片模型配置");
            openConfigDialog(true);
            return null;
        }
        const requestReferences: ReferenceImage[] = references.map((reference) => ({ id: reference.id, name: reference.title, type: reference.mimeType || "image/png", dataUrl: reference.dataUrl, storageKey: reference.storageKey }));
        return { shot: { ...shot }, prompt, requestPrompt: buildShotReferencePrompt(prompt, requestReferences), references: requestReferences, config: merged, model } satisfies Snapshot;
    };

    const runSlot = async (slotId: string, snapshot: Snapshot, index: number) => {
        setSlots((value) => value.map((slot) => (slot.id === slotId ? { id: slot.id, status: "pending" } : slot)));
        const startedAt = performance.now();
        try {
            const trace = {
                projectId: snapshot.shot.projectId,
                sourceType: "image_generation" as const,
                sourceId: snapshot.shot.id,
                inputSummary: `${snapshot.shot.title}；参考图 ${snapshot.references.length} 张`,
            };
            const result = snapshot.references.length ? await requestEdit(snapshot.config, snapshot.requestPrompt, snapshot.references, undefined, trace) : await requestGeneration(snapshot.config, snapshot.requestPrompt, undefined, trace);
            const image = result[0];
            if (!image) throw new Error("接口没有返回图片");
            const stored = await uploadImage(image.dataUrl);
            addWorkbenchImage({
                projectId: snapshot.shot.projectId,
                canvasId: snapshot.shot.canvasId,
                episodeId: snapshot.shot.episodeId,
                shotId: snapshot.shot.id,
                role: "candidate",
                source: "generation",
                title: `${snapshot.shot.title || `镜头 ${snapshot.shot.order}`} · 候选 ${index + 1}`,
                dataUrl: stored.url,
                storageKey: stored.storageKey,
                width: stored.width,
                height: stored.height,
                bytes: stored.bytes,
                mimeType: stored.mimeType,
                durationMs: performance.now() - startedAt,
                prompt: snapshot.prompt,
                model: snapshot.model,
                quality: String(snapshot.config.quality || ""),
                size: String(snapshot.config.size || ""),
            });
            snapshots.current.delete(slotId);
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
        const count = Math.max(1, Math.min(10, Number(shot?.imageConfig?.count || config.count) || 1));
        const nextSlots = Array.from({ length: count }, () => ({ id: nanoid(), status: "pending" as const }));
        nextSlots.forEach((slot) => snapshots.current.set(slot.id, snapshot));
        setSlots(nextSlots);
        setRunning(true);
        const result = await Promise.allSettled(nextSlots.map((slot, index) => runSlot(slot.id, snapshot, index)));
        const successCount = result.filter((item) => item.status === "fulfilled").length;
        const failCount = result.length - successCount;
        setRunning(false);
        if (successCount) message.success(`已为 ${snapshot.shot.title} 生成 ${successCount} 张候选`);
        if (failCount) message.warning(`${failCount} 张生成失败，可在候选区单独重试`);
    };

    const retry = async (slotId: string) => {
        const snapshot = snapshots.current.get(slotId);
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

    return { generate, retry, running, slots: slots.filter((slot) => snapshots.current.get(slot.id)?.shot.id === shot?.id) };
}
