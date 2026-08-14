import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { agentWorkspaceHref } from "./agent-workspace-route.ts";
import { videoWorkflowHref } from "../original-workflow/video-workflow-routing.ts";

test("builds an encoded Agent workspace route", () => {
    assert.equal(agentWorkspaceHref({ projectId: "p/1", episodeId: "e 1", stage: "assets", shot: "s&1" }), "/agent?projectId=p%2F1&episodeId=e+1&stage=assets&shot=s%261");
});

test("builds a project-level Agent route without empty values", () => {
    assert.equal(agentWorkspaceHref({ projectId: "project-1" }), "/agent?projectId=project-1");
});

test("routes the existing project production helper into the episode workflow", () => {
    assert.equal(videoWorkflowHref(1, "project-1", "episode-1"), "/projects/project-1/episodes/episode-1/workflow?stage=script");
});

test("removes direct Workflow links from the episode production entry", () => {
    const header = readFileSync(new URL("./[id]/episodes/[episodeId]/workbench/components/episode-production-header.tsx", import.meta.url), "utf8");
    const redirectPage = readFileSync(new URL("./[id]/episodes/[episodeId]/workbench/page.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(header, /\/workflow/);
    assert.match(header, /Agent/);
    assert.match(redirectPage, /agentWorkspaceHref/);
});
