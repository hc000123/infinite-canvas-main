import assert from "node:assert/strict";
import test from "node:test";

import {
    assetGenerationActionLabel,
    assetGenerationFilterOptions,
    assetGenerationLineage,
    assetGenerationRecords,
    assetGenerationSearchText,
    assetGenerationVersionRecords,
    assetMatchesGenerationFilters,
    latestAssetGeneration,
} from "./asset-generation.ts";
import type { Asset } from "../../../stores/use-asset-store.ts";

const generatedVideo: Asset = {
    id: "asset-video",
    kind: "video",
    title: "视频素材",
    coverUrl: "",
    tags: ["毕业"],
    source: "Canvas",
    createdAt: "",
    updatedAt: "",
    data: { url: "blob:video", storageKey: "media:video", width: 1280, height: 720, bytes: 10, mimeType: "video/mp4" },
    metadata: {
        generation: {
            source: "canvas",
            projectTitle: "毕业画布",
            nodeId: "video-node",
            prompt: "原提示词",
            effectivePrompt: "实际提示词",
            model: "seedance",
            provider: "volcengine-ark",
            taskId: "task-1",
            actionType: "variant",
            storyboardGroupId: "storyboard-group-1",
            storyboardShotId: "storyboard-shot-1",
            config: {
                ratio: "16:9",
            },
        },
        generations: [
            {
                source: "canvas",
                projectTitle: "旧画布",
                nodeId: "old-node",
                model: "seedance",
                provider: "volcengine-ark",
                actionType: "generate",
            },
        ],
    },
};

const legacyWorkflowVideo: Asset = {
    id: "workflow-video",
    kind: "video",
    title: "ep05-P01 火把进入仓库",
    coverUrl: "",
    tags: ["视频工作流"],
    source: "original-workflow-video",
    note: "minimal test shot white mug",
    createdAt: "2026-06-15T03:57:00.000Z",
    updatedAt: "2026-06-15T03:58:00.000Z",
    data: { url: "blob:workflow-video", storageKey: "media:workflow-video", width: 720, height: 1280, bytes: 100, mimeType: "video/mp4" },
    metadata: {
        aiTask: {
            aiTaskCredits: 300,
            aiTaskId: "aitask-1",
            aiTaskStatus: "succeeded",
            creditLogId: "credit-1",
            upstreamTaskId: "cgt-1",
        },
        originalWorkflow: {
            packageId: "ep05-P01",
            sourceEpisode: "ep05",
        },
        videoGeneration: {
            model: "doubao-seedance-2-0",
            protocol: "volcengine-ark",
            seconds: "4",
            size: "9:16",
        },
    },
};

test("reads generation and generations records", () => {
    const records = assetGenerationRecords(generatedVideo);

    assert.equal(records.length, 2);
    assert.equal(latestAssetGeneration(generatedVideo)?.projectTitle, "毕业画布");
});

test("infers generation records from legacy video workflow asset metadata", () => {
    const records = assetGenerationRecords(legacyWorkflowVideo);

    assert.equal(records.length, 1);
    assert.equal(records[0]?.source, "video-page");
    assert.equal(records[0]?.prompt, "minimal test shot white mug");
    assert.equal(records[0]?.productionPackageId, "ep05-P01");
    assert.equal(records[0]?.sourceEpisode, "ep05");
    assert.equal(records[0]?.aiTaskId, "aitask-1");
    assert.equal(records[0]?.upstreamTaskId, "cgt-1");
    assert.equal(records[0]?.model, "doubao-seedance-2-0");
    assert.equal(records[0]?.provider, "volcengine-ark");
});

test("labels video generation actions in Chinese", () => {
    assert.equal(assetGenerationActionLabel("generate"), "生成");
    assert.equal(assetGenerationActionLabel("variant"), "平行变体");
    assert.equal(assetGenerationActionLabel("edit"), "编辑视频");
    assert.equal(assetGenerationActionLabel("extend"), "延长视频");
    assert.equal(assetGenerationActionLabel("continue"), "续写");
});

test("builds generation filter options and matches filters", () => {
    const options = assetGenerationFilterOptions([generatedVideo]);

    assert.deepEqual(options.sources, [{ value: "canvas", label: "画布" }]);
    assert.ok(options.actions.some((item) => item.value === "variant"));
    assert.ok(options.modelProviders.some((item) => item.value === "volcengine-ark / seedance"));
    assert.equal(assetMatchesGenerationFilters(generatedVideo, { source: "canvas", action: "variant", modelProvider: "volcengine-ark / seedance", taskId: "with" }), true);
    assert.equal(assetMatchesGenerationFilters(generatedVideo, { taskId: "without" }), false);
});

test("builds source lineage from generation metadata", () => {
    const lineage = assetGenerationLineage(latestAssetGeneration(generatedVideo));

    assert.deepEqual(
        lineage.map((item) => [item.label, item.value]),
        [
            ["来源", "画布"],
            ["项目", "毕业画布"],
            ["分镜组", "storyboard-group-1"],
            ["分镜", "storyboard-shot-1"],
            ["节点", "video-node"],
            ["任务", "task-1"],
            ["动作", "平行变体"],
        ],
    );
});

test("builds inferred generation version records", () => {
    const versions = assetGenerationVersionRecords(generatedVideo);

    assert.equal(versions.length, 2);
    assert.equal(versions[0]?.label, "版本 1");
    assert.equal(versions[0]?.isLatest, false);
    assert.equal(versions[1]?.label, "版本 2");
    assert.equal(versions[1]?.isLatest, true);
    assert.equal(versions[1]?.storyboardShotId, "storyboard-shot-1");
});

test("generation search text includes prompts, task id and storyboard ids", () => {
    const text = assetGenerationSearchText(generatedVideo);

    assert.ok(text.includes("实际提示词"));
    assert.ok(text.includes("task-1"));
    assert.ok(text.includes("video-node"));
    assert.ok(text.includes("storyboard-group-1"));
    assert.ok(text.includes("storyboard-shot-1"));
});

test("legacy video workflow generation search includes package and task context", () => {
    const text = assetGenerationSearchText(legacyWorkflowVideo);

    assert.ok(text.includes("ep05-p01"));
    assert.ok(text.includes("ep05"));
    assert.ok(text.includes("cgt-1"));
    assert.ok(text.includes("minimal test shot white mug"));
});
