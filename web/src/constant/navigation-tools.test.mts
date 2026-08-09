import assert from "node:assert/strict";
import test from "node:test";

import { navigationTools } from "./navigation-tools.ts";

test("keeps video workflow inside projects instead of the global navigation", () => {
    assert.deepEqual(
        navigationTools.map((tool) => tool.slug),
        ["projects", "agent", "canvas", "image", "assets", "cache"],
    );
});
