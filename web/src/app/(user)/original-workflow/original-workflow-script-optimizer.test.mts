import assert from "node:assert/strict";
import test from "node:test";

import { buildOriginalWorkflowScriptOptimizerMessages, parseOriginalWorkflowScriptOptimizerResult } from "./original-workflow-script-optimizer.ts";

test("builds original workflow script optimizer messages with v5 handoff context", () => {
    const messages = buildOriginalWorkflowScriptOptimizerMessages({
        episode: "ep01-project-demo",
        projectSlug: "project-demo",
        scriptSnapshot: "魏梁：我们毕业了。",
    });
    const content = messages.map((message) => message.content).join("\n");

    assert.equal(messages[0]?.role, "system");
    assert.equal(messages[1]?.role, "user");
    assert.ok(content.includes("AI 剧本母版"));
    assert.ok(content.includes("Seedance 原格式导演方法 v5"));
    assert.ok(content.includes("每场生产备注"));
    assert.ok(content.includes("制作备注：视觉方向"));
});

test("parses original workflow optimized script result", () => {
    const result = parseOriginalWorkflowScriptOptimizerResult(
        JSON.stringify({
            productionScript: "1-1 / 教室 / 白天 / 内 / 魏梁\n场记：讲台前。\n制作备注：视觉方向：真实明亮；连续性：魏梁在讲台；风险提示：无；禁止项：不写分镜。",
        }),
        "第 1 集",
    );

    assert.ok(result.productionScript.includes("制作备注"));
});
