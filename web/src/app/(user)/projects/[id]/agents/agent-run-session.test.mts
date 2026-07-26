import assert from "node:assert/strict";
import test from "node:test";

import { agentRunSessionKey, loadAgentRunSession, saveAgentRunSession } from "./agent-run-session.ts";

test("stores the latest Agent Plan per project and Agent", async () => {
    const values = new Map<string, unknown>();
    const storage = {
        getItem: async <T,>(key: string) => (values.get(key) as T | undefined) ?? null,
        setItem: async <T,>(key: string, value: T) => { values.set(key, value); return value; },
    };
    const session = { planId: "plan-1", sourceText: "原始剧本", episodeId: "episode-1", goal: "完成前期制作" };

    assert.equal(agentRunSessionKey("project-1", "agent-1"), "project:project-1:agent:agent-1:recent-plan");
    await saveAgentRunSession(storage, "project-1", "agent-1", session);
    assert.deepEqual(await loadAgentRunSession(storage, "project-1", "agent-1"), session);
    assert.equal(await loadAgentRunSession(storage, "project-1", "agent-2"), null);
});
