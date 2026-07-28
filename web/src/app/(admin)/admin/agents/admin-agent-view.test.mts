import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { canManageAgentVersion } from "../../../(user)/projects/[id]/agents/agent-center-utils.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("admin navigation exposes the system Agent center", () => {
    const layout = read("../layout.tsx");
    const page = read("./page.tsx");
    assert.match(layout, /\/admin\/agents/);
    assert.match(layout, /Agent 中心/);
    assert.match(page, /fetchAdminAgents/);
    assert.match(page, /mode="system-admin"/);
});

test("only explicit admin mode can version a system Agent", () => {
    assert.equal(canManageAgentVersion({ mode: "system-admin", ownerType: "system" }), true);
    assert.equal(canManageAgentVersion({ mode: "project", ownerType: "system" }), false);
    assert.equal(canManageAgentVersion({ mode: "project", ownerType: "project" }), true);
});
