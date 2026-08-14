import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps video post-processing traces when archiving a canvas node", () => {
    return readFile(new URL("./canvas-assets.ts", import.meta.url), "utf8").then((source) => {
        const videoMetadata = source.match(/if \(node\.type === CanvasNodeType\.Video\)[\s\S]*?if \(node\.type === CanvasNodeType\.Audio\)/)?.[0] || "";
        assert.match(videoMetadata, /videoUpscale:\s*node\.metadata\?\.videoUpscale/);
        assert.match(videoMetadata, /subtitleErase:\s*node\.metadata\?\.subtitleErase/);
    });
});
