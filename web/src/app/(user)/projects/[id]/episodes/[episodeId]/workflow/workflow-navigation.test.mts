import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { workflowReturnTarget } from "./workflow-navigation.ts";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const workbench = readFileSync(new URL("./episode-workflow-workbench.tsx", import.meta.url), "utf8");
const header = readFileSync(new URL("./components/workflow-header.tsx", import.meta.url), "utf8");

test("workflow renders one validated return target", () => {
    assert.match(page, /workflowReturnTarget\(projectId, query\)/);
    assert.match(workbench, /returnHref/);
    assert.match(workbench, /returnLabel/);
    assert.match(header, /href=\{props\.returnHref\}/);
    assert.match(header, /aria-label=\{props\.returnLabel\}/);
});

test("workflow accepts only a single same-origin return target", () => {
    assert.deepEqual(workflowReturnTarget("p/1", { returnTo: "/agent?projectId=p1#queue" }), { href: "/agent?projectId=p1#queue", label: "返回生产总控" });
    assert.deepEqual(workflowReturnTarget("p/1", { returnTo: "/\\evil.example" }), { href: "/projects/p%2F1", label: "返回项目" });
    assert.deepEqual(workflowReturnTarget("p/1", { returnTo: "//evil.example" }), { href: "/projects/p%2F1", label: "返回项目" });
    assert.deepEqual(workflowReturnTarget("p/1", { returnTo: ["/agent", "/projects/p1"] }), { href: "/projects/p%2F1", label: "返回项目" });
});

test("workflow derives the return label from the exact target pathname", () => {
    assert.deepEqual(workflowReturnTarget("p1", { returnTo: "/agent", returnLabel: ["伪造", "标签"] }), { href: "/projects/p1", label: "返回项目" });
    assert.deepEqual(workflowReturnTarget("p1", { returnTo: "/agent", returnLabel: "伪造标签" }), { href: "/agent", label: "返回生产总控" });
    assert.deepEqual(workflowReturnTarget("p1", { returnTo: "/agent-tools", returnLabel: "返回生产总控" }), { href: "/agent-tools", label: "返回项目" });
});
