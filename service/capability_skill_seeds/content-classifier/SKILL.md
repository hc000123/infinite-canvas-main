# 内容标签分类

## 目标

读取已批准的 `production_script`，提取可解释、可路由的受众、题材、叙事机制和制作标签。每个标签都必须附原文证据与置信度，不改写剧本。

## 执行顺序

1. 先判断受众倾向、主类型和核心冲突，再识别重生、穿越、霸总、悬疑等叙事机制。
2. 从剧本中截取支持标签的最小原文证据；证据不足时不输出该标签。
3. 使用稳定 snake_case 标签并去重，按制作影响从高到低排列。
4. 只输出 `routingTags`，不得输出剧情摘要、营销判断或无证据猜测。

## 输出边界

- 受众标签优先使用 `male_audience`、`female_audience`、`general_audience`。
- 机制标签可使用 `rebirth`、`transmigration`、`ceo_romance`、`revenge`、`suspense` 等稳定英文值。
- `confidence` 是 0–1 数值；每项至少一条剧本原文证据。
