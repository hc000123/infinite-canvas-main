import assert from "node:assert/strict";
import test from "node:test";

import { imageWorkbenchResultFilename } from "./image-workbench-media-name.ts";

test("names cached and downloaded workbench images from source context", () => {
    assert.equal(imageWorkbenchResultFilename({ title: "女主/正面:定妆" }, 0, "image/png"), "女主-正面-定妆-结果001.png");
    assert.equal(imageWorkbenchResultFilename({ projectTitle: "全家穿越" }, 2, "image/jpeg"), "全家穿越-结果003.jpg");
    assert.equal(imageWorkbenchResultFilename({}, 0, "image/webp"), "生图工作台-结果001.webp");
});

test("filename calculation leaves source identity fields untouched", () => {
    const context = {
        title: "女主定妆",
        assetId: "workflow-asset-id",
        libraryAssetId: "library-asset-id",
        projectId: "project-id",
        episodeId: "episode-id",
    };
    const before = structuredClone(context);

    assert.equal(imageWorkbenchResultFilename(context, 0, "image/png"), "女主定妆-结果001.png");
    assert.deepEqual(context, before);
});
