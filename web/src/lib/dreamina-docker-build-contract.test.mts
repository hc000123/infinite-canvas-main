import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dockerfile = readFileSync(new URL("../../../Dockerfile", import.meta.url), "utf8");
const releaseGuide = readFileSync(
    new URL("../../../docs/release/README.md", import.meta.url),
    "utf8",
);

test("production Docker builds verify the pinned Dreamina CLI", () => {
    const dreaminaStage = dockerfile.split("FROM node:22-bookworm-slim AS dreamina-build")[1]?.split("# 运行镜像")[0] || "";
    assert.doesNotMatch(dreaminaStage, /apt-get/);
    assert.match(
        dockerfile,
        /COPY --from=api-build \/etc\/ssl\/certs\/ca-certificates\.crt \/etc\/ssl\/certs\/ca-certificates\.crt/,
    );
    assert.match(dockerfile, /fetch\(process\.argv\[1\]\)/);
    assert.match(dockerfile, /78e49e845b70b17c42015f9214a295564c9bf9048f8a5745429c18566c270ff3/);
    assert.match(dockerfile, /23ffc16a3f3569c7d2985baee843217b73034f0fe649a6dda517b6d95d5beb9c/);
    assert.match(dockerfile, /sha256sum -c -/);
    assert.match(dockerfile, /dreamina version/);
});

test("release smoke tests bypass Docker cache before verifying Dreamina CLI", () => {
    assert.match(
        releaseGuide,
        /docker compose -f docker-compose\.local\.yml --progress=plain build --no-cache/,
    );
});
