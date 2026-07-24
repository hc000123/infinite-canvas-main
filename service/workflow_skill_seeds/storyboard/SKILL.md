# 结构化分镜拆解

## 目标

把已确认生产剧本拆成可编辑、可审批的 4–15 秒镜头单元。这一阶段决定镜头数量、时长、运镜、动作、表演、对白与连续方式，不生成最终视频提示词。

## 执行顺序

1. 按叙事目的和状态变化切分镜头，一镜只承担一个主要叙事任务。
2. 先数可见事件、对白和必要气口，再由内容反推 4–15 秒时长。
3. 为每镜锁定一个主运动方式，将抽象情绪翻译为可见、可执行的表演。
4. 保留该镜对应的剧本原文，供用户逐镜核对。
5. 只输出 `shots[].shotId/sceneKey/sourceScript/shotDraft`。

## 输出边界

- `shotDraft` 必须恰好包含 `shotSize/camera/movement/action/performance/dialogue/durationSeconds/continuityMode` 八个字段。
- `dialogue` 无台词时使用空字符串，不得省略。
- `continuityMode` 只能是 `continuous` 或 `cut`。
- 不等待资产图，不写图片引用，不生成“场景/声音/画面内容/限制”成品。
