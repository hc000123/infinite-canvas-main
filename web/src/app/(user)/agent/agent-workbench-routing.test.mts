import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

test("redirects explicit legacy Agent route ids to the episode workflow", () => {
    const workspace = read("./agent-workspace.tsx");
    const workbench = read("../projects/[id]/episodes/[episodeId]/workflow/episode-workflow-workbench.tsx");
    assert.match(workspace, /router\.replace\(agentEpisodeHref\(selectedEpisode\)\)/);
    assert.doesNotMatch(workspace, /<EpisodeWorkflowWorkbench/);
    assert.match(workbench, /export function EpisodeWorkflowWorkbench/);
    assert.match(workbench, /episodeId: string; projectId: string; returnHref: string; returnLabel: string/);
    assert.doesNotMatch(workbench, /useParams/);
});

test("keeps route changes inside the nested episode Workflow URL", () => {
    const hook = read("../projects/[id]/episodes/[episodeId]/workflow/use-workflow-workbench.ts");
    assert.match(hook, /workflowRouteHref/);
    assert.match(hook, /window\.location\.pathname/);
    assert.doesNotMatch(hook, /agentWorkspaceHref/);
});
