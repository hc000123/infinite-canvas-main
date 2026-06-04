import assert from "node:assert/strict";
import test from "node:test";

import { assetGenerationActionLabel, assetGenerationFilterOptions, assetGenerationRecords, assetGenerationSearchText, assetMatchesGenerationFilters, latestAssetGeneration } from "./asset-generation.ts";
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

test("reads generation and generations records", () => {
    const records = assetGenerationRecords(generatedVideo);

    assert.equal(records.length, 2);
    assert.equal(latestAssetGeneration(generatedVideo)?.projectTitle, "毕业画布");
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

test("generation search text includes prompts and task id", () => {
    const text = assetGenerationSearchText(generatedVideo);

    assert.ok(text.includes("实际提示词"));
    assert.ok(text.includes("task-1"));
    assert.ok(text.includes("video-node"));
});
