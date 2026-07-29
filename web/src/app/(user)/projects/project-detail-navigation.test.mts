import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readProjectFile = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("project detail omits the project-level asset reference tab", () => {
    const board = readProjectFile("./[id]/components/project-episode-board.tsx");
    const page = readProjectFile("./[id]/page.tsx");

    assert.doesNotMatch(board, /label="素材引用"/);
    assert.doesNotMatch(board, /"asset-references"/);
    assert.doesNotMatch(board, /ProjectAssetReferencePanel/);
    assert.doesNotMatch(page, /assetReferenceFilters|filteredAssetReferenceRows/);
});

test("project script entry invokes the selected Skill without an Agent Plan", () => {
    const page = readProjectFile("./[id]/page.tsx");
    const board = readProjectFile("./[id]/components/project-episode-board.tsx");

    assert.match(page, /\n\s+运行剧本 Skill\n/);
    assert.match(page, /preflightScriptInvocation/);
    assert.match(page, /createInvocation/);
    assert.match(board, /aria-label="剧本优化 Skill"/);
    assert.match(board, /剧本 Skill/);
    assert.doesNotMatch(page, /createAgentPlan|Agent Plan|buildScriptSkillOverride/);
});

test("project script optimization writes automatically without a review UI", () => {
    const page = readProjectFile("./[id]/page.tsx");
    const optimizeFlow = page.slice(page.indexOf("const optimizeExistingEpisodeScript"), page.indexOf("const createCanvasAndOpen"));

    assert.match(page, /executeScriptInvocationToReview\(\{ confirmInvocation, getInvocation, reviewInvocation \}/);
    assert.doesNotMatch(page, /confirmExistingEpisodeResult|assertScriptReviewMatches|approveImportDraft/);
    assert.doesNotMatch(page, /批准并写入这版生产剧本/);
    assert.match(optimizeFlow, /updateEpisode\(episode\.id, \{ summary: result\.productionScript/);
    assert.ok(optimizeFlow.indexOf("updateEpisode(episode.id") < optimizeFlow.indexOf("syncVideoWorkflowScript("), "optimized script must be stored before workflow sync");
});

test("project Agent center has an explicit return-to-project action", () => {
    const page = readProjectFile("./[id]/agents/page.tsx");
    assert.match(page, /返回项目/);
    assert.match(page, /`\/projects\/\$\{project\.id\}`/);
});

test("project production navigation exposes Workflow but not the compatibility Agent center", () => {
    const board = readProjectFile("./[id]/components/project-episode-board.tsx");
    const page = readProjectFile("./[id]/page.tsx");
    assert.match(board, /Workflow 中心/);
    assert.doesNotMatch(board, /Agent 中心/);
    assert.doesNotMatch(page, /onOpenAgentSettings|\/agents`/);
});

test("project Workflow center is restricted to administrators", () => {
    const board = readProjectFile("./[id]/components/project-episode-board.tsx");
    const workflowPage = readProjectFile("./[id]/workflows/page.tsx");

    assert.match(board, /const isAdmin = role === "admin" \|\| role === "superadmin"/);
    assert.match(board, /\{isAdmin && \(\s*<button[\s\S]*?Workflow 中心[\s\S]*?<\/button>\s*\)\}/);
    assert.match(workflowPage, /const isAdmin = user\?\.role === "admin" \|\| user\?\.role === "superadmin"/);
    assert.match(workflowPage, /if \(isReady && !isAdmin\) router\.replace\(`\/projects\/\$\{projectId\}`\)/);
    assert.match(workflowPage, /enabled: isAdmin && hydrated && Boolean\(project\)/);
});
