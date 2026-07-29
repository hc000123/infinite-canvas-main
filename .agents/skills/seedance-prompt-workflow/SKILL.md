---
name: seedance-prompt-workflow
description: Use when converting short-drama scripts, storyboards, oral narration, or revision feedback into staged Seedance video-generation deliverables, especially when the task needs scene parsing, knowledge routing, asset locking, shot splitting, 15-second package planning, prompt generation, QC, or template validation.
---

# Seedance Prompt Workflow

## Overview

Use this skill to run an AI short-drama Seedance prompt workflow from raw script or storyboard input to audited, copyable prompt files. The workflow is strict: understand the scene first, route knowledge second, land knowledge into fields third, split shots fourth, audit before packaging, then generate prompts and validation reports.

## First Moves

1. Identify project name, episode, scene number, and scene short name. If any of these block file naming or continuity, ask only that missing question.
2. If a repository with `workflow/`, `templates/`, `knowledge/`, and `outputs/` exists, read `workflow/README.md` first. Then read only the stage file, routing file, checklist, template, or latest run needed for the task.
3. If continuing an existing scene, check `outputs/{项目名}/EPxx/SCxx_{场景名}/handoff.md` first when present. Then read the latest `RUN_*` `README.md` and only relevant files.
4. Always create a new run: `outputs/{项目名}/EPxx/SCxx_{场景名}/RUN_YYYYMMDD-NNN/`. Never overwrite an older run unless the user explicitly orders it.
5. Keep user hard requirements intact: fixed camera, shot size, high/low angle, character action, original dialogue, punctuation, uploaded references, and explicit do-not-change instructions.

Treat a user-written `△` as a priority marker, not as a shot number and not as an automatic cut point. Split shots by action continuity, camera/shot-size change, dialogue integrity, emotional beat, character blocking, spatial handoff, Seedance duration, and generation risk.

## Workflow Order

Run stages in this order. The historical filenames are part of the contract.

| Stage | Output | Purpose |
| --- | --- | --- |
| `00B` | `00B_素材与合规检查表.csv` | Register input type, references, fixed user requirements, missing assets, face/reference risks. |
| `01` | `01_剧本解析表.csv` | Parse one scene per row; define plot purpose, emotion, information points, reaction needs, shot-frequency direction. Do not generate prompts. |
| `00` | `00_知识调用清单.csv` | Select fixed-base, dynamic-trigger, and QC knowledge cards from the parsed scene. |
| `00C` | `00C_知识落地映射表.csv` | Convert selected knowledge into field-level execution fragments, forbidden items, and acceptance points. |
| `01A` | `01A_项目视觉总设定表.csv` | Lock project-level visual DNA: style core, camera system, lens family, palette, contrast, light ratio, film texture. |
| `01B` | `01B_场次风格锁定表.csv` | Lock scene-level atmosphere, light motivation, local contrast, material focus, and inherited visual ID. |
| `01C` | `01C_资产固定清单.csv` | Turn characters, locations, props, special states, first/last frames into stable `@` asset placeholders. |
| `02` | `02_自动拆镜头表.csv` | Split into camera-readable shots with task label, technique, duration basis, opening frame, movement, landing frame, action, prop/environment feedback, dialogue embedding. |
| `02A` | `02A_镜头技法审计表.csv` | Mandatory audit for bland shot design, overused eye-level/35-50mm, averaged duration, foreground and movement conflicts. |
| `02B` | `02B_生成包规划表.csv` | Group passed shots into <=15s Performance Blocks with state, main action, edit points, handoff frame, prompt group ID. |
| `03` | `03_Seedance提示词表.csv`, `03_prompts/` | Generate index CSV and copyable Seedance prompt bodies. |
| `04` | `04_质检修订表.csv` | Record prompt risks, fixes, final status, and source of problems. |
| `05` | `05_模板验证报告.csv` | Validate field consistency, prompt structure, ID links, old-column residue, and rule drift. |

Never skip `02A`. If `02A` has `不通过` or `需复核`, revise `02_自动拆镜头表.csv` and regenerate `02A` before creating `02B` or `03`.

## Knowledge Routing

Use a three-layer routing model:

- `固定底座`: stage baseline knowledge that actually enters this scene's fields.
- `动态触发`: knowledge triggered by `01.知识触发提示`, hard user requirements, emotional changes, action difficulty, multi-character blocking, prop state changes, material gaps, or reference limitations.
- `质检验收`: knowledge used by `04` or `05` to catch recurring structure, prompt pollution, asset, lighting, or template issues.

Routing rules:

1. `01` uses only script-parsing knowledge and may reference plot-attribute logic. It must not pre-write camera, lighting, prompt-shell, or asset-reference details.
2. `00` happens after `01`. Every selected knowledge row must include trigger signal, use stage, reason, landing requirement, acceptance entry, and forbidden risk.
3. `00C` must map every selected knowledge card to real fields such as `01B.场次光线动机`, official `02` shot fields, `02B.HANDOFF_FRAME`, `03.【画面内容】`, or `03.【全程执行要求】`.
4. Cinematography knowledge lands in `02` first, then becomes natural language in `03`. Do not introduce camera logic for the first time in final prompts.
5. If a problem is recurring, update the knowledge registry/routing/checklist before fixing the current prompt.

When the repository exists, use:

- Stage routing: `knowledge/routing/by-stage.md`
- Repair routing: `knowledge/routing/by-problem.md`
- Knowledge registry: `knowledge/registry.md`
- Prompt QC: `knowledge/checklists/seedance-qc.md`
- Template QC: `knowledge/checklists/template-qc.md`

## Output Schemas

Use these headers exactly when creating CSVs:

```csv
00B_素材与合规检查表.csv: 素材编号,输入形态,素材类型,素材用途,对应角色/场景/道具,来源说明,是否用户分镜,是否含固定机位/景别/运镜,是否含对白/旁白/画外音/内心独白,是否含△重点标记,是否首帧,是否尾帧,是否角色形象参考,是否场景参考,是否动作/运镜参考,外部参考素材状态,需后续补写信息,Seedance数量风险,真人脸部素材风险,缺失或占位,使用阶段,处理建议
01_剧本解析表.csv: 场次序号,场次,场次边界,原文片段,出场人物,人物关系,地点,时间,入场状态,场内剧情推进,出场变化,与上一场承接,与下一场钩子,剧情目的,主情节属性,副情节属性,主情绪,信息落点,推荐镜头链,反应镜头需求,冲突点,情绪变化,情绪强度,节奏缓急,缓急变化,镜头频率建议,关键对白,关键动作,转折/悬念,参考素材建议,知识触发提示
00_知识调用清单.csv: 场次,调用类型,剧情需求/触发信号,推荐知识档案,使用阶段,使用原因,落地要求,验收入口,禁用风险
00C_知识落地映射表.csv: 场次,知识卡,触发依据,绑定阶段,绑定镜头/包,必须落地字段,执行片段,禁止项,验收点,落地状态
01A_项目视觉总设定表.csv: 项目ID,项目名,项目视觉ID,视觉模板来源,适用范围,风格核心,主风格标签,情绪关键词,摄影系统,画幅与格式,底片/胶片模拟,镜头组,基础焦段策略,景深原则,全局色彩方案编号,全局色彩方案结果,色彩与影调,主色调,对比度,饱和度,基础光比,光源类型,明暗处理方式,胶片质感/颗粒,全局画质关键词,全局负面约束,可变项边界,调用资料,备注
01B_场次风格锁定表.csv: 场次序号,场次,风格锁定ID,项目视觉ID,场次边界,场景,剧情氛围,情绪强度,节奏缓急,场次视觉任务,场次光线动机,场次光源实体与方向,场次光影层级调整,场次色彩/明暗变化,场次材质与空间重点,场次镜头倾向,场次风格锁定提示词,继承全局视觉项,场次可变项,调用来源
01C_资产固定清单.csv: 资产ID,@引用名,资产类型,归属层级,适用场次/包,资产名称,固定内容,外观/材质/状态,需要制作的资产形式,Seedance用途,是否必须先制作,可复用范围,禁止变化,备注
02_自动拆镜头表.csv: 镜头ID,场次,风格锁定ID,主情节属性,副情节属性,人物关系,信息落点,推荐镜头链,镜头功能,镜头任务标签,镜头技法,时长,时长设计依据,画幅,人物,场景,景别,起幅构图,镜头运动,落幅,动作表演,角色动作,道具交互,环境反应,对白,声音对白嵌入,情绪,节奏,镜头频率依据,防AI运镜要点,承接关系,备注
02A_镜头技法审计表.csv: 检查项,规则阈值,结论,证据,问题镜头ID,返修动作,状态
02B_生成包规划表.csv: F包编号,Performance_Block_ID,对应提示词组ID,场次,包含镜头ID,镜头任务标签序列,组合时长,拆包理由,生成模式,画面模板,镜头频率策略,起始参考帧,Spatial_State_From,Spatial_State_To,START_STATE,MAIN_ACTION,PERFORMANCE_BEAT,END_STATE,EDIT_POINTS,本包场景内容描述,画面内容骨架,HANDOFF_FRAME,人物站位,人物视线,道具状态,环境反应,镜头运动,声音对白嵌入,参考素材,禁止变化,连续性风险,验收标准,重生成策略
03_Seedance提示词表.csv: 提示词组ID,场次,项目视觉ID,风格锁定ID,色彩方案编号,包含镜头ID,组合时长,生成模式,画面模板,参考素材,提示词文件,画幅,复制状态
04_质检修订表.csv: 提示词组ID,模板结构完整性,组合时长合规性,风格继承一致性,人物一致性,动作复杂度,对白长度,镜头清晰度,素材引用完整性,Seedance风险,问题,修改建议,最终状态
05_模板验证报告.csv: 检查项,结论,证据,处理建议
```

## Stage Rules

### `00B` Materials And Compliance

Classify input as script, storyboard, oral narration, reference image/video/audio, first frame, last frame, action reference, or style reference. If no external reference exists, write `外部参考素材状态=无外部参考` and require physical details later. Do not pretend an absent image/video/audio has been inspected. Record face-reference risk when real faces are involved.

### `01` Script Parse

One row equals one scene. Parse boundaries, entrance state, in-scene progression, exit change, previous/next handoff, plot purpose, main/sub plot attributes, emotion, relationship, information point, recommended shot chain, reaction-shot needs, rhythm, and knowledge triggers. Do not output video prompts or concrete shot IDs in this stage.

### `01A` Project Visual Lock

Lock global visual constants before scene-level style and prompts. `风格核心` is main style tag plus emotion keywords, not plot summary. Camera system, film simulation, lens family, palette, light ratio, and texture are fixed and must not randomly change in later scenes.

For sweet-romance, modern intimacy, mermaid-romance, light relationship comedy, or dream-romance projects, default to `PRESET-SWEET-ROMANCE-REAL` or the matching sweet-romance visual preset unless the user says otherwise.

### `01B` Scene Style Lock

Write one row per scene. Inherit `01A`; do not rebuild global camera, palette, or film texture. Only define scene atmosphere, light motivation, visible light entities and direction, local light/shadow adjustment, material/spatial focus, scene variable items, and `风格锁定ID`.

### `01C` Asset Lock

Before formal prompts, lock every needed character, setting, core prop, and special state into `@角色/@场景/@道具/@状态` placeholders. If the user supplied only script/storyboard text, still create asset placeholders. `03_prompts/` must not proceed without `01C`.

Asset rows describe fixed identity, appearance/material/state, production form, Seedance use, reusability, and forbidden drift. Do not put plot action, blocking, lighting mood, or camera tasks in asset rows.

### `02` Shot Split

Each shot has exactly one core visual task. Inherit `01` plot attributes and `01B` style ID. Convert literary emotion into visible body, face, prop, light, space, sound, or environmental feedback.

Camera fields must be separated:

- `镜头技法`: function + emotion + viewing strategy, such as `爆发+惊变=短促甩镜落稳`.
- `景别`: shot size/focal strategy/angle, chosen by function.
- `起幅构图`: first frame only: camera position, direction, first visible subject/foreground/prop, subject placement, visual weight, negative space.
- `镜头运动`: one camera or focus movement only, with path and motivation. Do not include character action, dialogue, VO/OS, or plot result.
- `落幅`: final frame, focus, prop/expression state, and next-shot handoff.
- `防AI运镜要点`: the most likely motion failure, such as `只慢推不环绕`.

Use relative camera descriptions, not exact measurements: write `略低于肩膀`, `近到可看清表情`, `电梯门外朝内`, not `120厘米`, `2米`, or `35度`.

### `02A` Shot Technique Audit

Audit before packaging. Must check field completeness, eye-level overuse, 35/50mm concentration, shot-size purpose, average duration, function/emotion/technique matching, foreground-space conflicts, movement conflicts, camera path readability, and relative-camera wording.

Suggested command when available:

```bash
python3 tools/validate_02_shot_technique.py outputs/{项目名}/EPxx/SCxx_{场景名}/RUN_YYYYMMDD-NNN/02_自动拆镜头表.csv
```

### `02B` Package Planning

Group passed shots into Performance Blocks of no more than 15 seconds. A block has one `MAIN_ACTION`, stable subject list, clear `START_STATE`, `PERFORMANCE_BEAT`, `END_STATE`, `EDIT_POINTS`, `HANDOFF_FRAME`, package scene description, and image-content skeleton.

Force split evaluation when a new character first appears, a key prop becomes the main action object, a corpse/prop changes from static to active, light state jumps, a new entrance opens, main sightline changes, or the scene moves from inspection/dialogue into explosive action.

`生成模式` must be exactly `一镜到底` or `多机位分镜`. Default short-drama scenes to `多机位分镜`; use `一镜到底` only when requested or when continuous action is more stable. Even one-take mode needs second-level key nodes.

Set `画面模板` to `官方模版01` for every package and mirror the value in the 03 index. Historical values `黄驰模版01` and `画面模版1` are permanently blocked.

### `03` Seedance Prompts

The CSV is an index. The executable prompt body goes in `03_prompts/{提示词组ID}.txt` and must be directly copyable into Seedance.

Use the official six-section shell in every prompt, after the global hard constraint:

```text
【基础设定】
【本包画面状态】
【色彩方案编号】
【画面风格】
【画面内容】
【全程执行要求】
```

Rules for the six sections:

- 【基础设定】 starts with the package duration, then lists only current-package scene, character, and core-prop assets. External images use real `@图片N`; special states belong in the package state or shot text.
- 【本包画面状态】 states the visible package-start posture, in-frame spatial relationship, prop state, accumulated injuries, and established light. Describe only what can appear in the frame.
- 【色彩方案编号】 gives the color ID plus an active grading plan covering film response, color temperature, contrast, saturation, black level, highlight rolloff, shadow bias, and skin-tone protection. Do not use HEX ratios as the final grading plan.
- 【画面风格】 contains exactly `画质`, `风格`, `色彩与影调`, `光线与画面层次`, `皮肤质感`, and `材质表现` in that order.
- 【画面内容】 uses `镜头N：` natural-language paragraphs. Each paragraph includes camera direction, visible action/expression, in-frame position or change, synchronous audio/dialogue, and the end state. Do not output per-shot time ranges or four-field subheadings.
- Camera wording uses subject-relative side plus degrees, focal length, shot size, height, and movement. Do not repeat inferred screen direction or describe off-screen people, off-screen sightline targets, or off-screen spatial relationships.
- Shot size limits spatial layers: close-up/close shot uses only the subject plane and at most one local foreground; medium shot uses one supporting plane; explicit background geography is reserved for medium-full, full, or wider shots.
- 【全程执行要求】 contains package-specific continuity, identity, action, sound, and generation-stability requirements. Keep positive execution results primary and avoid unrelated negative-keyword lists.

The final prompt must not contain knowledge-card names, internal method labels, QC conclusions, diagnostic notes, revision traces, emotional-anchor IDs, beat IDs, `本P`, `单P`, `生成P`, `下一P`, `P ID`, or table-field labels such as `起幅构图：`, `镜头运动：`, `落幅：`, `角色动作：`, `道具交互：`, `环境反应：`, `对白/旁白：`.

### `04` QC Revision

Locate the source before fixing: knowledge gap, template gap, knowledge not landed, material limitation, action complexity, or one-off generation variance. Record issue, suggested change, and final status. If the issue originates upstream, return to `01`, `00C`, `02`, or `02B`; do not patch only the final prompt.

### `05` Template Validation

Validate that templates, stage outputs, IDs, and prompt bodies agree. Ensure `02A` exists and passed, `01C` exists, `03` index maps to prompt files, `02/02B/03` shot/package IDs match, seven-section prompt structure exists, and no old columns or old shell structures remain.

Suggested commands when available:

```bash
python3 tools/validate_03_prompt_structure.py outputs/{项目名}/EPxx/SCxx_{场景名}/RUN_YYYYMMDD-NNN
python3 tools/audit_workflow_consistency.py outputs/{项目名}/EPxx/SCxx_{场景名}/RUN_YYYYMMDD-NNN
```

## Hard Checks Before Delivery

- `镜头ID`, `F包编号`/`Performance_Block_ID`, `提示词组ID`, `包含镜头ID`, and prompt filenames correspond.
- Each package duration is no more than 15 seconds.
- `02A` has passed before `02B`, `03`, `04`, and `05`.
- `01A` project visual settings and `01B` scene style are inherited in `03`; the prompt does not invent a new camera system or palette.
- `01C` assets are referenced by `03_prompts/` and every referenced `@` exists.
- Original dialogue, narration, VO/OS, and punctuation are preserved. If overloaded, split shots/packages; do not summarize or rewrite dialogue.
- Each shot has one main focus. If two characters fully perform, a prop changes, and new information reveals at once, split.
- Each camera movement has one main logic. Avoid conflicting fixed/push/orbit/whip/follow instructions.
- Final prompt language is camera-readable, physical, and actionable. Remove unsupported metaphor, symbolism, abstract emotion, and generic quality words.
- `04_质检修订表.csv` and `05_模板验证报告.csv` exist; do not stop at storyboard or prompt generation.

## Repair Routing

Use these shortcuts when revising:

| Problem | Return To |
| --- | --- |
| Prompt has missing sections, wrong shell, unclear generation mode | `02B`, `03`, `04`, `05` |
| Camera direction missing, shot type mismatches content, one shot has multiple main focuses | `02`, `02B`, `03`, `04` |
| Shot design feels random or lacks plot-attribute logic | `01`, `00C`, `02`, `02B` |
| Too many eye-level mid/close shots, flat rhythm, averaged duration | `02`, `02A` |
| Final prompt introduces camera/action details absent upstream | `02`, `02B`, then regenerate `03` |
| Asset drift, missing scene/core prop, bare reference labels | `01C`, `02B`, `03`, `04`, `05` |
| Flat white light, no light source, or global style drift | `01A`, `01B`, `03`, `04` |
| Multi-character position swap or frozen side characters | `02`, `02B`, `03` |
| Dialogue too long for package duration | `02B`; split package or shot, never rewrite original dialogue |
| Prompt contains internal terms, field labels, knowledge-card names, or QC notes | `03`, then `04` |

## User-Facing Completion

When reporting completion, list the run path, key files created, validators run, and any residual risk or manual review point. Keep the answer short; the files are the deliverable.
