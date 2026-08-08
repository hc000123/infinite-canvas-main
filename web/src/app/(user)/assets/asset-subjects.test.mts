import assert from "node:assert/strict";
import test from "node:test";

import { assetCategoryLabel, assetsForEpisode, nextAssetSubjectCode, normalizeAssetBinding, subjectAssetGroups } from "./asset-subjects.ts";
import type { Asset, AssetSubject } from "../../../stores/use-asset-store.ts";

const subject: AssetSubject = { id: "subject-1", projectId: "project-1", category: "character", code: "CHAR-001", name: "林默", tags: [], createdAt: "", updatedAt: "" };

test("creates stable subject codes and validates multi-episode bindings", () => {
    assert.equal(nextAssetSubjectCode([subject], "project-1", "character"), "CHAR-002");
    assert.deepEqual(normalizeAssetBinding({ projectId: "project-1", subjectId: subject.id, category: "character", variantName: " 校服 ", allEpisodes: false, episodeIds: ["ep-1", "ep-x"] }, [subject], new Set(["ep-1"])).episodeIds, ["ep-1"]);
});

test("returns global and episode-specific images", () => {
    const image = (id: string, allEpisodes: boolean, episodeIds: string[]) =>
        ({
            id,
            kind: "image",
            title: id,
            coverUrl: "",
            tags: [],
            data: { dataUrl: id, width: 1, height: 1, bytes: 1, mimeType: "image/png" },
            assetBinding: { projectId: "project-1", subjectId: subject.id, category: "character", variantName: id, allEpisodes, episodeIds },
            createdAt: "",
            updatedAt: "",
        }) as Asset;
    assert.deepEqual(
        assetsForEpisode([image("global", true, []), image("episode", false, ["ep-1"]), image("other", false, ["ep-2"])], "project-1", "ep-1").map((asset) => asset.id),
        ["global", "episode"],
    );
});

test("supports blocking subjects and keeps subjects without formal images visible", () => {
    const blockingSubject: AssetSubject = { ...subject, id: "blocking-1", category: "blocking", code: "BLOCK-001", name: "对话站位" };
    assert.equal(assetCategoryLabel("blocking"), "站位");
    assert.equal(nextAssetSubjectCode([blockingSubject], "project-1", "blocking"), "BLOCK-002");
    assert.deepEqual(subjectAssetGroups([blockingSubject], [], "project-1"), [{ subject: blockingSubject, assets: [] }]);
});
