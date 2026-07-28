import assert from "node:assert/strict";
import test from "node:test";

import { loadScriptSkillSelection, saveScriptSkillSelection, scriptSkillSelectionKey } from "./script-skill-selection-session.ts";

test("stores the exact script Skill version per project episode", async () => {
    const values = new Map<string, unknown>();
    const storage = {
        getItem: async <T,>(key: string) => (values.get(key) as T | undefined) ?? null,
        setItem: async <T,>(key: string, value: T) => { values.set(key, value); return value; },
    };
    assert.equal(scriptSkillSelectionKey("p1", "e1"), "project:p1:episode:e1:script-skill");
    await saveScriptSkillSelection(storage, "p1", "e1", "skill-v2");
    assert.equal(await loadScriptSkillSelection(storage, "p1", "e1"), "skill-v2");
    assert.equal(await loadScriptSkillSelection(storage, "p1", "e2"), null);
});
