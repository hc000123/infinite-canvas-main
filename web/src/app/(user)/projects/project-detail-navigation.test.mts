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

    assert.doesNotMatch(page, /\n\s+运行剧本 Skill\n/);
    assert.match(page, /preflightScriptInvocation/);
    assert.match(page, /createInvocation/);
    assert.match(board, /aria-label="剧本优化 Skill"/);
    assert.match(board, /剧本 Skill/);
    assert.doesNotMatch(page, /createAgentPlan|Agent Plan|buildScriptSkillOverride/);
});

test("episode import uses scene wording and has no import-time optimization action", () => {
    const page = readProjectFile("./[id]/page.tsx");
    assert.match(page, /name="title" label="场次"/);
    assert.doesNotMatch(page, /aria-label="导入剧本优化 Skill"/);
    assert.doesNotMatch(page, /optimizeEpisodeImportScript/);
});

test("project script optimization writes automatically without a review UI", () => {
    const page = readProjectFile("./[id]/page.tsx");
    const optimizeFlow = page.slice(page.indexOf("const optimizeExistingEpisodeScript"), page.indexOf("const createCanvasAndOpen"));

    assert.match(page, /executeScriptInvocationToReview\(\{ confirmInvocation, getInvocation, reviewInvocation \}/);
    assert.doesNotMatch(page, /confirmExistingEpisodeResult|assertScriptReviewMatches|approveImportDraft/);
    assert.doesNotMatch(page, /批准并写入这版生产剧本/);
    assert.match(optimizeFlow, /updateEpisode\(episode\.id, \{ summary: result\.productionScript/);
    assert.doesNotMatch(optimizeFlow, /syncVideoWorkflowScript|\/api\/original-workflow/);
});

test("project Agent center has an explicit return-to-project action", () => {
    const page = readProjectFile("./[id]/agents/page.tsx");
    assert.match(page, /返回项目/);
    assert.match(page, /`\/projects\/\$\{project\.id\}`/);
});

test("project production navigation keeps episode production and project cache", () => {
    const board = readProjectFile("./[id]/components/project-episode-board.tsx");
    const page = readProjectFile("./[id]/page.tsx");
    assert.match(board, /制作本集/);
    assert.doesNotMatch(board, /项目总控|进入生产总控|onOpenAgentWorkspace/);
    assert.doesNotMatch(board, />项目 Agent</);
    assert.doesNotMatch(board, /Skill 管理|onOpenSkillManagement/);
    assert.match(board, /查看项目缓存/);
    assert.doesNotMatch(board, /Workflow 中心/);
    assert.doesNotMatch(board, /Agent 中心/);
    assert.doesNotMatch(page, /agentWorkspaceHref|onOpenAgentWorkspace/);
    assert.doesNotMatch(page, /onOpenSkillManagement|\/skills`/);
    assert.doesNotMatch(page, /onOpenAgentSettings|\/agents`|onOpenWorkflowCenter/);
});

test("legacy project Workflow URL redirects to the project Agent", () => {
    const workflowPage = readProjectFile("./[id]/workflows/page.tsx");

    assert.match(workflowPage, /redirect\(agentWorkspaceHref\(\{ projectId \}\)\)/);
    assert.doesNotMatch(workflowPage, /WorkflowRegistryList|WorkflowVersionEditor|WorkflowExecutionConsole/);
});

test("legacy Skill URL redirects to the project detail", () => {
    const skillPage = readProjectFile("./[id]/skills/page.tsx");

    assert.match(skillPage, /redirect\(`\/projects\/\$\{id\}`\)/);
    assert.doesNotMatch(skillPage, /SkillFolderImport|SkillTrialPanel|fetchProjectSkills/);
});
