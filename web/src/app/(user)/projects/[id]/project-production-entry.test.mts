import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const board = readFileSync(new URL("./components/project-episode-board.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const boardAssembly = board.slice(board.indexOf("export function ProjectEpisodeBoard"), board.indexOf("function ProjectEpisodeProductionPanel"));
const productionPanel = board.slice(board.indexOf("function ProjectEpisodeProductionPanel"), board.indexOf("function ProjectOverviewPanel"));

test("project detail exposes production from the mounted episode panel", () => {
    assert.match(boardAssembly, /<ProjectEpisodeProductionPanel/);
    assert.match(productionPanel, /onOpenEpisode\(selectedEpisode\.id\)[\s\S]*制作本集/);
    assert.doesNotMatch(productionPanel, /<ProjectEpisodeTable|<ProjectEpisodeMobileCard/);
    assert.doesNotMatch(board, /项目总控|进入生产总控/);
    assert.doesNotMatch(board, /onOpenAgentWorkspace/);
    assert.doesNotMatch(page, /agentWorkspaceHref|onOpenAgentWorkspace/);
});
