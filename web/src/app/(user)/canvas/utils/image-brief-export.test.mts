import assert from "node:assert/strict";
import test from "node:test";

import { buildImageBriefExportCsv, buildImageBriefExportJson, buildImageBriefExportRows, csvCell, imageBriefFieldSummary, type ImageBriefExportView } from "./image-brief-export.ts";
import { defaultImageBriefFields, type ImageBrief } from "./image-brief.ts";

test("escapes brief export csv cells", () => {
    assert.equal(csvCell("普通文本"), "普通文本");
    assert.equal(csvCell('他说"开始"'), '"他说""开始"""');
    assert.equal(csvCell("标题,含逗号"), '"标题,含逗号"');
    assert.equal(csvCell("第一行\n第二行"), '"第一行\n第二行"');
});

test("summarizes brief fields with readable labels", () => {
    const result = imageBriefFieldSummary(brief({ fields: { location: "大学操场", lighting: "白天自然光", empty: "" } }));
    assert.match(result, /地点：大学操场/);
    assert.match(result, /光影：白天自然光/);
    assert.doesNotMatch(result, /empty/);
});

test("builds brief export rows with primary asset and version summary", () => {
    const rows = buildImageBriefExportRows([brief({ resultAssetIds: ["asset-1"], primaryAssetId: "asset-1" })], [
        {
            id: "asset-1",
            kind: "image",
            title: "角色图 A",
            coverUrl: "",
            data: { dataUrl: "", width: 1, height: 1, bytes: 1, mimeType: "image/png" },
            tags: [],
            createdAt: "2026-01-01",
            updatedAt: "2026-01-01",
            metadata: {
                generation: { createdAt: "2026-01-02", model: "gpt-image", provider: "openai", finalPrompt: "最终提示词", referenceAssets: [] },
                assetVersions: [{ id: "version-2", versionNumber: 2 }],
                currentAssetVersionId: "version-2",
            },
        },
    ] as never);
    assert.equal(rows[0]?.primaryAsset, "角色图 A · asset-1 · primary · v2");
    assert.match(rows[0]?.resultAssets || "", /角色图 A/);
    assert.match(rows[0]?.fieldSummary || "", /地点/);
});

test("selects fields for three brief export views", () => {
    const views: ImageBriefExportView[] = ["art_direction", "prompt_sheet", "storyboard_assets"];
    const csvs = views.map((view) => buildImageBriefExportCsv([brief({ finalPrompt: "最终提示词" })], [], view));
    assert.match(csvs[0] || "", /美术设定表|Brief 类型/);
    assert.doesNotMatch(csvs[0] || "", /最终提示词/);
    assert.match(csvs[1] || "", /最终提示词/);
    assert.match(csvs[2] || "", /剧本片段/);
});

test("exports empty brief list as header-only csv and empty json rows", () => {
    assert.equal(buildImageBriefExportCsv([], [], "prompt_sheet").split("\n").length, 1);
    const json = JSON.parse(buildImageBriefExportJson([], [], "prompt_sheet")) as { rows: unknown[]; view: string };
    assert.equal(json.view, "prompt_sheet");
    assert.deepEqual(json.rows, []);
});

function brief(patch: Partial<ImageBrief>): ImageBrief {
    return {
        id: "brief-1",
        projectId: "project-1",
        canvasId: "canvas-1",
        episodeId: "episode-1",
        episodeTitle: "第一集",
        sourceType: "manual",
        sourceId: "",
        kind: "scene",
        mode: "standard",
        title: "大学操场",
        scriptText: "毕业典礼现场",
        fields: { ...defaultImageBriefFields("scene"), location: "大学操场" },
        referenceAssets: [],
        validationResult: { ok: true, severity: "none", messages: [] },
        prompt: "提示词",
        finalPrompt: "",
        resultAssetIds: [],
        status: "prompt_ready",
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
        ...patch,
    };
}
