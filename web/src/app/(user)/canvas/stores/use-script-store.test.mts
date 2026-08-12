import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("allows different scenes in one project to share an episode code", () => {
    const store = fs.readFileSync(new URL("./use-script-store.ts", import.meta.url), "utf8");
    const projectPage = fs.readFileSync(new URL("../../projects/[id]/page.tsx", import.meta.url), "utf8");

    assert.equal(store.includes("item.code === episode.code"), false);
    assert.equal(store.includes("episode.code === next.code"), false);
    assert.equal(projectPage.includes("projectEpisodes.some((episode) => episode.code === value)"), false);
});
