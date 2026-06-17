import assert from "node:assert/strict";
import test from "node:test";

import { buildScriptBatchPlan, buildStage1PartPromptTexts, buildStage2Instruction, buildStage2PartPromptTexts, buildStage3PartPromptTexts, episodeAssetPrefix } from "./stage-prompts.ts";

const graduationScript = `ep50-2、毕业典礼 日 外
操场上，毕业生们穿着毕业装站在下方，台上的特教授穿着博士袍，在话筒前开口。

特教授：
下面，有请优秀毕业生代表，全校成绩第一的魏梁同学上台做毕业感言。

魏梁穿着学士袍走上讲台，台下的周泽、姚澈都在看着她。而远端，则坐着已经毕业的蒋文阔和姚渊。魏梁深吸了一口气。

魏梁：
当我初次来到清北大学时，我不知道我的未来会是什么样子。
有对美好生活的无限希望，也有对平庸，一眼望到头的人生的恐惧。
人生的意义究竟是什么，人生的目的究竟是什么。我们是应该追求一粥一饭，还是应该丢下便士，仰望星空？
再后来，我遇到了同窗，老师。那时候，我才拓展了生命的维度。不再只是小家庭，我与更多的人有了链接，不再是单一的价值观，而是不同视角的碰撞。我明白，在学校的每一天，都让我的未来有无限可能。
再之后，我有了爱情。

台下的人们开始窃窃私语，特教授咳嗽了一声。姚澈看着魏梁露出微笑。

姚澈：
全体毕业生，起立！`;

test("script batch plan splits a single long scene into beat batches", () => {
    const batches = buildScriptBatchPlan(graduationScript, "ep50-2", 320);
    const sentenceBatches = buildScriptBatchPlan(
        "ep50-2、毕业典礼 日 外\n\n魏梁：\n第一句推动毕业回忆。第二句转入未来恐惧。第三句转向同窗老师。第四句落到爱情证明。",
        "ep50-2",
        28,
    );
    const shotBatches = buildScriptBatchPlan("P01 大分镜\n魏梁走上讲台。\n\nP02 大分镜\n毕业生起立致敬。", "ep50-2", 900);

    assert.ok(batches.length > 1);
    assert.ok(sentenceBatches.length > 1);
    assert.equal(shotBatches.length, 2);
    assert.match(shotBatches[0].label, /P01/);
    assert.ok(batches.every((batch) => batch.batchId.includes("ep50-2")));
    assert.match(batches.map((batch) => batch.label).join("\n"), /批次/);
});

test("stage1 part prompts constrain examples and cross-episode pollution", () => {
    const prompts = buildStage1PartPromptTexts("/workflow-root", "ep07-project-demo", "project-demo", graduationScript);
    const allText = prompts.map((item) => item.text).join("\n\n");

    assert.match(prompts[0].label, /^stage1-batch-/);
    assert.equal(prompts.at(-1)?.label, "stage1-merge");
    assert.match(allText, /只允许使用当前集数 ep07-project-demo/);
    assert.match(allText, /禁止输出 ep05、ep06、5-1、6-1/);
    assert.match(allText, /样例只允许读取标题结构和字段名/);
    assert.match(allText, /不要读取或复制 ep05 \/ ep06 的剧情正文/);
    assert.match(allText, /按场次 \/ Beat 批次生成局部导演碎片/);
    assert.match(allText, /outputs\/ep07-project-demo\/\.scene-batches\/stage1/);
    assert.match(allText, /01D.*待确认.*不是.*阻断条件/s);
});

test("stage2 instruction rewrites current project assets without root asset pollution", () => {
    const instruction = buildStage2Instruction("ep07-project-demo", "project-demo");

    assert.equal(episodeAssetPrefix("ep07-project-demo"), "ep07");
    assert.match(instruction, /当前集：ep07-project-demo/);
    assert.match(instruction, /projects\/project-demo\/script\/ep07-project-demo\.md/);
    assert.match(instruction, /不得要求先生成独立导演分析阶段/);
    assert.match(instruction, /服化道阶段内置导演方法/);
    assert.match(instruction, /只允许覆盖写入 projects\/project-demo\/assets\/character-prompts\.md、projects\/project-demo\/assets\/scene-prompts\.md 与 projects\/project-demo\/assets\/prop-prompts\.md/);
    assert.match(instruction, /禁止读取、复制、合并或续写根目录 assets\/character-prompts\.md、assets\/scene-prompts\.md、assets\/prop-prompts\.md/);
    assert.match(instruction, /素材 ID 和章节必须使用当前集前缀 ep07/);
    assert.match(instruction, /不得包含非当前集的 ep05、ep06、5-1、6-1/);
    assert.match(instruction, /场景提示词必须是纯环境\/空间规划/);
});

test("stage2 part prompts split costume assets into parallel contracts", () => {
    const prompts = buildStage2PartPromptTexts("/workflow-root", "ep50-2", "project-demo", graduationScript);
    const allText = prompts.map((item) => item.text).join("\n\n");

    assert.deepEqual(
        prompts.map((item) => item.label),
        ["stage2-character-assets", "stage2-scene-assets", "stage2-prop-assets"],
    );
    assert.match(allText, /并行资产任务/);
    assert.match(allText, /character-prompts\.md/);
    assert.match(allText, /scene-prompts\.md/);
    assert.match(allText, /prop-prompts\.md/);
    assert.match(allText, /每个任务只写自己的目标文件/);
});

test("stage3 part prompts submit copy-only batches before final visible output", () => {
    const prompts = buildStage3PartPromptTexts("/workflow-root", "ep50-2", "project-demo", graduationScript);
    const allText = prompts.map((item) => item.text).join("\n\n");

    assert.match(prompts[0].label, /^stage3-batch-/);
    assert.equal(prompts.at(-1)?.label, "stage3-merge");
    assert.match(allText, /Copy-only 阶段内部可完成 Beat/);
    assert.match(allText, /文件交付只保留可复制 Seedance 提示词正文/);
    assert.match(allText, /按场次 \/ Beat \/ P 段逐批生成 Copy-only 碎片/);
    assert.match(allText, /outputs\/ep50-2\/\.scene-batches\/stage3/);
    assert.match(allText, /每个标题下只放一个 ```text 代码块/);
    assert.match(allText, /不要写规范读取记录、参考图映射表、剧情分析、大分镜表、情绪锚点、6 字段分镜、跨段衔接卡、自检报告/);
    assert.match(allText, /台词超载时拆连续 P/);
    assert.match(allText, /02-seedance-copy-only\.md/);
    assert.doesNotMatch(allText, /export_copy_only\.py --episode ep50-2/);
});

test("stage3 part prompts switch storyboard skill package by preset id", () => {
    const prompts = buildStage3PartPromptTexts("/workflow-root", "ep50-2", "project-demo", graduationScript, "seedance-mx-shell-emotion-director-v2-1");
    const allText = prompts.map((item) => item.text).join("\n\n");

    assert.match(allText, /情绪导演 \+ 清道夫分镜包 v2\.1/);
    assert.match(allText, /Mx-Shell_Prompts_v1\.5\.md/);
    assert.match(allText, /情绪导演_Skill_V2\.1\.md/);
    assert.match(allText, /按秒时间轴/);
});
