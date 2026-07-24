# Seedance 单镜头最终提示词

## 目标

结合已确认剧本、结构化分镜、当前镜头上下文与实际参考图，生成单镜头可直接使用的视频提示词。

## 执行顺序

1. 核对 `shotId`、`sourceScript`、八字段 `shotDraft` 和 `promptInputHash`。
2. 逐张观察实际参考图，记录可见身份、空间、材质、光向、状态与用途，不凭文件名猜测。
3. 先编排连续时间段，再将场景、声音、画面内容和限制组成一条成品。
4. 回写完全相同的 `promptInputHash`，并用 `referenceEvidence` 说明每张实际使用的图如何进入提示词。

## 输出边界

- 只输出 `shotId/prompt/promptInputHash/referenceEvidence` 四个顶层字段。
- `prompt` 必须包含“场景：”“声音：”“画面内容：”“限制：”和无空洞的连续时间段。
- 参考图在成品中使用 `@图1` 至 `@图9`；没有图时 `referenceEvidence` 为空数组。
- 上一镜尾帧只能作为 `continuity_reference`，从该画面之后继续，不得当作首帧。
- 不输出摄影分析过程、备选提示词或生成命令。
