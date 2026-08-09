import type { ShotGroup, StoryboardTableShot, StoryboardWorkbenchImage } from "../utils/storyboard-management.ts";

type StoryboardWorkbenchState = {
    tableShots: StoryboardTableShot[];
    workbenchImages: StoryboardWorkbenchImage[];
};

export function removeStoryboardTableShot(state: StoryboardWorkbenchState & { shotGroups: ShotGroup[] }, id: string) {
    return {
        tableShots: state.tableShots.filter((shot) => shot.id !== id),
        shotGroups: state.shotGroups.map((group) => ({ ...group, shotIds: group.shotIds.filter((shotId) => shotId !== id) })).filter((group) => group.shotIds.length),
        workbenchImages: state.workbenchImages.filter((image) => image.shotId !== id),
    };
}

export function removeStoryboardWorkbenchImage(state: StoryboardWorkbenchState, id: string) {
    return {
        workbenchImages: state.workbenchImages.filter((image) => image.id !== id),
        tableShots: state.tableShots.map((shot) => ({
            ...shot,
            referenceImageIds: shot.referenceImageIds?.filter((imageId) => imageId !== id),
            selectedCandidateId: shot.selectedCandidateId === id ? undefined : shot.selectedCandidateId,
        })),
    };
}

export function selectStoryboardCandidate(state: StoryboardWorkbenchState, shotId: string, candidateId?: string, updatedAt = new Date().toISOString()) {
    const candidate = candidateId ? state.workbenchImages.find((image) => image.id === candidateId && image.shotId === shotId && image.role === "candidate") : undefined;
    if (candidateId && !candidate) return state;
    return {
        workbenchImages: state.workbenchImages,
        tableShots: state.tableShots.map((shot) => (shot.id === shotId ? { ...shot, selectedCandidateId: candidate?.id, updatedAt } : shot)),
    };
}
