import assert from "node:assert/strict";
import test from "node:test";

import type { Asset } from "../../../stores/use-asset-store.ts";
import { alignWorkflowPromptReferencesForSeedance, buildImportedVideoPackage, enterpriseVideoChannelReadiness, resolveWorkflowReferenceImages, workflowPromptAuthoringIssue, workflowVideoGenerationReadiness } from "./video-package-builders.ts";

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

test("workflow reference images follow prompt mention order", () => {
    const item = buildImportedVideoPackage({
        duration: "8秒",
        episode: "ep05",
        id: "P01",
        prompt: "先看 @图10（旧柴油油桶），再看 @图1（林秀妹）。",
        references: [
            { name: "林秀妹", ref: "@图1", type: "人物参考" },
            { name: "旧柴油油桶", ref: "@图10", type: "道具参考" },
        ],
        segment: "雨夜街巷",
        sourcePath: "outputs/ep05/02-seedance-copy-only.md",
    });
    const images = resolveWorkflowReferenceImages(item, [
        workflowImageAsset("asset-image-1", "林秀妹 · 角色", { assetId: "ark-image-1", status: "Active" }),
        workflowImageAsset("asset-image-10", "旧柴油油桶 · 道具", { assetId: "ark-image-10", status: "Active" }),
    ]);

    assert.deepEqual(
        images.map((image) => image.name),
        ["@图10 旧柴油油桶", "@图1 林秀妹"],
    );
});

test("workflow character references do not bind partial name matches", () => {
    const item = buildImportedVideoPackage({
        duration: "8秒",
        episode: "ep05",
        id: "P01",
        prompt: richWorkflowPrompt("这一段视频使用 @图4（周泽）作为人物参考。"),
        references: [{ name: "周泽", ref: "@图4", type: "人物参考" }],
        segment: "毕业典礼",
        sourcePath: "outputs/ep05/02-seedance-copy-only.md",
    });
    const images = resolveWorkflowReferenceImages(item, [workflowImageAsset("asset-image-4", "周泽女友 · 角色", { assetId: "ark-image-4", status: "Active" })]);

    assert.equal(images.length, 0);
    assert.equal(workflowVideoGenerationReadiness(item, [workflowImageAsset("asset-image-4", "周泽女友 · 角色", { assetId: "ark-image-4", status: "Active" })], "volcengine-ark").status, "warning");
});

test("workflow prompt references align to submitted Seedance image order", () => {
    const prompt = "先用 @图10（旧柴油油桶），再用 @图1（林秀妹），最后回到 @图10。";
    const aligned = alignWorkflowPromptReferencesForSeedance(prompt, [
        { dataUrl: "", id: "asset-image-10", name: "@图10 旧柴油油桶", type: "image/png", url: "asset://ark-image-10" },
        { dataUrl: "", id: "asset-image-1", name: "@图1 林秀妹", type: "image/png", url: "asset://ark-image-1" },
    ]);

    assert.equal(aligned, "先用 图片 1（旧柴油油桶），再用 图片 2（林秀妹），最后回到 图片 1。");
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
        prompt: richWorkflowPrompt("这一段视频使用 @图1（林秀妹）和 @图2（海边仓库）作为参考。"),
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

test("workflow video readiness blocks dialogue that cannot fit shot duration", () => {
    const item = buildImportedVideoPackage({
        duration: "11秒",
        episode: "ep01",
        id: "P01",
        prompt:
            "目标生成时长：11秒。\n▸ 分镜一\n声音/台词：无。\n▸ 分镜二\n声音/台词：特教授：“下面，有请优秀毕业生代表，全校成绩第一的魏梁同学上台做毕业感言。”\n生产审核用时间预算校验：分镜一约3秒，分镜二约4秒，分镜三约4秒。",
        segment: "毕业典礼建立与魏梁被点名",
        sourcePath: "outputs/ep01/02-seedance-copy-only.md",
    });
    const readiness = workflowVideoGenerationReadiness(item, [], "volcengine-ark");

    assert.equal(readiness.status, "blocked");
    assert.match(readiness.message, /分镜二 台词/);
    assert.match(readiness.message, /4 秒/);
});

test("workflow prompt authoring blocks simplified copy-only prompts", () => {
    const issue = workflowPromptAuthoringIssue("毕业典礼上魏梁发言，镜头缓慢推进，电影感。目标生成时长：8秒。", "8秒");

    assert.match(issue, /简化版提示词/);
});

test("workflow prompt authoring accepts rich prompt with short spoken dialogue", () => {
    const prompt = [
        "一、基础设定",
        "这一段视频使用 @图1（魏梁）和 @图2（主席台）。",
        "二、场景起始状态",
        "魏梁站在麦克风前，台下掌声收住。",
        "三、场景固定视觉设定",
        "场景空间：毕业典礼主席台。",
        "场景材质：浅灰台面、黑色麦克风。",
        "固定道具：立式麦克风。",
        "固定光源：日间自然光。",
        "固定色彩影调：低饱和日光。",
        "摄影机与成像系统：大画幅数字电影机，球面定焦镜头组。",
        "固定画幅：竖屏 9:16。",
        "固定景深原则：魏梁脸部为主焦点。",
        "环境颗粒：操场风和衣料轻响。",
        "画面稳定目标：人物稳定、麦克风不漂移。",
        "四、画面内容分镜",
        "▸ 分镜一",
        "景别：中景。",
        "构图：魏梁在中心，麦克风在前景。",
        "运镜手法：固定后轻推。",
        "画面内容：魏梁深吸气后看向台下。",
        "声音/台词：掌声收住。",
        "▸ 分镜二",
        "景别：中近景。",
        "构图：魏梁眼睛在上三分之一处。",
        "运镜手法：轻微推近。",
        "画面内容：魏梁说完后停半拍。",
        "声音/台词：魏梁说：“谢谢大家。”",
        "五、兜底约束",
        "保持无字幕、无水印。",
        "六、生产审核用时间预算校验",
        "目标生成时长：8秒。分镜一约3秒，分镜二约4秒，口播约4字，预算通过。",
    ].join("\n");

    assert.equal(workflowPromptAuthoringIssue(prompt, "8秒"), "");
});

test("workflow video readiness explains legacy packages without reference tables", () => {
    const item = buildImportedVideoPackage({
        duration: "8秒",
        episode: "ep05",
        id: "P01",
        prompt: richWorkflowPrompt("这一段视频使用 @图1（林秀妹）作为人物参考。"),
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
        prompt: richWorkflowPrompt("这一段视频使用 @图1（林秀妹）作为人物参考。"),
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
        prompt: richWorkflowPrompt("这一段视频使用 @图1（林秀妹）作为人物参考。"),
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

function richWorkflowPrompt(referenceLine: string) {
    return [
        "一、基础设定",
        referenceLine,
        "二、场景起始状态",
        "人物站在雨夜街巷入口，视线落向前方。",
        "三、场景固定视觉设定",
        "场景空间：雨夜街巷。",
        "场景材质：湿地砖、旧墙面、金属门框。",
        "固定道具：街边门灯和路面积水。",
        "固定光源：门灯暖光和远处冷色环境光。",
        "固定色彩影调：低饱和冷暖对比。",
        "摄影机与成像系统：大画幅数字电影机，球面定焦镜头组，自然运动模糊。",
        "固定画幅：竖屏 9:16。",
        "固定景深原则：人物脸部为主焦点，街巷后景可辨。",
        "环境颗粒：雨后水汽和轻微风声。",
        "画面稳定目标：人物稳定，道具不漂移。",
        "四、画面内容分镜",
        "▸ 分镜一",
        "景别：中景。",
        "构图：人物在画面中部，门灯在后景边缘。",
        "运镜手法：固定后轻微推近。",
        "画面内容：人物抬眼看向街巷深处，手指轻收。",
        "声音/台词：雨后环境声。",
        "▸ 分镜二",
        "景别：中近景。",
        "构图：人物侧脸在右侧安全区，街巷线条向后延伸。",
        "运镜手法：沿视线轻移。",
        "画面内容：人物停半拍后转身，衣角被风带动。",
        "声音/台词：脚步声和衣料声。",
        "五、兜底约束",
        "保持人物面部稳定，无字幕、无 logo、无水印。",
        "六、生产审核用时间预算校验",
        "目标生成时长：8秒。分镜一约3秒，分镜二约4秒，无口播，预算通过。",
    ].join("\n");
}
