import assert from "node:assert/strict";
import test from "node:test";

import type { Asset } from "../../../stores/use-asset-store.ts";
import { buildImportedVideoPackage, enterpriseVideoChannelReadiness, resolveWorkflowReferenceImages, workflowVideoGenerationReadiness } from "./video-package-builders.ts";

test("imported copy-only package is ready for batch video generation", () => {
    const item = buildImportedVideoPackage({
        duration: "8秒",
        episode: "ep05",
        id: "P01",
        sourceProjectId: "project-1",
        prompt: "目标生成时长：8秒。雨夜街巷，镜头缓慢推进。",
        segment: "雨夜街巷",
        sourcePath: "outputs/ep05/02-seedance-copy-only.md",
    });

    assert.equal(item.id, "ep05-P01");
    assert.equal(item.promptStatus, "已确认");
    assert.equal(item.canvasStatus, "未导入");
    assert.equal(item.assetStatus, "完整");
    assert.equal(item.duration, "8秒");
    assert.equal(item.sourceProjectId, "project-1");
    assert.match(item.risks[0].text, /Copy-only/);
});

test("imported copy-only package marks unresolved image slots as missing references", () => {
    const item = buildImportedVideoPackage({
        duration: "8秒",
        episode: "ep05",
        id: "P02",
        prompt: "参考 @图1 和 @图2。镜头缓慢推进。",
        segment: "雨夜街巷",
        sourcePath: "outputs/ep05/02-seedance-copy-only.md",
    });

    assert.equal(item.assetStatus, "缺角色图");
    assert.deepEqual(
        item.assets.map((asset) => asset.name),
        ["@图1 未解析参考图", "@图2 未解析参考图"],
    );
});

test("imported copy-only package keeps only referenced workflow image slots", () => {
    const item = buildImportedVideoPackage({
        duration: "8秒",
        episode: "ep05",
        id: "P01",
        prompt: "参考 @图1（林秀妹）、@图10（旧柴油油桶）。雨夜街巷。",
        references: [
            { name: "林秀妹", ref: "@图1", type: "人物参考" },
            { name: "海边柴油仓库", ref: "@图6", type: "场景参考" },
            { name: "旧柴油油桶", ref: "@图10", type: "道具参考" },
        ],
        segment: "雨夜街巷",
        sourcePath: "outputs/ep05/02-seedance-copy-only.md",
    });

    assert.deepEqual(
        item.assets.map((asset) => asset.name),
        ["@图1 林秀妹", "@图10 旧柴油油桶"],
    );
    assert.equal(item.workflowReferences?.length, 3);
});

test("workflow reference images prefer active Volcengine asset uri", () => {
    const item = buildImportedVideoPackage({
        duration: "8秒",
        episode: "ep05",
        id: "P01",
        prompt: "参考 @图1（林秀妹）。雨夜街巷。",
        references: [{ name: "林秀妹", ref: "@图1", type: "人物参考" }],
        segment: "雨夜街巷",
        sourcePath: "outputs/ep05/02-seedance-copy-only.md",
    });
    const images = resolveWorkflowReferenceImages(item, [
        workflowImageAsset("asset-image-1", "林秀妹 · 角色", {
            assetId: "ark-image-1",
            status: "Active",
        }),
    ]);

    assert.equal(images.length, 1);
    assert.equal(images[0].assetUri, "asset://ark-image-1");
    assert.equal(images[0].volcengineAssetStatus, "Active");
});

test("workflow reference images keep processing Volcengine status without asset uri", () => {
    const item = buildImportedVideoPackage({
        duration: "8秒",
        episode: "ep05",
        id: "P01",
        prompt: "参考 @图1（林秀妹）。雨夜街巷。",
        references: [{ name: "林秀妹", ref: "@图1", type: "人物参考" }],
        segment: "雨夜街巷",
        sourcePath: "outputs/ep05/02-seedance-copy-only.md",
    });
    const images = resolveWorkflowReferenceImages(item, [
        workflowImageAsset("asset-image-1", "林秀妹 · 角色", {
            assetId: "ark-image-1",
            status: "Processing",
        }),
    ]);

    assert.equal(images.length, 1);
    assert.equal(images[0].assetUri, "");
    assert.equal(images[0].volcengineAssetStatus, "Processing");
});

test("workflow video readiness warns on missing references without blocking text generation", () => {
    const item = buildImportedVideoPackage({
        duration: "8秒",
        episode: "ep05",
        id: "P01",
        prompt: "参考 @图1（林秀妹）和 @图2（海边仓库）。雨夜街巷。",
        references: [
            { name: "林秀妹", ref: "@图1", type: "人物参考" },
            { name: "海边仓库", ref: "@图2", type: "场景参考" },
        ],
        segment: "雨夜街巷",
        sourcePath: "outputs/ep05/02-seedance-copy-only.md",
    });
    const readiness = workflowVideoGenerationReadiness(item, [workflowImageAsset("asset-image-1", "林秀妹 · 角色", { assetId: "ark-image-1", status: "Active" })], "volcengine-ark");

    assert.equal(readiness.status, "warning");
    assert.match(readiness.message, /1 个 @图N/);
});

test("workflow video readiness explains legacy packages without reference tables", () => {
    const item = buildImportedVideoPackage({
        duration: "8秒",
        episode: "ep05",
        id: "P01",
        prompt: "参考 @图1（林秀妹）。雨夜街巷。",
        segment: "雨夜街巷",
        sourcePath: "outputs/ep05/02-seedance-copy-only.md",
    });
    const readiness = workflowVideoGenerationReadiness({ ...item, workflowReferences: [] }, [], "volcengine-ark");

    assert.equal(readiness.status, "warning");
    assert.match(readiness.message, /重新同步 Copy-only/);
});

test("workflow video readiness blocks pending Ark private asset review", () => {
    const item = buildImportedVideoPackage({
        duration: "8秒",
        episode: "ep05",
        id: "P01",
        prompt: "参考 @图1（林秀妹）。雨夜街巷。",
        references: [{ name: "林秀妹", ref: "@图1", type: "人物参考" }],
        segment: "雨夜街巷",
        sourcePath: "outputs/ep05/02-seedance-copy-only.md",
    });
    const readiness = workflowVideoGenerationReadiness(item, [workflowImageAsset("asset-image-1", "林秀妹 · 角色", { assetId: "ark-image-1", status: "Processing" })], "volcengine-ark");

    assert.equal(readiness.status, "blocked");
    assert.match(readiness.message, /Processing/);
});

test("workflow video readiness passes active Ark private asset references", () => {
    const item = buildImportedVideoPackage({
        duration: "8秒",
        episode: "ep05",
        id: "P01",
        prompt: "参考 @图1（林秀妹）。雨夜街巷。",
        references: [{ name: "林秀妹", ref: "@图1", type: "人物参考" }],
        segment: "雨夜街巷",
        sourcePath: "outputs/ep05/02-seedance-copy-only.md",
    });
    const readiness = workflowVideoGenerationReadiness(item, [workflowImageAsset("asset-image-1", "林秀妹 · 角色", { assetId: "ark-image-1", status: "Active" })], "volcengine-ark");

    assert.equal(readiness.status, "ready");
});

test("enterprise video channel readiness waits for public settings", () => {
    const readiness = enterpriseVideoChannelReadiness({ isPublicSettingsLoading: true, videoProtocol: "openai" });

    assert.equal(readiness.status, "checking");
    assert.match(readiness.message, /正在读取企业视频配置/);
});

test("enterprise video channel readiness blocks non Ark protocols", () => {
    const readiness = enterpriseVideoChannelReadiness({ videoProtocol: "openai" });

    assert.equal(readiness.status, "blocked");
    assert.match(readiness.message, /不是企业 Ark/);
});

test("enterprise video channel readiness accepts Ark protocol", () => {
    const readiness = enterpriseVideoChannelReadiness({ videoProtocol: "volcengine-ark" });

    assert.equal(readiness.status, "ready");
    assert.match(readiness.message, /Seedance/);
});

function workflowImageAsset(id: string, title: string, volcengineAsset: NonNullable<Asset["metadata"]>["volcengineAsset"]): Asset {
    return {
        coverUrl: "blob:image",
        createdAt: "2026-06-01T00:00:00.000Z",
        data: {
            bytes: 10,
            dataUrl: "blob:image",
            height: 100,
            mimeType: "image/png",
            storageKey: "images/test.png",
            width: 100,
        },
        id,
        kind: "image",
        metadata: { volcengineAsset },
        source: "original-workflow",
        tags: [],
        title,
        updatedAt: "2026-06-01T00:00:00.000Z",
    };
}
