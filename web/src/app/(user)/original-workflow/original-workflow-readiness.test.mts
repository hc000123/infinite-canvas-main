import assert from "node:assert/strict";
import test from "node:test";

import { getCopyOnlySyncState } from "./original-workflow-readiness.ts";
import { parseWorkflowImageReferenceTable } from "./original-workflow-imports.ts";

test("copy-only action exports when stage3 standard output exists", () => {
    const state = getCopyOnlySyncState([
        { exists: true, key: "stage3" },
        { exists: false, key: "copyOnly" },
    ], { state: "passed" });

    assert.equal(state.mode, "export");
    assert.equal(state.disabled, false);
});

test("copy-only action requires fresh stage3 validation before export", () => {
    const files = [
        { exists: true, key: "stage3" },
        { exists: true, key: "copyOnly" },
    ];

    assert.deepEqual(getCopyOnlySyncState(files), {
        disabled: true,
        label: "先校验 Stage 3",
        mode: "needs-stage3-validation",
        notice: "Stage 3 尚未通过质量门，请先校验 Stage 3，再导出或同步视频生产包。",
    });
    assert.match(getCopyOnlySyncState(files, { state: "failed" }).notice, /未通过/);
    assert.match(getCopyOnlySyncState(files, { state: "stale" }).notice, /有更新/);
});

test("copy-only action syncs existing copy-only when stage3 is missing", () => {
    const state = getCopyOnlySyncState([
        { exists: false, key: "stage3" },
        { exists: true, key: "copyOnly" },
    ]);

    assert.equal(state.mode, "sync-existing");
    assert.equal(state.disabled, false);
    assert.match(state.notice, /现有 Copy-only/);
});

test("copy-only action blocks when neither stage3 nor copy-only exists", () => {
    const state = getCopyOnlySyncState([
        { exists: false, key: "stage3" },
        { exists: false, key: "copyOnly" },
    ]);

    assert.equal(state.mode, "blocked");
    assert.equal(state.disabled, true);
    assert.match(state.notice, /Stage 3/);
});

test("parses stage3 image reference table", () => {
    const references = parseWorkflowImageReferenceTable(`
## 素材对应表

| 引用编号 | 素材类型 | 对应素材 | 用途 |
|---|---|---|---|
| @图1 | 人物参考 | 林秀妹 | 锁定外貌 |
| @图10 | 道具参考 | 旧柴油油桶 | 锁定油桶 |

## P01
`);

    assert.deepEqual(references, [
        { name: "林秀妹", ref: "@图1", type: "人物参考", usage: "锁定外貌" },
        { name: "旧柴油油桶", ref: "@图10", type: "道具参考", usage: "锁定油桶" },
    ]);
});
