import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

test("mounts the existing episode workflow from explicit Agent route ids", () => {
    const workspace = read("./agent-workspace.tsx");
    const workbench = read("../projects/[id]/episodes/[episodeId]/workflow/episode-workflow-workbench.tsx");
    assert.match(workspace, /<EpisodeWorkflowWorkbench episodeId=\{episodeId\} projectId=\{projectId\}/);
    assert.match(workbench, /export function EpisodeWorkflowWorkbench/);
    assert.match(workbench, /episodeId: string; projectId: string/);
    assert.doesNotMatch(workbench, /useParams/);
});

test("keeps route changes inside the Agent URL", () => {
    const hook = read("../projects/[id]/episodes/[episodeId]/workflow/use-workflow-workbench.ts");
    assert.match(hook, /agentWorkspaceHref/);
    assert.doesNotMatch(hook, /window\.location\.pathname/);
});
