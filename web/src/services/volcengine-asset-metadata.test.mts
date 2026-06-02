import assert from "node:assert/strict";
import test from "node:test";

import { buildVolcengineImageFilename, isVolcengineReviewProcessing, mergeVolcengineReviewStatus, shouldShowVolcengineReviewAction, volcengineReviewMetadataFromSubmission, volcengineReviewPollingKey } from "./volcengine-asset-metadata.ts";

test("creates review metadata from CreateAsset submission", () => {
    const metadata = volcengineReviewMetadataFromSubmission({
        assetId: "asset-test",
        groupId: "group-test",
        projectName: "default",
        status: "Processing",
        publicUrl: "https://example.com/portrait.jpeg",
        submittedAt: "2026-06-01T12:00:00+08:00",
        updatedAt: "2026-06-01T12:00:00+08:00",
    });

    assert.deepEqual(metadata, {
        assetId: "asset-test",
        groupId: "group-test",
        projectName: "default",
        status: "Processing",
        error: "",
        publicUrl: "https://example.com/portrait.jpeg",
        submittedAt: "2026-06-01T12:00:00+08:00",
        updatedAt: "2026-06-01T12:00:00+08:00",
    });
});

test("merges GetAsset status without losing existing submission fields", () => {
    const metadata = mergeVolcengineReviewStatus(
        {
            assetId: "asset-test",
            groupId: "group-old",
            projectName: "default",
            status: "Processing",
            error: "",
            publicUrl: "https://example.com/original.jpeg",
            submittedAt: "2026-06-01T12:00:00+08:00",
            updatedAt: "2026-06-01T12:00:00+08:00",
        },
        {
            assetId: "",
            groupId: "group-new",
            projectName: "",
            status: "Active",
            publicUrl: "https://ark-media.example.com/signed.jpeg",
            assetType: "Image",
            updatedAt: "2026-06-01T12:00:09+08:00",
        },
    );

    assert.deepEqual(metadata, {
        assetId: "asset-test",
        groupId: "group-new",
        projectName: "default",
        status: "Active",
        error: "",
        publicUrl: "https://ark-media.example.com/signed.jpeg",
        submittedAt: "2026-06-01T12:00:00+08:00",
        updatedAt: "2026-06-01T12:00:09+08:00",
    });
});

test("builds a safe image filename for review upload", () => {
    assert.equal(buildVolcengineImageFilename("角色/头像:测试", "node-1", "image/jpeg"), "角色_头像_测试.jpeg");
    assert.equal(buildVolcengineImageFilename("", "node-1", ""), "node-1.png");
});

test("shows the review action for image assets regardless of config state", () => {
    assert.equal(shouldShowVolcengineReviewAction("image"), true);
    assert.equal(shouldShowVolcengineReviewAction("video"), false);
    assert.equal(shouldShowVolcengineReviewAction("audio"), false);
    assert.equal(shouldShowVolcengineReviewAction("text"), false);
});

test("detects only submitted reviews that are still processing", () => {
    assert.equal(isVolcengineReviewProcessing({ assetId: "asset-test", status: "Processing" }), true);
    assert.equal(isVolcengineReviewProcessing({ assetId: "asset-test", status: "Active" }), false);
    assert.equal(isVolcengineReviewProcessing({ assetId: "", status: "Processing" }), false);
});

test("builds a stable polling key for processing reviews", () => {
    assert.equal(
        volcengineReviewPollingKey([
            { id: "asset-1", metadata: { volcengineAsset: { assetId: "ark-1", status: "Processing" } } },
            { id: "asset-2", metadata: { volcengineAsset: { assetId: "ark-2", status: "Active" } } },
            { id: "asset-3", metadata: { volcengineAsset: { assetId: "ark-3", status: "Processing" } } },
        ]),
        "asset-1:ark-1|asset-3:ark-3",
    );
});
