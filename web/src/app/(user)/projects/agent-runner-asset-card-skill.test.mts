import assert from "node:assert/strict";
import test from "node:test";

import { normalizeWorkflowAssetCard } from "./agent-runner-asset-card-skill.ts";

test("keeps character cards as characters when usage mentions a scene", () => {
    const card = normalizeWorkflowAssetCard(
        {
            description: "女主前世的爱人，身形相对强健但带有受虐后的虚弱感。",
            kind: "scene",
            name: "刘铮",
            prompt: "positive: Cinematic Character Design Sheet, FRONT VIEW / SIDE VIEW / BACK VIEW.",
            usage: "用于闪回与海底场景中受害与濒死状态的基准图。",
        },
        0,
    );

    assert.equal(card.kind, "character");
    assert.equal(card.typeLabel, "角色");
});

test("keeps scene planning cards as scenes when usage mentions protagonists", () => {
    const card = normalizeWorkflowAssetCard(
        {
            description: "昏暗、布满灰尘的废弃旧仓库，顶部挂着昏黄的灯泡，阴影深重。",
            kind: "scene",
            name: "废旧仓库",
            prompt: "16:9 2x2 grid four-panel scene planning reference sheet. Top-left: Top-down layout view of an abandoned warehouse. NO humans, NO characters, NO faces, NO clothing.",
            usage: "作为女主回忆中的创伤地点，展示男主遇害的发生地。",
        },
        1,
    );

    assert.equal(card.kind, "scene");
    assert.equal(card.typeLabel, "场景/场记");
});

test("does not treat prop prompts that forbid clothing as costume cards", () => {
    const card = normalizeWorkflowAssetCard(
        {
            description: "1960年代乡村风格的传统红色木制婚轿，外观简陋，红色布帘稍显粗糙陈旧。",
            kind: "prop",
            name: "木制婚轿",
            prompt: "A single prop design sheet, pure white background. Traditional rural Chinese red wooden bridal sedan chair. No text, no modern elements, no human elements, NO clothing.",
            usage: "承载女主重生觉醒核心戏份的互动道具兼微型空间。",
        },
        2,
    );

    assert.equal(card.kind, "prop");
    assert.equal(card.typeLabel, "道具");
});
