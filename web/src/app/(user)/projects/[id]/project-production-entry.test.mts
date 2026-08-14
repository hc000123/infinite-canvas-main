import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const board = readFileSync(new URL("./components/project-episode-board.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("project detail exposes one episode production entry", () => {
    assert.match(board, /制作本集/);
    assert.doesNotMatch(board, /项目总控|进入生产总控/);
    assert.doesNotMatch(board, /onOpenAgentWorkspace/);
    assert.doesNotMatch(page, /agentWorkspaceHref|onOpenAgentWorkspace/);
});
