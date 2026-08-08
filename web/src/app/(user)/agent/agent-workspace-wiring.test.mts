import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

test("places Agent between projects and canvas in the shared navigation", () => {
    const source = read("../../../constant/navigation-tools.ts");
    const projects = source.indexOf('slug: "projects"');
    const agent = source.indexOf('slug: "agent"');
    const canvas = source.indexOf('slug: "canvas"');
    assert.ok(projects >= 0 && projects < agent && agent < canvas);
});

test("keeps local projects visible while remote progress reports an error", () => {
    const source = read("./agent-workspace.tsx");
    assert.match(source, /buildAgentProjectViews\(\{ projects, episodes, runs \}\)/);
    assert.match(source, /remoteError/);
    assert.match(source, /远程进度暂不可用/);
    assert.doesNotMatch(source, /ensureWorkflowRun/);
});

test("supports all-project, project, and episode drill-down in one Agent route", () => {
    const source = read("./agent-workspace.tsx");
    assert.match(source, /searchParams\.get\("projectId"\)/);
    assert.match(source, /searchParams\.get\("episodeId"\)/);
    assert.match(source, /AgentProjectOverview/);
    assert.match(source, /AgentEpisodeOverview/);
    assert.match(source, /AgentStageGates/);
});

test("keeps Zustand selectors referentially stable", () => {
    const source = read("./agent-workspace.tsx");
    assert.match(source, /const allProjects = useCreativeProjectStore\(\(state\) => state\.projects\)/);
    assert.match(source, /useMemo\(\(\) => allProjects\.filter/);
    assert.doesNotMatch(source, /useCreativeProjectStore\(\(state\) => state\.projects\.filter/);
});

test("uses current Ant Design progress and alert props", () => {
    const workspace = read("./agent-workspace.tsx");
    const projects = read("./components/agent-project-overview.tsx");
    const episodes = read("./components/agent-episode-overview.tsx");
    assert.doesNotMatch(workspace, /\bmessage=/);
    assert.doesNotMatch(`${projects}\n${episodes}`, /\btrailColor=/);
    assert.match(`${projects}\n${episodes}`, /\brailColor=/);
});
