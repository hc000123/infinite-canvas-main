import assert from "node:assert/strict";
import test from "node:test";

import type { StoryboardTableShot, StoryboardWorkbenchImage } from "../utils/storyboard-management.ts";
import { removeStoryboardTableShot, removeStoryboardWorkbenchImage, selectStoryboardCandidate } from "./storyboard-workbench-state.ts";

const now = "2026-08-10T00:00:00.000Z";

test("selects only a candidate owned by the same shot", () => {
    const shot = tableShot("shot-1");
    const otherShot = tableShot("shot-2");
    const candidate = workbenchImage("candidate-1", shot.id, "candidate");
    const state = { tableShots: [shot, otherShot], workbenchImages: [candidate] };

    const rejected = selectStoryboardCandidate(state, otherShot.id, candidate.id, now);
    assert.equal(rejected.tableShots.find((item) => item.id === otherShot.id)?.selectedCandidateId, undefined);

    const selected = selectStoryboardCandidate(state, shot.id, candidate.id, now);
    assert.equal(selected.tableShots.find((item) => item.id === shot.id)?.selectedCandidateId, candidate.id);

    const cleared = selectStoryboardCandidate(selected, shot.id, undefined, now);
    assert.equal(cleared.tableShots.find((item) => item.id === shot.id)?.selectedCandidateId, undefined);
});

test("removing a workbench image clears shot pointers", () => {
    const reference = workbenchImage("reference-1", "shot-1", "reference");
    const candidate = workbenchImage("candidate-1", "shot-1", "candidate");
    const state = { tableShots: [{ ...tableShot("shot-1"), referenceImageIds: [reference.id], selectedCandidateId: candidate.id }], workbenchImages: [reference, candidate] };
    const withoutReference = removeStoryboardWorkbenchImage(state, reference.id);
    const result = removeStoryboardWorkbenchImage(withoutReference, candidate.id);
    assert.deepEqual(result.tableShots[0].referenceImageIds, []);
    assert.equal(result.tableShots[0].selectedCandidateId, undefined);
});

test("removing a table shot removes only its draft workbench images", () => {
    const firstShot = tableShot("shot-1");
    const secondShot = tableShot("shot-2");
    const firstImage = workbenchImage("candidate-1", firstShot.id, "candidate");
    const remainingImage = workbenchImage("candidate-2", secondShot.id, "candidate");
    const result = removeStoryboardTableShot({ tableShots: [firstShot, secondShot], shotGroups: [], workbenchImages: [firstImage, remainingImage] }, firstShot.id);
    assert.deepEqual(result.workbenchImages.map((image) => image.id), [remainingImage.id]);
});

function tableShot(id: string) {
    return {
        id,
        projectId: "project-1",
        canvasId: "canvas-1",
        episodeId: "episode-1",
        sceneName: "未分场",
        location: "",
        timeOfDay: "",
        title: "镜头 1",
        scriptText: "",
        visualDescription: "",
        characters: [],
        dialogue: "",
        action: "",
        emotion: "",
        shotSize: "",
        cameraMovement: "",
        estimatedDuration: 5,
        assetNeeds: [],
        assetRefs: [],
        productionBibleRefs: [],
        order: 1,
        createdAt: now,
        updatedAt: now,
    } as StoryboardTableShot;
}

function workbenchImage(id: string, shotId: string, role: "candidate" | "reference") {
    return {
        id,
        projectId: "project-1",
        canvasId: "canvas-1",
        episodeId: "episode-1",
        shotId,
        role,
        source: "upload" as const,
        title: `${role}-${shotId}`,
        dataUrl: `blob:${role}-${shotId}`,
        width: 100,
        height: 100,
        bytes: 100,
        mimeType: "image/png",
        createdAt: now,
    } as StoryboardWorkbenchImage;
}
