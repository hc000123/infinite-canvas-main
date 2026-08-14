import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { workspaceProjectId } from "./workspace-project-context.ts";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

test("shared top bars preserve current project for production control and assets", () => {
    const helper = read("./workspace-project-context.ts");
    const appTopNav = read("./app-top-nav.tsx");
    const projectTopNav = read("../../app/(user)/projects/project-workspace-shell.tsx");

    assert.match(helper, /export function workspaceProjectId/);
    assert.match(helper, /export function contextualToolHref/);
    assert.match(helper, /toolSlug === "assets"/);
    assert.match(appTopNav, /contextualToolHref\(toolSlug, projectId\)/);
    assert.match(projectTopNav, /contextualToolHref\(toolSlug, projectId\)/);
});

test("restores project context from a safe internal return target", () => {
    assert.equal(workspaceProjectId("/assets/subject-a", new URLSearchParams("returnTo=%2Fagent%3FprojectId%3Dproject-a")), "project-a");
    assert.equal(workspaceProjectId("/assets", new URLSearchParams("returnTo=%2Fimage%3FprojectId%3Dproject-b%26assetId%3Dasset-a")), "project-b");
    assert.equal(workspaceProjectId("/assets", new URLSearchParams("returnTo=https%3A%2F%2Fexample.com%2F%3FprojectId%3Devil")), "");
});
