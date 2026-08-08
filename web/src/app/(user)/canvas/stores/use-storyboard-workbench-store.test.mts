import assert from "node:assert/strict";
import test from "node:test";

import { useStoryboardStore } from "./use-storyboard-store.ts";

test("selects only a candidate owned by the same shot", () => {
    resetStore();
    const store = useStoryboardStore.getState();
    const shotId = store.addTableShot(emptyShot());
    const otherShotId = store.addTableShot({ ...emptyShot(), title: "镜头 2" });
    const candidateId = store.addWorkbenchImage(workbenchImage(shotId, "candidate"));
    store.selectCandidate(otherShotId, candidateId);
    assert.equal(useStoryboardStore.getState().tableShots.find((shot) => shot.id === otherShotId)?.selectedCandidateId, undefined);
    store.selectCandidate(shotId, candidateId);
    assert.equal(useStoryboardStore.getState().tableShots.find((shot) => shot.id === shotId)?.selectedCandidateId, candidateId);
    store.selectCandidate(shotId);
    assert.equal(useStoryboardStore.getState().tableShots.find((shot) => shot.id === shotId)?.selectedCandidateId, undefined);
});

test("removing a workbench image clears shot pointers", () => {
    resetStore();
    const store = useStoryboardStore.getState();
    const shotId = store.addTableShot(emptyShot());
    const referenceId = store.addWorkbenchImage(workbenchImage(shotId, "reference"));
    const candidateId = store.addWorkbenchImage(workbenchImage(shotId, "candidate"));
    store.updateTableShot(shotId, { referenceImageIds: [referenceId], selectedCandidateId: candidateId });
    store.removeWorkbenchImage(referenceId);
    store.removeWorkbenchImage(candidateId);
    const shot = useStoryboardStore.getState().tableShots.find((item) => item.id === shotId);
    assert.deepEqual(shot?.referenceImageIds, []);
    assert.equal(shot?.selectedCandidateId, undefined);
});

test("removing a table shot removes only its draft workbench images", () => {
    resetStore();
    const store = useStoryboardStore.getState();
    const firstId = store.addTableShot(emptyShot());
    const secondId = store.addTableShot({ ...emptyShot(), title: "镜头 2" });
    store.addWorkbenchImage(workbenchImage(firstId, "candidate"));
    const remainingId = store.addWorkbenchImage(workbenchImage(secondId, "candidate"));
    store.removeTableShot(firstId);
    assert.deepEqual(useStoryboardStore.getState().workbenchImages.map((image) => image.id), [remainingId]);
});

function resetStore() {
    useStoryboardStore.setState({ groups: [], shots: [], tableShots: [], shotGroups: [], workbenchImages: [] });
}

function emptyShot() {
    return {
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
    };
}

function workbenchImage(shotId: string, role: "candidate" | "reference") {
    return {
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
    };
}
