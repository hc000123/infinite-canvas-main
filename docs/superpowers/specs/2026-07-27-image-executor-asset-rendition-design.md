# 图片执行器与资产成图 Runtime 设计

## 目标

把角色、场景、道具 `asset_brief` 通过可独立发布的 `image_model` Skill 生成真实图片，归档为 Core Schema `asset_rendition`，并让 Workflow、Agent、画布、图片页和 API 共用同一套 Invocation Runtime。

本阶段不实现视频模型执行器，不把浏览器本地素材库作为 Runtime 真相，也不为标准 Workflow 写资产类型特例。

## 运行时边界

`Skill` 只声明能力、输入输出契约、执行器类型、规则和模板；`Agent` 只编排 Skill；`Workflow` 只描述 DAG、路由和 Artifact 数据流；`Invocation` 负责冻结、计费、执行、重试、质量门、审核和血缘。

图片页和画布调用图片 Skill 时必须创建 Invocation。它们可以提供交互参数，但不能绕过 Invocation 直接生成后再伪造 Artifact。

## Skill 契约

新增三个系统 Skill，各自独立定义、独立版本、独立发布：

- `skill-system-asset-rendition-character`
- `skill-system-asset-rendition-scene`
- `skill-system-asset-rendition-prop`

三者均使用 `executorKind: image_model`，输入一个已批准的 `asset_brief`，输出 `1..4` 个 `asset_rendition`。角色默认四视图或角色设定图，场景默认无人物场景母版，道具默认结构或多角度设定图。Skill 包提供 `SKILL.md`、领域规则、输出模板和有效示例；输出仍同时通过 Skill Schema 与 Core Schema。

`asset_rendition` payload 固定包含：

```json
{
  "assetId": "character-001",
  "renditionId": "rendition-...",
  "mediaType": "image",
  "mediaRef": "/api/uploaded-assets/runtime/image/...png",
  "generationMetadata": {
    "provider": "...",
    "model": "...",
    "requestId": "..."
  }
}
```

## 图片执行策略冻结

Invocation 预检按 Skill 的 `executorKind` 选择执行策略：

- `text_model` 继续选择 `text` capability 与默认文本模型。
- `image_model` 选择 `image` capability 与默认图片模型。
- 无可用图片模型或渠道时以 `executor_unavailable` 阻断，不降级到文本模型。

冻结内容包括执行器类型、模型、渠道、provider/protocol、图片请求 body、输出槽位数量、超时、单次最大重试次数和 Skill 内容哈希。确认后不得受设置变更影响。

图片请求统一使用 OpenAI 兼容 `/images/generations`，最小请求字段为 `model`、`prompt`、`n`；可选 `size`、`quality`、`background`、`output_format` 只能来自已冻结参数白名单。Prompt 由 Skill 指令、输入 `asset_brief` 和调用参数确定，不使用页面私有模板。

## Worker 与结果归档

现有 Agent Run 队列、租约、心跳、取消和重试状态机继续复用。执行器按冻结的 Invocation executor kind 分派：

- 文本执行器请求 `/chat/completions` 并返回结构化文本。
- 图片执行器请求 `/images/generations`，接受 `b64_json` 或远程 `url`，校验实际图片格式和大小后归档。

生成媒体保存到服务端 `PublicAssetDir/runtime/image/`，使用内容哈希派生文件名，返回 `/api/uploaded-assets/runtime/image/<hash>.<ext>`。Artifact 只保存稳定 `mediaRef`，不保存临时远程 URL 或大段 base64。相同图片内容可安全去重。

图片执行器把每个成功图片映射为一个带 ordinal 的 `asset_rendition` 输出草稿；Invocation 完成逻辑继续负责 Schema 校验、Artifact 创建、父引用和质量门。上游 `asset_brief` 是每个 rendition 的直接父 Artifact。

## 多来源 Artifact 聚合

Workflow 输入 binding 增加 `fromNodeKeys`，表示同一个 binding 可从多个上游节点聚合。约束如下：

- `fromNodeKey` 与 `fromNodeKeys` 二选一。
- `fromNodeKeys` 规范化为去重、排序后的非空数组。
- 所有来源节点的输出 Artifact 类型必须等于 binding 的 `artifactType`。
- 所有来源自动加入 `dependsOn`。
- 执行时按 `fromNodeKeys` 顺序、再按上游输出 ordinal 顺序收集已批准输出，统一改写为目标 `bindingName`。
- 目标 Skill 的 min/max 基数仍由 Invocation Resolver 校验；Workflow 不另写业务上限。

旧的单来源 `fromNodeKey` 保留为当前标准格式的一部分；项目尚未上线，不增加旧字段迁移或兼容分支。

## 标准 Workflow 2.1

标准生产 Workflow 增加三个并行成图节点：

```text
character_brief -> character_rendition -+
scene_brief     -> scene_rendition     -+-> video
prop_brief      -> prop_rendition      -+
storyboard ------------------------------> video
```

视频节点继续输入 `storyboard_package`、`asset_catalog`，并以同名 `asset_rendition` binding 聚合三个成图节点的全部已批准 Artifact。三个成图节点均要求生成成本确认和人工审核，未批准的图片不得进入视频提示词节点。

## 计费与重试

图片成本按冻结输出槽位数计算，不沿用文本“每次调用”口径。预检展示总预计积分；确认时预留；每个成功槽位结算；未执行或最终失败槽位退款。

一次请求部分成功时：

- 成功 ordinal 固化并保留，不重复生成。
- 失败 ordinal 进入 partial 状态。
- 重试只请求失败 ordinal，并保持原 ordinal。
- 达到最大尝试次数后，已成功输出仍可进入审核；Workflow 是否继续由下游 min 基数决定。

上游返回整体失败、无有效图片、图片下载失败或格式不支持时，本次没有成功槽位，按现有重试策略重试；最终失败则全额退款。

## 安全与失败语义

- 下载远程图片沿用 HTTP 客户端的 SSRF/大小/超时保护，不访问本地和保留地址。
- 不在日志、Artifact 或前端响应中暴露渠道 API Key。
- 图片归档失败不创建 Artifact。
- 冻结渠道被删除或禁用时执行失败，不静默切换渠道。
- Invocation 取消后不再创建新的 Artifact；已完成归档但尚未落 Artifact 的临时文件允许内容寻址复用。
- 质量门或人工审核失败不删除媒体，Artifact 保留完整审计血缘。

## API 与 UI

Invocation API 结构不新增图片专用入口。预检与详情返回统一执行策略摘要、确认项和 Artifact 输出；`image_generation` 与 `api_cost` 都是图片生成必需确认项。

Skill 中心展示图片执行器和输出基数；Workflow 中心展示三个并行成图节点与视频节点的聚合输入。画布和图片页本阶段只需能通过已有通用 Invocation 入口选择并调用这些 Skill，不新增第二套运行时。

## 验收矩阵

单元与集成测试必须覆盖：

1. `image_model` Skill 可校验、发布、按 capability 或固定版本解析。
2. 图片预检冻结默认图片模型和 image channel；无渠道时明确阻断。
3. 确认项、预计积分和输出槽位数正确。
4. `b64_json` 与远程 URL 都能归档为稳定 `mediaRef`。
5. 非图片响应、超大图片、下载失败、渠道失效均不创建 Artifact 并正确退款。
6. 多图全部成功和部分成功均保持 ordinal、重试不覆盖成功输出。
7. Workflow 同一 binding 可聚合三个上游节点，顺序稳定，未批准输出不可下传。
8. 三个成图 Skill 可独立发布、替换版本和直接 Invocation。
9. 标准 Workflow 的冻结版本、确认、质量门、人工审核、Artifact 父链和视频输入完整。
10. 后端全量测试、前端测试、typecheck、build 通过；隔离浏览器无 console error、无崩溃、无无限轮询。

效果验收使用一个短剧样例，至少生成角色、场景、道具各一张图片，人工检查身份/场景/道具约束是否分别满足 Brief，并确认视频提示词正确引用三个 `asset_rendition` 的 Artifact ID 与内容哈希。若运行环境没有真实图片渠道，自动化测试使用协议级假服务验证完整运行时，同时在验收报告中明确真实模型效果仍需配置渠道后补测，不能把 mock 结果表述为真实生成效果。
