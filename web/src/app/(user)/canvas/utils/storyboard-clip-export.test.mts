import assert from "node:assert/strict";
import test from "node:test";

import type { Asset } from "@/stores/use-asset-store";

import { buildStoryboardClipExportPlan, safeFileSegment, storyboardClipExportCsv } from "./storyboard-clip-export.ts";
import type { StoryboardGroup, StoryboardShot } from "./storyboard-management.ts";

const group: StoryboardGroup = {
    id: "group-1",
    projectId: "project-1",
    order: 1,
    title: "第一集 / 操场冲突",
    description: "毕业典礼冲突升级",
    preset: { ratio: "16:9", defaultDuration: "8" },
    shotIds: ["shot-1", "shot-2"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
};

test("builds ordered storyboard clip package manifest and media requests", () => {
    const plan = buildStoryboardClipExportPlan({
        group,
        shots: [shot("shot-2", 2, "冲突升级", "video-2"), shot("shot-1", 1, "开场钩子", "video-1", [{ assetId: "image-1", kind: "image", role: "first_frame" }])],
        assets: [videoAsset("video-1", "操场开场", "video:one", "ep-seedance", "volcengine-ark"), videoAsset("video-2", "冲突升级", "video:two", "ep-seedance", "volcengine-ark"), imageAsset("image-1", "操场参考", "image:one")],
        exportedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(plan.fileName, "剪辑包_第一集_操场冲突.zip");
    assert.deepEqual(
        plan.manifest.shots.map((item) => item.shotId),
        ["shot-1", "shot-2"],
    );
    assert.equal(plan.manifest.shots[0].primaryVideoPath, "videos/001_开场钩子.mp4");
    assert.equal(plan.manifest.shots[0].model, "ep-seedance");
    assert.equal(plan.manifest.shots[0].provider, "volcengine-ark");
    assert.equal(plan.manifest.shots[0].durationSeconds, 6);
    assert.equal(plan.promptFiles[0].name, "prompts/001_开场钩子_prompt.txt");
    assert.deepEqual(plan.mediaRequests.map((item) => item.path).sort(), ["references/001_开场钩子/01_操场参考.png", "videos/001_开场钩子.mp4", "videos/002_冲突升级.mp4"]);
    assert.equal(plan.manifest.warnings.length, 0);
});

test("reports export warnings for failed shots and missing primary videos", () => {
    const plan = buildStoryboardClipExportPlan({
        group,
        shots: [{ ...shot("shot-1", 1, "失败镜头"), status: "error", errorMessage: "上游失败" }, shot("shot-2", 2, "主版本不是视频", "image-1"), shot("shot-3", 3, "缺少文件", "video-missing")],
        assets: [imageAsset("image-1", "图片主版本", "image:one"), videoAsset("video-missing", "缺少文件视频", "", "m", "p")],
        exportedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.deepEqual(
        plan.manifest.warnings.map((item) => item.type),
        ["failed_shot", "missing_primary_asset", "primary_asset_not_video", "missing_video_storage"],
    );
    assert.equal(plan.mediaRequests.length, 0);
});

test("escapes csv cells and keeps readable warning text", () => {
    const csv = storyboardClipExportCsv([
        {
            order: 1,
            shotId: "shot-1",
            title: "标题,含逗号",
            description: "",
            status: "done",
            prompt: '他说"开始"',
            effectivePrompt: "第一行\n第二行",
            primaryVideoPath: "videos/001.mp4",
            references: [],
            warnings: [{ shotId: "shot-1", type: "duration_anomaly", message: "时长异常" }],
        },
    ]);

    assert.match(csv, /"标题,含逗号"/);
    assert.match(csv, /"他说""开始"""/);
    assert.match(csv, /"第一行\n第二行"/);
    assert.match(csv, /"时长异常"/);
});

test("normalizes unsafe path segments", () => {
    assert.equal(safeFileSegment('第 1 集: A/B * "C"'), "第_1_集_A_B_C");
});

function shot(id: string, order: number, title: string, primaryAssetId?: string, assetRefs: StoryboardShot["assetRefs"] = []): StoryboardShot {
    return {
        id,
        groupId: "group-1",
        order,
        title,
        description: `${title} 描述`,
        prompt: `${title} 提示词`,
        effectivePrompt: "",
        assetRefs,
        nodeRefs: [],
        resultAssetIds: primaryAssetId ? [primaryAssetId] : [],
        primaryAssetId,
        status: "done",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    };
}

function videoAsset(id: string, title: string, storageKey: string, model: string, provider: string): Asset {
    return {
        id,
        kind: "video",
        title,
        folderId: undefined,
        coverUrl: "",
        tags: [],
        data: { url: "", storageKey, width: 1280, height: 720, bytes: 1024, mimeType: "video/mp4" },
        metadata: { generation: { model, provider, duration: "6", actionType: "generate", taskId: `task-${id}`, config: { seconds: "6", ratio: "16:9" } } },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    };
}

function imageAsset(id: string, title: string, storageKey: string): Asset {
    return {
        id,
        kind: "image",
        title,
        folderId: undefined,
        coverUrl: "",
        tags: [],
        data: { dataUrl: "", storageKey, width: 1280, height: 720, bytes: 512, mimeType: "image/png" },
        metadata: {},
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    };
}
