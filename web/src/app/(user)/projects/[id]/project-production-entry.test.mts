import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const board = readFileSync(new URL("./components/project-episode-board.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const selectedPanel = board.slice(board.indexOf("优化后的剧本"), board.indexOf("function ProjectOverviewPanel"));
const desktopList = board.slice(board.indexOf("function ProjectEpisodeTable"), board.indexOf("function ProjectEpisodeMobileCard"));
const mobileList = board.slice(board.indexOf("function ProjectEpisodeMobileCard"), board.indexOf("function EpisodeMobileStat"));

test("project detail keeps episode production in the responsive lists", () => {
    assert.doesNotMatch(selectedPanel, /onOpenEpisode\(selectedEpisode\.id\)/);
    assert.match(desktopList, /onOpenEpisode\(row\.id\)[\s\S]*制作本集/);
    assert.match(mobileList, /onOpenEpisode\(row\.id\)[\s\S]*制作本集/);
    assert.doesNotMatch(board, /项目总控|进入生产总控/);
    assert.doesNotMatch(board, /onOpenAgentWorkspace/);
    assert.doesNotMatch(page, /agentWorkspaceHref|onOpenAgentWorkspace/);
});
