import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dockerfile = readFileSync(new URL("../../../Dockerfile", import.meta.url), "utf8");
const releaseGuide = readFileSync(
    new URL("../../../docs/release/README.md", import.meta.url),
    "utf8",
);

test("production Docker builds verify the pinned Dreamina CLI", () => {
    assert.match(dockerfile, /sha256sum -c -/);
    assert.match(dockerfile, /dreamina version/);
});

test("release smoke tests bypass Docker cache before verifying Dreamina CLI", () => {
    assert.match(
        releaseGuide,
        /docker compose -f docker-compose\.local\.yml --progress=plain build --no-cache/,
    );
});
