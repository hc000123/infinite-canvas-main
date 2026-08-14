import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { agentWorkspaceHref, legacyAgentRedirectHref } from "./agent-workspace-route.ts";
import { videoWorkflowHref } from "../original-workflow/video-workflow-routing.ts";

test("builds an encoded episode workflow route", () => {
    assert.equal(agentWorkspaceHref({ projectId: "p/1", episodeId: "e 1", stage: "video", shot: "s&1" }), "/projects/p%2F1/episodes/e%201/workflow?stage=video&shot=s%261");
});

test("builds a project detail route without an episode", () => {
    assert.equal(agentWorkspaceHref({ projectId: "project-1" }), "/projects/project-1");
});

test("redirects legacy Agent URLs to the closest current workspace", () => {
    assert.equal(legacyAgentRedirectHref({}), "/projects");
    assert.equal(legacyAgentRedirectHref({ projectId: "p/1" }), "/projects/p%2F1");
    assert.equal(legacyAgentRedirectHref({ projectId: "p/1", episodeId: "e 1", stage: "video", shot: "P02" }), "/projects/p%2F1/episodes/e%201/workflow?stage=video&shot=P02");
    assert.equal(legacyAgentRedirectHref({ projectId: "p1", episodeId: "e1", stage: "not-a-stage", shot: "P02" }), "/projects/p1/episodes/e1/workflow?stage=script&shot=P02");
});

test("keeps the Agent page as a redirect-only compatibility route", () => {
    const page = readFileSync(new URL("../agent/page.tsx", import.meta.url), "utf8");
    assert.match(page, /redirect\(legacyAgentRedirectHref\(query\)\)/);
    assert.doesNotMatch(page, /AgentWorkspace|Suspense|Spin/);
});

test("routes the existing project production helper into the episode workflow", () => {
    assert.equal(videoWorkflowHref(1, "project-1", "episode-1"), "/projects/project-1/episodes/episode-1/workflow?stage=script");
});

test("removes direct Workflow links from the episode production entry", () => {
    const header = readFileSync(new URL("./[id]/episodes/[episodeId]/workbench/components/episode-production-header.tsx", import.meta.url), "utf8");
    const redirectPage = readFileSync(new URL("./[id]/episodes/[episodeId]/workbench/page.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(header, /\/workflow/);
    assert.match(header, /agentWorkspaceHref/);
    assert.match(redirectPage, /agentWorkspaceHref/);
});
