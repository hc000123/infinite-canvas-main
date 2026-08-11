import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./video.ts", import.meta.url), "utf8");

test("routes MiniMax video requests through the H3 payload builder", () => {
    assert.match(source, /config\.videoProtocol === "minimax"/);
    assert.match(source, /buildMiniMaxVideoPayload/);
    assert.match(source, /buildMiniMaxVideoRequest/);
    assert.match(source, /miniMaxReferenceURL/);
});
