import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

test("removes Agent from the shared navigation without removing the compatibility route", () => {
    const source = read("../../../constant/navigation-tools.ts");
    const page = read("./page.tsx");
    assert.doesNotMatch(source, /slug: "agent"|生产总控/);
    assert.match(page, /legacyAgentRedirectHref/);
    assert.match(page, /redirect\(/);
});

test("presents the Agent route as production control instead of an Agent definition center", () => {
    const source = read("./agent-workspace.tsx");
    assert.match(source, />生产总控</);
    assert.doesNotMatch(source, />项目 Agent</);
    assert.doesNotMatch(source, /运行中的分集|等待你审核|异常与占位警告/);
});

test("places extraction controls in their own production stages", () => {
    const source = read("../projects/[id]/episodes/[episodeId]/workflow/episode-workflow-workbench.tsx");
    assert.match(source, /routeState\.stage === "asset-extraction"[\s\S]*WorkflowStageExtractionPanel/);
    assert.match(source, /routeState\.stage === "storyboard"[\s\S]*WorkflowStageExtractionPanel/);
    assert.doesNotMatch(source, /routeState\.stage === "script"[\s\S]*WorkflowScriptExtractionPanel/);
});

test("uses a prose storyboard stream, production packages, and a floating runtime console", () => {
    const workbench = read("../projects/[id]/episodes/[episodeId]/workflow/episode-workflow-workbench.tsx");
    const editor = read("../projects/[id]/episodes/[episodeId]/workflow/components/workflow-shot-editor.tsx");
    const scroll = read("../projects/[id]/episodes/[episodeId]/workflow/components/workflow-storyboard-scroll.tsx");
    const console = read("../projects/[id]/episodes/[episodeId]/workflow/components/workflow-run-console.tsx");
    assert.match(workbench, /WorkflowStoryboardScroll/);
    assert.match(workbench, /const showsQueue = workbench\.routeState\.stage === "video"/);
    assert.doesNotMatch(workbench, /批准结构化分镜/);
    assert.match(editor, /镜头生产包/);
    assert.doesNotMatch(editor, /确认分镜/);
    assert.match(scroll, /提示词待生成/);
    assert.doesNotMatch(scroll, /: item\.promptStatus/);
    assert.match(console, /floating/);
    assert.match(console, /fixed bottom-5 right-5/);
});

test("keeps local projects visible while remote progress reports an error", () => {
    const source = read("./agent-workspace.tsx");
    assert.match(source, /buildAgentProjectViews\(\{ projects, episodes, runs, packages \}\)/);
    assert.match(source, /remoteError/);
    assert.match(source, /远程进度暂不可用/);
    assert.doesNotMatch(source, /ensureWorkflowRun/);
});

test("keeps all-project and project drill-down in Agent while redirecting episodes", () => {
    const source = read("./agent-workspace.tsx");
    assert.match(source, /searchParams\.get\("projectId"\)/);
    assert.match(source, /searchParams\.get\("episodeId"\)/);
    assert.match(source, /AgentProjectOverview/);
    assert.match(source, /AgentEpisodeOverview/);
    assert.doesNotMatch(source, /AgentStageGates/);
    assert.match(source, /router\.replace\(agentEpisodeHref\(selectedEpisode,/);
    assert.doesNotMatch(source, /<EpisodeWorkflowWorkbench/);
});

test("keeps Zustand selectors referentially stable", () => {
    const source = read("./agent-workspace.tsx");
    assert.match(source, /const allProjects = useCreativeProjectStore\(\(state\) => state\.projects\)/);
    assert.match(source, /useMemo\(\(\) => allProjects\.filter/);
    assert.doesNotMatch(source, /useCreativeProjectStore\(\(state\) => state\.projects\.filter/);
});

test("merges local production packages into Agent progress", () => {
    const source = read("./agent-workspace.tsx");
    assert.match(source, /useVideoPackageStore\(\(state\) => state\.importedPackages\)/);
    assert.match(source, /buildAgentProjectViews\(\{ projects, episodes, runs, packages \}\)/);
});

test("episode rows link to the exact six-stage gate", () => {
    const source = read("./components/agent-episode-overview.tsx");
    assert.match(source, /agentEpisodeHref\(episode\)/);
    assert.doesNotMatch(source, /currentStageLabel\.includes|\? "assets" : "video"/);
});

test("uses current Ant Design progress and alert props", () => {
    const workspace = read("./agent-workspace.tsx");
    const projects = read("./components/agent-project-overview.tsx");
    const episodes = read("./components/agent-episode-overview.tsx");
    assert.doesNotMatch(workspace, /\bmessage=/);
    assert.doesNotMatch(`${projects}\n${episodes}`, /\btrailColor=/);
    assert.match(`${projects}\n${episodes}`, /\brailColor=/);
});
