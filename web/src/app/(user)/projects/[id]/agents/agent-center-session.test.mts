import assert from "node:assert/strict";
import test from "node:test";

import { agentCenterSessionKey, loadAgentCenterSession, saveAgentCenterSession } from "./agent-center-session.ts";

test("restores the selected Agent and tab per project", async () => {
    const values = new Map<string, unknown>();
    const storage = {
        getItem: async <T>(key: string) => (values.get(key) as T | undefined) ?? null,
        setItem: async <T>(key: string, value: T) => { values.set(key, value); return value; },
    };
    const session = { selectedAgentId: "agent-2", activeTab: "run" as const };

    assert.equal(agentCenterSessionKey("project-1"), "project:project-1:agent-center");
    await saveAgentCenterSession(storage, "project-1", session);
    assert.deepEqual(await loadAgentCenterSession(storage, "project-1"), session);
});
