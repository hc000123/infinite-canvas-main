import assert from "node:assert/strict";
import test from "node:test";

import type { Asset } from "@/stores/use-asset-store.ts";
import type { GenerationQueueItem } from "../canvas/utils/generation-queue.ts";
import type { ProductionBibleItem } from "../canvas/utils/production-bible.ts";
import type { ScriptEpisode, ScriptProject, ScriptScene } from "../canvas/utils/script-management.ts";
import type { StoryboardGroup, StoryboardShot } from "../canvas/utils/storyboard-management.ts";
import { buildProjectOverviewDashboard, buildProjectOverviewSuggestions, projectOverviewActionHref } from "./project-overview-dashboard.ts";
import type { ProjectAssetReferenceSummary } from "./project-asset-references.ts";

test("builds empty project overview stats and next-step suggestions", () => {
    const dashboard = buildProjectOverviewDashboard({
        projectId: "project-1",
        canvasCount: 0,
        scripts: [],
        episodes: [],
        scenes: [],
        storyboardGroups: [],
        storyboardShots: [],
        productionBibleItems: [],
        generationQueueItems: [],
        assets: [],
        assetReferenceRows: [],
    });

    assert.equal(dashboard.stats.canvasCount, 0);
    assert.equal(dashboard.stats.scriptProjectCount, 0);
    assert.equal(dashboard.stats.storyboardShotCount, 0);
    assert.deepEqual(
        dashboard.suggestions.map((item) => item.id),
        ["script", "production-bible", "storyboard"],
    );
});

test("builds project overview stats with scripts, storyboard, assets, and queue", () => {
    const dashboard = buildProjectOverviewDashboard({
        projectId: "project-1",
        canvasCount: 2,
        scripts: [scriptProject()],
        episodes: [episode("episode-1")],
        scenes: [scene("scene-1", "episode-1")],
        storyboardGroups: [group("group-1")],
        storyboardShots: [shot("shot-1", "group-1", { primaryAssetId: "video-1", assetRefs: [{ assetId: "image-1", kind: "image", role: "reference" }] })],
        productionBibleItems: [bibleItem("bible-1", "image-1")],
        generationQueueItems: [queueItem("queue-1", "queued")],
        assets: [videoAsset("video-1"), imageAsset("image-1", true)],
        assetReferenceRows: [referenceRow(imageAsset("image-1", true), { referenceCount: 2, inProjectLibrary: true })],
    });

    assert.equal(dashboard.stats.canvasCount, 2);
    assert.equal(dashboard.stats.scriptProjectCount, 1);
    assert.equal(dashboard.stats.episodeCount, 1);
    assert.equal(dashboard.stats.sceneCount, 1);
    assert.equal(dashboard.stats.storyboardGroupCount, 1);
    assert.equal(dashboard.stats.storyboardShotCount, 1);
    assert.equal(dashboard.stats.generationQueueCount, 1);
    assert.equal(dashboard.stats.generatedVideoCount, 1);
    assert.equal(dashboard.stats.projectLibraryAssetCount, 1);
    assert.deepEqual(
        dashboard.suggestions.map((item) => item.id),
        ["clip-export"],
    );
});

test("counts outdated references and missing materials", () => {
    const dashboard = buildProjectOverviewDashboard({
        projectId: "project-1",
        canvasCount: 1,
        scripts: [scriptProject()],
        episodes: [episode("episode-1")],
        scenes: [],
        storyboardGroups: [group("group-1")],
        storyboardShots: [shot("shot-1", "group-1", { assetRefs: [] })],
        productionBibleItems: [bibleItem("bible-1")],
        generationQueueItems: [queueItem("queue-1", "failed")],
        assets: [imageAsset("image-1")],
        assetReferenceRows: [referenceRow(imageAsset("image-1"), { hasOutdatedVersion: true, hasMissingLocalFile: true })],
    });

    assert.equal(dashboard.stats.missingMaterialCount, 3);
    assert.equal(dashboard.stats.outdatedReferenceCount, 1);
    assert.equal(dashboard.stats.failedGenerationCount, 1);
    assert.deepEqual(
        dashboard.suggestions.map((item) => item.id),
        ["missing-materials", "outdated-references", "failed-generation"],
    );
});

test("generates next-step suggestions from stats", () => {
    const suggestions = buildProjectOverviewSuggestions(
        {
            canvasCount: 0,
            scriptProjectCount: 0,
            episodeCount: 0,
            sceneCount: 0,
            storyboardGroupCount: 0,
            storyboardShotCount: 0,
            generationQueueCount: 0,
            generatedVideoCount: 0,
            failedGenerationCount: 2,
            missingMaterialCount: 1,
            outdatedReferenceCount: 3,
            projectLibraryAssetCount: 0,
            recentAgentTaskCount: 0,
        },
        [group("group-1")],
    );

    assert.deepEqual(
        suggestions.map((item) => [item.id, item.target.type]),
        [
            ["script", "primary-canvas"],
            ["storyboard", "storyboard"],
            ["missing-materials", "asset-references"],
            ["outdated-references", "asset-references"],
            ["failed-generation", "storyboard"],
            ["clip-export", "storyboard"],
        ],
    );
});

test("builds overview action href targets", () => {
    assert.equal(projectOverviewActionHref("project-1", { type: "assets-page" }), "/assets?projectId=project-1");
    assert.equal(projectOverviewActionHref("project-1", { type: "agent" }), "/projects/project-1/agents");
    assert.equal(projectOverviewActionHref("project-1", { type: "tab", tab: "canvas" }), "");
});

function scriptProject(): ScriptProject {
    return { projectId: "project-1", outline: "故事大纲", createdAt: "now", updatedAt: "now" };
}

function episode(id: string): ScriptEpisode {
    return { id, projectId: "project-1", order: 1, title: "第一集", summary: "", hook: "", turningPoint: "", cliffhanger: "", sceneIds: [], createdAt: "now", updatedAt: "now" };
}

function scene(id: string, episodeId: string): ScriptScene {
    return { id, episodeId, order: 1, location: "", characterIds: [], beat: "", dialogue: "", emotion: "", durationHint: "", createdAt: "now", updatedAt: "now" };
}

function group(id: string): StoryboardGroup {
    return { id, projectId: "project-1", order: 1, title: "分镜组", description: "", preset: {}, shotIds: [], createdAt: "now", updatedAt: "now" };
}

function shot(id: string, groupId: string, patch: Partial<StoryboardShot> = {}): StoryboardShot {
    return {
        id,
        groupId,
        order: 1,
        title: "分镜",
        description: "",
        prompt: "",
        effectivePrompt: "",
        assetRefs: [],
        nodeRefs: [],
        resultAssetIds: [],
        status: "draft",
        createdAt: "now",
        updatedAt: "now",
        ...patch,
    };
}

function bibleItem(id: string, assetId?: string): ProductionBibleItem {
    return {
        id,
        projectId: "project-1",
        kind: "character",
        name: "角色",
        description: "",
        tags: [],
        assetRefs: assetId ? [{ assetId, role: "portrait" }] : [],
        promptSnippets: {},
        createdAt: "now",
        updatedAt: "now",
    };
}

function queueItem(id: string, status: GenerationQueueItem["status"]): GenerationQueueItem {
    return {
        id,
        projectId: "project-1",
        storyboardGroupId: "group-1",
        storyboardShotId: "shot-1",
        nodeId: "node-1",
        kind: "video",
        status,
        priority: 1,
        estimatedCredits: 8,
        createdAt: "now",
        updatedAt: "now",
    };
}

function imageAsset(id: string, inProjectLibrary = false): Asset {
    return {
        id,
        kind: "image",
        title: "图片",
        coverUrl: "",
        tags: [],
        createdAt: "now",
        updatedAt: "now",
        data: { dataUrl: `/${id}.png`, storageKey: `image:${id}`, width: 100, height: 100, bytes: 100, mimeType: "image/png" },
        metadata: inProjectLibrary ? { projectLibraries: [{ projectId: "project-1", visibility: "project", role: "editor", syncStatus: "local", addedAt: "now", updatedAt: "now" }] } : {},
    };
}

function videoAsset(id: string): Asset {
    return {
        id,
        kind: "video",
        title: "视频",
        coverUrl: "",
        tags: [],
        createdAt: "now",
        updatedAt: "now",
        data: { url: `/${id}.mp4`, storageKey: `video:${id}`, width: 1280, height: 720, bytes: 100, mimeType: "video/mp4" },
        metadata: { generation: { projectId: "project-1", storyboardGroupId: "group-1", createdAt: "now" } },
    };
}

function referenceRow(asset: Asset, patch: Partial<ProjectAssetReferenceSummary> = {}): ProjectAssetReferenceSummary {
    return {
        asset,
        references: [{ id: `${asset.id}:ref`, type: "canvas", label: "引用", hasOutdatedVersion: patch.hasOutdatedVersion }],
        referenceCount: 1,
        hasOutdatedVersion: false,
        hasMissingLocalFile: false,
        inProjectLibrary: false,
        updatedAt: asset.updatedAt,
        ...patch,
    };
}
