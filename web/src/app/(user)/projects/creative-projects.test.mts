import assert from "node:assert/strict";
import test from "node:test";

import { attachCanvasToCreativeProject, canvasIdsForCreativeProject, createCreativeProject, detachCanvasFromCreativeProject, unfiledCanvasProjects, updateCreativeProject, type CreativeProject } from "./creative-projects.ts";
import type { CanvasProject } from "../canvas/stores/use-canvas-store.ts";

test("createCreativeProject normalizes title and canvas ids", () => {
    const project = createCreativeProject({ title: "  短剧项目  ", canvasIds: ["a", "a", "b"] }, "project-1", "now");

    assert.equal(project.title, "短剧项目");
    assert.deepEqual(project.canvasIds, ["a", "b"]);
    assert.equal(project.status, "active");
});

test("updateCreativeProject archives and keeps omitted fields", () => {
    const project = sampleProject();
    const updated = updateCreativeProject(project, { title: "  新名称  ", status: "archived" }, "later");

    assert.equal(updated.title, "新名称");
    assert.equal(updated.status, "archived");
    assert.deepEqual(updated.canvasIds, project.canvasIds);
    assert.equal(updated.updatedAt, "later");
});

test("attach and detach canvas ids are idempotent", () => {
    const project = sampleProject();
    const attached = attachCanvasToCreativeProject(project, "canvas-2", "later");
    const attachedAgain = attachCanvasToCreativeProject(attached, "canvas-2", "later-2");
    const detached = detachCanvasFromCreativeProject(attachedAgain, "canvas-1", "done");

    assert.deepEqual(attachedAgain.canvasIds, ["canvas-1", "canvas-2"]);
    assert.deepEqual(detached.canvasIds, ["canvas-2"]);
});

test("canvasIdsForCreativeProject includes explicit and canvas-side bindings", () => {
    const project = sampleProject();
    const ids = canvasIdsForCreativeProject(project, [
        { id: "canvas-2", projectId: "project-1" },
        { id: "canvas-3", projectId: "other" },
    ]);

    assert.deepEqual(ids, ["canvas-1", "canvas-2"]);
});

test("unfiledCanvasProjects keeps old unbound canvases compatible", () => {
    const canvases = [sampleCanvas("canvas-1"), sampleCanvas("canvas-2", "project-1"), sampleCanvas("canvas-3")];
    const projects = [sampleProject()];

    assert.deepEqual(
        unfiledCanvasProjects(canvases, projects).map((item) => item.id),
        ["canvas-3"],
    );
});

function sampleProject(): CreativeProject {
    return {
        id: "project-1",
        title: "项目",
        description: "",
        status: "active",
        canvasIds: ["canvas-1"],
        createdAt: "now",
        updatedAt: "now",
    };
}

function sampleCanvas(id: string, projectId?: string): CanvasProject {
    return {
        id,
        projectId,
        title: id,
        createdAt: "now",
        updatedAt: "now",
        nodes: [],
        connections: [],
        chatSessions: [],
        activeChatId: null,
        backgroundMode: "lines",
        showImageInfo: false,
        viewport: { x: 0, y: 0, k: 1 },
    };
}
