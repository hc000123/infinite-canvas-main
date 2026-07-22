import assert from "node:assert/strict";
import test from "node:test";

import { IMAGE_GENERATION_TIMEOUT_MS } from "./image-request-policy.ts";

test("allows image generation to finish beyond the generic five minute request limit", () => {
    assert.ok(IMAGE_GENERATION_TIMEOUT_MS >= 10 * 60_000);
});
