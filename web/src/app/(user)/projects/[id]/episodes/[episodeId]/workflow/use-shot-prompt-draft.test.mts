import assert from "node:assert/strict";
import test from "node:test";

import { promptDraftTransition } from "./shot-prompt-draft-transition.ts";

test("confirm persists a dirty prompt before marking it confirmed", () => {
    assert.deepEqual(promptDraftTransition("dirty", "confirm"), ["save", "confirm"]);
    assert.deepEqual(promptDraftTransition("saved", "confirm"), ["confirm"]);
});
