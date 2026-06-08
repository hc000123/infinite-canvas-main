import assert from "node:assert/strict";
import test from "node:test";

import type { CanvasNodeData } from "../types.ts";
import { buildCanvasProductionPackages, getNodeProductionPackageId, productionPackageRoleLabel } from "./canvas-production-packages.ts";
import type { StoryboardTableShot } from "./storyboard-management.ts";

const now = "2026-06-08T00:00:00.000Z";

function shot(id: string, order: number): StoryboardTableShot {
    return {
        id,
        projectId: "project-1",
        canvasId: "canvas-1",
        episodeId: "episode-1",
        sceneName: `场次 ${order}`,
        location: "雨巷",
        timeOfDay: "夜",
        order,
        title: `镜头 ${order}`,
        scriptText: "女主回头。",
        visualDescription: "低机位跟拍。",
        characters: ["女主"],
        dialogue: "",
        action: "回头",
        emotion: "警觉",
        shotSize: "中景",
        cameraMovement: "跟拍",
        estimatedDuration: 4,
        assetNeeds: ["女主"],
        assetRefs: [],
        createdAt: now,
        updatedAt: now,
    };
}

function node(id: string, type: CanvasNodeData["type"], metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData {
    return {
        id,
        type,
        title: id,
        position: { x: 0, y: 0 },
        width: 120,
        height: 80,
        metadata,
    };
}

test("builds production package tabs from table shots when shot groups are not ready", () => {
    const packages = buildCanvasProductionPackages({
        shotGroups: [],
        tableShots: [shot("shot-1", 1), shot("shot-2", 2)],
        nodes: [
            node("config-1", "config", { storyboardShotId: "shot-1", storyboardRole: "video_config" }),
            node("video-1", "video", { storyboardShotId: "shot-1", status: "success", productionVideoVersionNumber: 1 }),
        ],
    });

    assert.equal(packages.length, 2);
    assert.equal(packages[0].label, "P01");
    assert.equal(packages[0].id, "shot-1");
    assert.equal(packages[0].shotIds[0], "shot-1");
    assert.equal(packages[0].configNodeId, "config-1");
    assert.equal(packages[0].versions[0].label, "v1");
    assert.equal(packages[1].label, "P02");
});

test("uses storyboard shot metadata as fallback package binding for old canvas nodes", () => {
    const configNode = node("config-1", "config", { storyboardShotId: "shot-1", storyboardRole: "video_config" });
    const promptNode = node("prompt-1", "text", { storyboardTableShotIds: ["shot-1"], storyboardRole: "prompt" });

    assert.equal(getNodeProductionPackageId(configNode), "shot-1");
    assert.equal(getNodeProductionPackageId(promptNode), "shot-1");
    assert.equal(productionPackageRoleLabel("video_config"), "视频配置");
});
