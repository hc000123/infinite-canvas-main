# Canvas Prompt Agent Design

## Goal

把现有画布助手升级为第一版“画布提示词 Agent”。它通过聊天理解用户需求，主要帮助写图片、视频、分镜提示词，并在用户确认后创建对应画布节点；图片类任务允许用户确认后直接生成图片，视频类任务第一版只创建视频配置节点，不直接触发视频生成。

## Product Scope

第一版覆盖三类提示词任务：

- 图片提示词：角色图、场景图、道具图、氛围图、参考图改写。
- 视频提示词：主体、动作、镜头运动、节奏、时长、比例、参考图说明和 Seedance 可用提示词。
- 分镜提示词：把剧本文字或用户描述拆成镜头组，并为每个镜头生成可转视频配置的提示词。

用户仍然在画布右侧“助手”里聊天。Agent 根据当前画布、选中节点、上游引用和用户输入生成结构化结果。任何写入画布或扣费生成动作都先展示预览，用户确认后执行。

第一版不做：

- 不做完全自动连续执行。
- 不直接生成视频。
- 不绕过用户确认修改画布。
- 不新建完整后端 Agent Run 系统。
- 不把整个视频工作流生产链搬进画布助手。

## User Flow

1. 用户打开画布右侧助手。
2. 用户输入自然语言需求，或点击“图片 / 视频 / 分镜”轻量意图入口后输入需求。
3. Agent 读取当前上下文：画布标题、项目/分集信息、选中节点、上游引用、已有工作流上下文。
4. Agent 返回结构化提示词结果和可确认动作。
5. 助手消息中展示提示词卡片和动作预览。
6. 用户可以复制提示词、创建节点、取消动作；图片类可以选择“创建并生图”。
7. 确认后，画布创建对应节点；图片生成成功后把图片节点插回画布。

## Agent Plan Model

Agent 文本请求返回结构化计划，而不是只返回普通聊天文本。

```ts
type PromptAgentIntent = "image_prompt" | "video_prompt" | "storyboard_prompt" | "rewrite_prompt" | "chat";

type PromptAgentPlan = {
    intent: PromptAgentIntent;
    reply: string;
    outputs: PromptAgentOutput[];
    actions: PromptAgentAction[];
};
```

`PromptAgentOutput` 按类型区分：

- `image_prompt`：标题、主体、风格、构图、光线、材质、色彩、参考图用法、负面约束、最终提示词。
- `video_prompt`：标题、主体、动作、镜头运动、景别、节奏、时长、比例、参考图用法、最终提示词。
- `storyboard_prompt`：标题、整体说明、镜头列表；每个镜头包含画面、动作、景别、运镜、情绪、可转视频提示词。

`PromptAgentAction` 第一版支持：

- `node.create_image_config`：创建图片生成配置节点。
- `node.create_video_config`：创建视频生成配置节点。
- `node.create_storyboard_group`：创建一组分镜文本节点或视频配置节点。
- `image.generate`：图片类任务确认后触发真实生图。

## Integration With Existing Assistant

沿用现有画布助手，不重写入口。

复用：

- `CanvasAssistantPanel`：继续作为助手容器。
- `CanvasAssistantMessage` / `CanvasAssistantSession`：继续保存消息与历史。
- `assistantActions`：继续承载“预览后确认”的动作模型。
- `requestImageQuestion`：用于提示词 Agent 文本调用。
- `requestGeneration` / `requestEdit`：用于图片确认后生成。
- 现有节点创建、图片上传、节点避让、引用图读取工具。

新增聚合模块：

- `canvas-prompt-agent-types.ts`：定义计划、输出、动作类型。
- `canvas-prompt-agent.ts`：构造系统提示词、调用文本模型、解析 JSON、降级处理。
- `canvas-prompt-agent-actions.ts`：把 Agent 动作转换成现有画布预览和可执行写入。
- `canvas-prompt-agent-render.ts`：把结构化输出转成消息卡片展示数据。

修改点：

- `canvas-assistant-panel.tsx`：提交时优先尝试 Prompt Agent；闲聊降级走原问答。
- `canvas-assistant-composer.tsx`：调整默认文案，增加图片/视频/分镜意图入口。
- `canvas-assistant-messages.tsx`：展示结构化提示词卡片和动作按钮。
- `canvas-assistant-actions.ts`：扩展动作协议，支持图片配置、视频配置、分镜组。
- `use-canvas-assistant-write-actions.ts`：支持图片类“创建并生图”。
- `types.ts`：为助手消息增加可选 Agent 计划字段。

## Confirmation Rules

- 普通提示词结果可以直接显示。
- 创建节点必须用户确认。
- 生图必须用户点击“创建并生图”或等价明确按钮。
- 视频第一版不允许由 Agent 直接生成，只能创建视频配置节点。
- Agent 输出 JSON 解析失败时，降级为普通助手文本，不创建动作。
- Agent 识别不出意图时，按原有问答助手处理。

## Node Mapping

图片提示词：

- 创建图片生成配置节点。
- 写入 `generationMode: "image"`、`prompt`、`content`、参考图信息。
- 如用户选择“创建并生图”，生成完成后创建图片节点并选中。

视频提示词：

- 创建视频生成配置节点。
- 写入 `generationMode: "video"`、`prompt`、`finalPrompt`、`duration` / `seconds`、`ratio` / `size`、参考图说明。
- 不触发视频生成。

分镜提示词：

- 默认创建一组文本节点，每个镜头一个节点，保留镜头编号、画面、动作、运镜和最终视频提示词。
- 如果输出中包含明确视频配置，允许同时创建多个视频配置节点。
- 节点按画布中心附近自动避让排列，避免重叠。

## Error Handling

- AI 配置缺失：打开现有配置弹窗。
- Agent 请求失败：在助手消息中显示错误，不改画布。
- JSON 解析失败：保留模型原文作为普通回复。
- 动作校验失败：显示动作不可应用，不写入画布。
- 图片生成失败：保留已创建配置节点，消息里提示失败原因。

## Testing

优先补纯函数测试，不默认跑完整构建。

需要覆盖：

- 解析合法 Agent JSON。
- JSON 损坏时降级为普通文本。
- 图片提示词动作能生成图片配置节点预览。
- 视频提示词动作能生成视频配置节点预览。
- 分镜动作能生成多节点预览。
- `image.generate` 不会在未确认时执行。
- 视频动作不会触发真实视频生成。

## Rollout

第一阶段：Agent 写提示词和结构化展示。  
第二阶段：图片/视频提示词确认后创建配置节点。  
第三阶段：分镜拆成多节点落画布。  
第四阶段：图片类支持“创建并生图”。  
第五阶段：补测试、文档和待验收记录。

## Self Review

- 文档完整性：本文档不包含空章节或未完成段落。
- 范围清晰：第一版聚焦提示词 Agent，不做直接生视频或完整后端任务系统。
- 安全边界明确：写画布和生图都需要确认，视频不会自动生成。
- 与现有结构一致：复用画布助手、动作预览、配置节点和图片生成能力。
