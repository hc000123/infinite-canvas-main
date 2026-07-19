import assert from "node:assert/strict";
import test from "node:test";

import { userScopedStorageKey } from "./localforage-storage.ts";

test("isolates every persisted browser key by authenticated user", () => {
    assert.equal(userScopedStorageKey("infinite-canvas:canvas_store", "user-a"), "infinite-canvas:canvas_store:user:user-a");
    assert.notEqual(userScopedStorageKey("infinite-canvas:canvas_store", "user-a"), userScopedStorageKey("infinite-canvas:canvas_store", "user-b"));
});
