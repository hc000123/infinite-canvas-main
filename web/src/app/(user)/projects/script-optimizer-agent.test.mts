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

    for (const marker of ["AI 剧本母版", "常规剧本正文", "每场生产备注", "视觉方向", "连续性", "风险提示", "隐喻处理", "画面生成禁止项", "母版文档禁止项", "母版质检记录", "不进入视频生成提示", "发言台", "侧边台阶"]) {
        assert.ok(content.includes(marker), `missing marker: ${marker}`);
    }
    assert.match(content, /不是\s*Prompt|不是提示词/);
    assert.match(content, /不是分镜脚本|不写分镜/);
});

test("parses script optimizer json payloads into production script and structured script", () => {
    const result = parseScriptOptimizerResult(
        JSON.stringify({
            productionScript:
                "项目：测试项目\n原始场次：EP01-1\n当前母版场次：EP01-S01\n标题：毕业典礼\n版本号：MASTER_V1.1\n\n【EP01-S01｜教室｜白天｜内】\n剧情正文：发言台前，学生围坐。魏梁站到发言台前，等待掌声落下。\n对白：魏梁：我们毕业了。\n声音：掌声从台下响起。\n转场：周遭的一切再次消散。\n制作备注：\n视觉方向：明亮。\n连续性：魏梁始终站在讲台边缘。\n风险提示：不新增分镜。\n隐喻处理：台词隐喻不生成实物。\n画面生成禁止项：禁止画面内字幕、logo、水印。\n母版文档禁止项：禁止镜头号、焦段、模型参数、分镜提示词。\n【母版质检记录｜不进入视频生成提示】\n质检结论：通过。",
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
                        beats: [{ type: "action", text: "魏梁站到发言台前。" }],
                    },
                ],
            },
        }),
        "第 1 集",
    );

    assert.ok(result.productionScript.includes("制作备注"));
    assert.equal(result.productionScript.includes("讲台边缘"), false);
    assert.equal(result.productionScript.includes("再次消散"), false);
    assert.ok(result.productionScript.includes("发言台边缘"));
    assert.ok(result.productionScript.includes("开始消散"));
    assert.equal(result.structuredScript?.schemaVersion, "episode-script.v1");
    assert.equal(result.structuredScript?.scenes[0]?.location, "教室");
});

test("rejects near-identical script optimizer output", () => {
    const source = "魏梁：我们毕业了。\n同学们鼓掌。";
    assert.equal(isMeaningfullyOptimizedScript(source, source), false);
    assert.equal(
        isMeaningfullyOptimizedScript(
            source,
            "项目：测试项目\n原始场次：EP01-1\n当前母版场次：EP01-S01\n标题：毕业典礼\n\n【EP01-S01｜教室｜白天｜内】\n剧情正文：魏梁站在发言台前，等掌声落下后开口。\n对白：魏梁：我们毕业了。\n声音：同学们鼓掌。\n制作备注：\n视觉方向：明亮。\n连续性：魏梁始终在发言台。\n风险提示：无。\n隐喻处理：无。\n画面生成禁止项：禁止画面内字幕、logo、水印。\n母版文档禁止项：不写镜头号、焦段、模型参数或分镜提示词。\n【母版质检记录｜不进入视频生成提示】\n质检结论：通过。",
        ),
        true,
    );
});

test("requires white paper production notes before accepting optimizer output", () => {
    assert.equal(hasScriptOptimizerWhitePaperProductionNotes("场记：讲台前。\n剧情正文：魏梁讲话。"), false);
    assert.equal(
        hasScriptOptimizerWhitePaperProductionNotes("制作备注：\n视觉方向：明亮。\n连续性：魏梁在发言台。\n风险提示：无。\n隐喻处理：无。\n画面生成禁止项：禁止画面内字幕。\n母版文档禁止项：不写分镜。\n【母版质检记录｜不进入视频生成提示】\n质检结论：通过。"),
        true,
    );
    assert.equal(
        hasScriptOptimizerWhitePaperProductionNotes("制作备注：\n视觉方向：明亮。\n连续性：魏梁在发言台。\n风险提示：原稿跳下主席台已调整。\n隐喻处理：无。\n画面生成禁止项：禁止画面内字幕。\n母版文档禁止项：不写分镜。\n【母版质检记录｜不进入视频生成提示】\n质检结论：通过。"),
        false,
    );
});
