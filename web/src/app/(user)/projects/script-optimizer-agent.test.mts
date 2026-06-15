import assert from "node:assert/strict";
import test from "node:test";

import {
    SCRIPT_OPTIMIZER_PRODUCTION_RULES,
    SCRIPT_OPTIMIZER_STRUCTURED_JSON_RULES,
    SCRIPT_TO_AI_SCRIPT_WHITE_PAPER_RULES,
    hasScriptOptimizerWhitePaperProductionNotes,
    isMeaningfullyOptimizedScript,
    parseScriptOptimizerResult,
} from "./script-optimizer-agent.ts";

test("white paper rules keep ai-script mother-version constraints visible", () => {
    const content = [SCRIPT_TO_AI_SCRIPT_WHITE_PAPER_RULES, SCRIPT_OPTIMIZER_PRODUCTION_RULES, SCRIPT_OPTIMIZER_STRUCTURED_JSON_RULES].join("\n");

    for (const marker of ["AI 剧本母版", "常规剧本正文", "每场生产备注", "视觉方向", "连续性", "风险提示", "禁止项", "下游派生规则"]) {
        assert.ok(content.includes(marker), `missing marker: ${marker}`);
    }
    assert.match(content, /不是\s*Prompt|不是提示词/);
    assert.match(content, /不是分镜脚本|不写分镜/);
});

test("parses script optimizer json payloads into production script and structured script", () => {
    const result = parseScriptOptimizerResult(
        JSON.stringify({
            productionScript: "# 第 1 集\n\n1-1 / 教室 / 白天 / 内 / 魏梁\n场记：讲台前，学生围坐。\n制作备注：视觉方向：明亮；连续性：魏梁站在讲台；风险提示：无；禁止项：不写分镜。",
            structuredScript: {
                episodeTitle: "第 1 集",
                summary: "毕业典礼。",
                scenes: [
                    {
                        sceneId: "1-1",
                        location: "教室",
                        timeOfDay: "白天",
                        space: "内",
                        characters: ["魏梁"],
                        sceneNote: "毕业典礼现场。",
                        beats: [{ type: "action", text: "魏梁站到讲台前。" }],
                    },
                ],
            },
        }),
        "第 1 集",
    );

    assert.ok(result.productionScript.includes("制作备注"));
    assert.equal(result.structuredScript?.schemaVersion, "episode-script.v1");
    assert.equal(result.structuredScript?.scenes[0]?.location, "教室");
});

test("rejects near-identical script optimizer output", () => {
    const source = "魏梁：我们毕业了。\n同学们鼓掌。";
    assert.equal(isMeaningfullyOptimizedScript(source, source), false);
    assert.equal(isMeaningfullyOptimizedScript(source, "场次编号 / 教室 / 白天 / 内 / 出场人物：魏梁\n场记：魏梁站在讲台前。\n动作视觉：魏梁深吸一口气，同学们鼓掌。\n对白：魏梁：我们毕业了。\n制作备注：视觉方向：明亮；连续性：魏梁始终在讲台；风险提示：无；禁止项：不写分镜。"), true);
});

test("requires white paper production notes before accepting optimizer output", () => {
    assert.equal(hasScriptOptimizerWhitePaperProductionNotes("场记：讲台前。\n动作视觉：魏梁讲话。"), false);
    assert.equal(hasScriptOptimizerWhitePaperProductionNotes("制作备注：视觉方向：明亮；连续性：魏梁在讲台；风险提示：无；禁止项：不写分镜。"), true);
});
