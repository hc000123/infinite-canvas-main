import assert from "node:assert/strict";
import test from "node:test";

import { agentWorkspaceHref } from "./agent-workspace-route.ts";

test("builds an encoded Agent workspace route", () => {
    assert.equal(agentWorkspaceHref({ projectId: "p/1", episodeId: "e 1", stage: "assets", shot: "s&1" }), "/agent?projectId=p%2F1&episodeId=e+1&stage=assets&shot=s%261");
});

test("builds a project-level Agent route without empty values", () => {
    assert.equal(agentWorkspaceHref({ projectId: "project-1" }), "/agent?projectId=project-1");
});
