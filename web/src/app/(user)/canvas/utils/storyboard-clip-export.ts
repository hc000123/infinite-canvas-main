import type { Asset } from "@/stores/use-asset-store";

import type { StoryboardAssetRef, StoryboardGroup, StoryboardShot } from "./storyboard-management";

export type StoryboardClipExportWarningType = "missing_primary_asset" | "primary_asset_not_video" | "failed_shot" | "missing_video_storage" | "duration_anomaly";

export type StoryboardClipExportWarning = {
    shotId: string;
    type: StoryboardClipExportWarningType;
    message: string;
};

export type StoryboardClipExportReference = {
    assetId: string;
    kind: StoryboardAssetRef["kind"];
    role: string;
    title?: string;
    path?: string;
    storageKey?: string;
};

export type StoryboardClipExportShot = {
    order: number;
    shotId: string;
    title: string;
    description: string;
    status: StoryboardShot["status"];
    prompt: string;
    effectivePrompt: string;
    primaryAssetId?: string;
    primaryVideoPath?: string;
    durationSeconds?: number;
    model?: string;
    provider?: string;
    taskId?: string;
    actionType?: string;
    config?: Record<string, unknown>;
    references: StoryboardClipExportReference[];
    warnings: StoryboardClipExportWarning[];
};

export type StoryboardClipExportManifest = {
    app: "infinite-canvas";
    version: 1;
    kind: "storyboard-clip-package";
    exportedAt: string;
    projectId: string;
    group: Pick<StoryboardGroup, "id" | "title" | "description" | "preset">;
    shots: StoryboardClipExportShot[];
    warnings: StoryboardClipExportWarning[];
};

export type StoryboardClipExportMediaRequest = {
    assetId: string;
    kind: "image" | "video" | "audio";
    storageKey: string;
    path: string;
    mimeType: string;
};

export type StoryboardClipExportTextFile = {
    name: string;
    data: string;
};

export type StoryboardClipExportPlan = {
    fileName: string;
    manifest: StoryboardClipExportManifest;
    csv: string;
    promptFiles: StoryboardClipExportTextFile[];
    mediaRequests: StoryboardClipExportMediaRequest[];
};

export function buildStoryboardClipExportPlan({ group, shots, assets, exportedAt = new Date().toISOString() }: { group: StoryboardGroup; shots: StoryboardShot[]; assets: Asset[]; exportedAt?: string }): StoryboardClipExportPlan {
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    const orderedShots = shots.filter((shot) => shot.groupId === group.id).sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
    const mediaRequests = new Map<string, StoryboardClipExportMediaRequest>();
    const promptFiles: StoryboardClipExportTextFile[] = [];

    const exportShots = orderedShots.map((shot, index): StoryboardClipExportShot => {
        const sequence = index + 1;
        const filePrefix = `${String(sequence).padStart(3, "0")}_${safeFileSegment(shot.title, `shot_${sequence}`)}`;
        const primaryAsset = shot.primaryAssetId ? assetsById.get(shot.primaryAssetId) : undefined;
        const generation = readLatestGeneration(primaryAsset);
        const config = readRecord(generation?.config) || readRecord(group.preset) || undefined;
        const warnings: StoryboardClipExportWarning[] = [];
        const durationSeconds = resolveDurationSeconds(generation, config);
        let primaryVideoPath: string | undefined;

        if (shot.status === "error") warnings.push(warning(shot.id, "failed_shot", `分镜“${shot.title}”当前是失败状态`));
        if (!shot.primaryAssetId) {
            warnings.push(warning(shot.id, "missing_primary_asset", `分镜“${shot.title}”缺少主版本视频`));
        } else if (primaryAsset?.kind !== "video") {
            warnings.push(warning(shot.id, "primary_asset_not_video", `分镜“${shot.title}”的主版本不是视频素材`));
        } else {
            const storageKey = primaryAsset.data.storageKey;
            if (!storageKey) {
                warnings.push(warning(shot.id, "missing_video_storage", `分镜“${shot.title}”的主版本视频缺少本地文件`));
            } else {
                primaryVideoPath = `videos/${filePrefix}.${fileExtension(primaryAsset.data.mimeType, primaryAsset.kind)}`;
                mediaRequests.set(primaryVideoPath, {
                    assetId: primaryAsset.id,
                    kind: "video",
                    storageKey,
                    path: primaryVideoPath,
                    mimeType: primaryAsset.data.mimeType,
                });
            }
        }

        if (durationSeconds && (durationSeconds < 2 || durationSeconds > 30)) warnings.push(warning(shot.id, "duration_anomaly", `分镜“${shot.title}”的时长 ${durationSeconds}s 可能不适合直接剪辑交接`));

        const references = shot.assetRefs.map((ref, refIndex) => {
            const asset = assetsById.get(ref.assetId);
            const storageKey = asset && asset.kind !== "text" ? asset.data.storageKey : undefined;
            const path = asset && asset.kind !== "text" && storageKey ? `references/${filePrefix}/${String(refIndex + 1).padStart(2, "0")}_${safeFileSegment(asset.title, ref.assetId)}.${fileExtension(asset.data.mimeType, asset.kind)}` : undefined;
            if (asset && asset.kind !== "text" && storageKey && path) {
                mediaRequests.set(path, {
                    assetId: asset.id,
                    kind: asset.kind,
                    storageKey,
                    path,
                    mimeType: asset.data.mimeType,
                });
            }
            return { assetId: ref.assetId, kind: ref.kind, role: ref.role, title: asset?.title, path, storageKey };
        });

        const exportShot: StoryboardClipExportShot = {
            order: sequence,
            shotId: shot.id,
            title: shot.title,
            description: shot.description,
            status: shot.status,
            prompt: shot.prompt,
            effectivePrompt: shot.effectivePrompt || shot.prompt,
            primaryAssetId: shot.primaryAssetId,
            primaryVideoPath,
            durationSeconds,
            model: readString(generation?.model),
            provider: readString(generation?.provider),
            taskId: readString(generation?.taskId) || shot.lastTaskId,
            actionType: readString(generation?.actionType),
            config,
            references,
            warnings,
        };
        promptFiles.push({ name: `prompts/${filePrefix}_prompt.txt`, data: shotPromptText(exportShot) });
        return exportShot;
    });

    const warnings = exportShots.flatMap((shot) => shot.warnings);
    const manifest: StoryboardClipExportManifest = {
        app: "infinite-canvas",
        version: 1,
        kind: "storyboard-clip-package",
        exportedAt,
        projectId: group.projectId,
        group: { id: group.id, title: group.title, description: group.description, preset: group.preset },
        shots: exportShots,
        warnings,
    };
    return {
        fileName: `剪辑包_${safeFileSegment(group.title, "storyboard")}.zip`,
        manifest,
        csv: storyboardClipExportCsv(exportShots),
        promptFiles,
        mediaRequests: Array.from(mediaRequests.values()),
    };
}

export function storyboardClipExportCsv(shots: StoryboardClipExportShot[]) {
    const header = ["序号", "分镜ID", "标题", "状态", "主视频文件", "时长秒", "模型", "供应商", "任务ID", "生成方式", "提示词", "实际提交提示词", "参考素材", "检查结果"];
    const rows = shots.map((shot) => [
        String(shot.order),
        shot.shotId,
        shot.title,
        shot.status,
        shot.primaryVideoPath || "",
        shot.durationSeconds ? String(shot.durationSeconds) : "",
        shot.model || "",
        shot.provider || "",
        shot.taskId || "",
        shot.actionType || "",
        shot.prompt,
        shot.effectivePrompt,
        shot.references.map((ref) => [ref.title || ref.assetId, ref.role, ref.path].filter(Boolean).join(" · ")).join("\n"),
        shot.warnings.map((item) => item.message).join("\n"),
    ]);
    return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

export function safeFileSegment(value: string | undefined, fallback = "untitled") {
    const normalized = (value || fallback)
        .replace(/[\\/:*?"<>|]/g, "_")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .trim()
        .replace(/^_+|_+$/g, "");
    return (normalized || fallback).slice(0, 80);
}

function shotPromptText(shot: StoryboardClipExportShot) {
    return [
        `分镜 ${shot.order}：${shot.title}`,
        "",
        "描述：",
        shot.description || "无",
        "",
        "提示词：",
        shot.prompt || "无",
        "",
        "实际提交提示词：",
        shot.effectivePrompt || "无",
        "",
        "生成信息：",
        JSON.stringify(
            {
                status: shot.status,
                primaryAssetId: shot.primaryAssetId,
                primaryVideoPath: shot.primaryVideoPath,
                durationSeconds: shot.durationSeconds,
                model: shot.model,
                provider: shot.provider,
                taskId: shot.taskId,
                actionType: shot.actionType,
                config: shot.config,
            },
            null,
            2,
        ),
        "",
        "参考素材：",
        shot.references.length ? shot.references.map((ref) => `- ${ref.title || ref.assetId} / ${ref.kind} / ${ref.role}${ref.path ? ` / ${ref.path}` : ""}`).join("\n") : "无",
        "",
        "导出检查：",
        shot.warnings.length ? shot.warnings.map((item) => `- ${item.message}`).join("\n") : "通过",
    ].join("\n");
}

function warning(shotId: string, type: StoryboardClipExportWarningType, message: string): StoryboardClipExportWarning {
    return { shotId, type, message };
}

function csvCell(value: string) {
    return `"${value.replace(/"/g, '""')}"`;
}

function fileExtension(mimeType: string, kind: Asset["kind"]) {
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("jpeg")) return "jpg";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("gif")) return "gif";
    if (mimeType.includes("audio/mp4")) return "m4a";
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("webm")) return "webm";
    if (mimeType.includes("mpeg")) return "mp3";
    if (mimeType.includes("wav")) return "wav";
    if (mimeType.includes("ogg")) return "ogg";
    return kind === "image" ? "png" : kind === "video" ? "mp4" : "bin";
}

function readLatestGeneration(asset?: Asset) {
    const metadata = asset?.metadata;
    const records = [...readGenerationRecords(metadata?.generations), ...readGenerationRecords(metadata?.generation)];
    return records.at(-1);
}

function readGenerationRecords(value: unknown): Record<string, unknown>[] {
    if (Array.isArray(value)) return value.flatMap((item) => (readRecord(item) ? [readRecord(item) as Record<string, unknown>] : []));
    const record = readRecord(value);
    return record ? [record] : [];
}

function readRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown) {
    return typeof value === "string" ? value : undefined;
}

function resolveDurationSeconds(generation?: Record<string, unknown>, config?: Record<string, unknown>) {
    const candidates = [generation?.duration, generation?.seconds, config?.duration, config?.seconds, config?.defaultDuration];
    for (const value of candidates) {
        const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
        if (Number.isFinite(numberValue) && numberValue > 0) return numberValue;
    }
    return undefined;
}
