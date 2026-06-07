# 待验收清单

本文档只记录“已实现但还没有被用户真实页面确认”的事项，不写入正式功能说明。验收通过后，再按需要迁移到 `docs/features.md` 或版本记录中。

## 当前版本验收清单

当前版本：`v0.2.76`。需要优先验收的是画布承接站与分镜检查时间线一期 UI、项目详情首屏生产主线布局修正、依赖与后端安全边界修复、M6.11.3-B workflow 状态一致性修复、项目详情总览布局收口、本集生产流程阶段产物可读摘要、M6.11.3-A 本地直连文本 / 生图任务日志与费用追踪、Agent 工作台 `useForm` 未连接告警修复、M6.11.2 阶段三按场次 / 子场次推进、M6.11.1 本集生产主线页面、M6.11.0-A Agent 工作台项目级入口、M6.10.UI-R2 Agent 工作台入口拆层与 workflow 路径提示、M6.10.UI-R Seedance workflow UI 精简与信息层级收口、M6.10.4-A 规范读取记录与质量门 manifest 底座、M6.10.R0 Seedance 三阶段 Agent Core 拆分、M6.10.3-Fix1 P1 阻断修复、M6.10.3-Fix1 Seedance 映射预览 JSON 代码块解析质量修复、M6.10.3-R Seedance 映射预览总 review 修复项、M6.10.3-D Seedance 映射预览确认后创建 / 更新画布视频配置节点，M6.10.3-C Seedance 映射预览确认后写入分镜头表，M6.10.3-B Seedance 映射预览确认后写入设定库，M6.10.3-A Seedance 阶段产物映射预览，M6.10.2 Seedance 三阶段 workflow 状态、审核证据和产物存储，M6.10.1 Seedance 多 Agent 工作流文本 Runner，M6.10.0 Seedance 多 Agent 工作流预设导入、P3-C / M6.9.7 视频节点自动带入本集资产参考、M6.9.R1 Agent 化工作台结构收口、P3-B / M6.9.5 分镜草案 Agent 接入、M6.9.6 镜头组加入画布改为视频生成节点、M6.9.4 本集生图需求接入 Brief / 生图链路、M6.9.3 资产提取 Agent 与本集生图需求、M6.9.2 剧本入口调整与独立工作台、M6.9.1 Agent Runner 协议与运行记录底座、M6.9.0 Agent 设置中心、视频生产台 @素材与布局优化、M6.8 本集工作台收口、画布新建节点目录与定位规则、Linux.do 登录移除、M10.0 云端资产方案冻结文档、M8.R1 追溯链路结构收口、M8 生成历史与任务日志打通、M6.7.3 Brief 导出为美术设定表 / 生图提示词表、M6.7.2 Brief 结果版本对比与主参考图强化、M6.7.R1 Brief 工作台结构收口、M6.7.1 Brief 接入生图与结果归档、M6.7 生图 Brief 工作台，以及 M6.6 / M7 系列回归项。

#### v0.2.76：画布承接站与分镜检查时间线一期 UI

- 入口：画布页 `/canvas/:id`。
- 本次实现：
  - 画布右侧新增上下文检查器，统一展示承接批次概览、节点完整输入输出、记录摘要和画布助手入口。
  - 画布助手改为检查器内的辅助状态，不再作为独立右侧大面板抢占主界面。
  - 选中文本、图片、视频、音频和生成配置节点时，右侧检查器展示完整文本 / 提示词 / 输入预览和主要操作。
  - 系统提示、原始 JSON、任务 ID、规范读取等过程信息默认收在“记录”视图，不进入主内容区。
  - 绑定项目和集数且已有分镜头表的画布底部显示分镜检查时间线；点击镜头会定位相关节点，未入画布的镜头会在检查器中显示完整脚本和分镜描述。
  - 节点悬浮工具条改为图标 + tooltip，降低视觉重量，复杂操作转移到右侧检查器。
- 验收步骤：
  1. 打开任意画布页。
  2. 未选中节点时，确认右侧显示自由画布或承接批次概览，并提供本集流程、素材、Brief、助手入口。
  3. 选中文本节点，确认完整文本可在右侧查看，不被省略。
  4. 选中生成配置节点，确认完整输入预览能看到上游文本、图片、视频或音频引用。
  5. 打开绑定项目和集数且已有分镜头表的画布，确认底部出现分镜检查时间线。
  6. 点击一个已有节点的镜头，确认画布定位并选中相关节点。
  7. 点击一个尚未入画布的镜头，确认右侧显示完整脚本和分镜描述。
  8. 点击右侧“助手”，确认原画布助手会话、引用和输入框仍可使用。
- 明确不应发生：
  - 不改变节点、分镜、素材、Agent 或任务日志数据结构。
  - 不自动生成图片或视频。
  - 不触发扣费。
  - 不把项目基准设定、剧本导入、导演分析和服化道拆解重新放回画布主界面。

#### v0.2.76：项目详情首屏生产主线与画布后置修正

- 入口：项目详情页 `/projects/:id`。
- 本次修复：
  - 项目详情页首屏不再先把大面积空间给标题、说明输入框和零散画布按钮。
  - 新增首屏“生产主线”区域，把本集生产流程、分集剧本、Agent、下一步建议和关键状态放到同一条操作路径里。
  - 项目说明降级为右侧备注区，仍保留保存能力。
  - 画布、分集 / 场次、分镜、缺素材状态保留点击入口，继续跳转到对应页面、抽屉或筛选状态。
  - 项目详情页新增“导入本集剧本”弹窗，导入后直接进入本集生产流程，不再在新建画布时顺手创建 / 绑定集数。
  - 项目详情页的新建画布弹窗不再显示“剧本来源”，画布被明确放到最后承接分镜头表、提示词和视频配置节点。
  - 本集生产流程页在没有绑定画布时，顶部和步骤 4 提供“创建承接画布”，用于最后一步绑定当前集并进入画布。
- 验收步骤：
  1. 打开任意项目详情页。
  2. 确认首屏最显眼的是本集生产主线，而不是项目说明输入框。
  3. 在没有分集的项目中点击“导入本集剧本”，确认只创建集数并进入 `/projects/:id/episodes/:episodeId/workbench`，不创建画布。
  4. 点击“最后创建画布”，确认弹窗只配置画布预设，不再要求选择或粘贴剧本。
  5. 在本集生产流程页没有绑定画布时，确认前面文本流程仍可推进；到步骤 4 再点击“最后创建承接画布”。
  6. 创建承接画布后，确认新画布绑定当前项目和当前集。
- 明确不应发生：
  - 不改变项目、画布、剧本、分镜、素材或 Agent 数据结构。
  - 不触发图片或视频生成。
  - 不触发扣费。

#### v0.2.76：Agent 工作台加载态 Spin 警告修复

- 入口：项目级 Agent 工作台 `/projects/:id/agents`。
- 本次修复：加载本地项目时使用 Ant Design Spin 的 `description` 属性，避免 antd 6 `tip` deprecated 警告。
- 验收步骤：打开 `/projects/:id/agents`，确认页面加载态正常，控制台或 dev server 日志不再出现 `[antd: Spin] tip is deprecated`。
- 明确不应发生：不触发 AI 生成、不扣费、不改变 Agent 工作台业务逻辑。

#### v0.2.76：InputNumber 后缀警告修复

- 入口：项目列表的新建画布弹窗、后台系统设置的模型算力点表。
- 本次修复：把 Ant Design InputNumber 的 `addonAfter` 后缀改为 `Space.Compact` 组合，避免 antd 6 deprecated 警告。
- 验收步骤：打开项目列表并唤起新建画布弹窗，确认控制台或 dev server 日志不再出现 `[antd: InputNumber] addonAfter is deprecated`；后台系统设置模型算力点表同样无该警告。
- 明确不应发生：不改变默认时长、模型费用字段和表单提交数据结构。

#### v0.2.76：依赖与后端安全边界修复

- 入口：前端安装 / 测试脚本、后端 AI 代理、后台素材上传、上传素材静态访问、系统配置。
- 本次修复：
  - `@ant-design/pro-components` 升到支持 antd 6 的版本，`.mts` 测试脚本改为使用 Node 类型剥离参数。
  - `.env.example` 中的 `change-me-*` 占位管理员密码和 JWT 密钥不再被后端启动配置接受。
  - 用户自定义渠道默认关闭；火山本地视频自定义 `baseUrl` 只允许 HTTPS 公网地址，并在最终连接 IP 上再次校验。
  - AI 请求体增加 100 MB 上限，生成数量 `n` 增加服务端上限，扣费乘法增加溢出保护。
  - 视频下载代理增加最终连接公网 IP 校验和 1 GB 下载上限。
  - 后台素材上传改为 MIME 白名单，文件扩展名由 MIME 决定；上传素材静态响应增加 `nosniff`。
- 验收步骤：
  1. 前端执行安装和 `npm test`，确认不再因 antd / pro-components peer dependency 或 `.mts` 扩展失败。
  2. 复制 `.env.example` 后不修改 `ADMIN_PASSWORD` / `JWT_SECRET` 启动后端，确认启动会提示占位配置错误。
  3. 后台系统设置中不配置 `allowCustomChannel` 时，用户配置弹窗应只走云端渠道。
  4. 登录后构造 `/api/v1/videos` 请求，把 `_volcengine_base_url` 指向 localhost、内网 IP 或非 HTTPS 地址，确认后端拒绝请求。
  5. 后台上传 SVG 或伪造扩展名的图片，确认 SVG 被拒绝，合法图片按真实 MIME 保存扩展名。
- 明确不应发生：
  - 不改已有业务数据结构。
  - 不迁移旧数据。
  - 不改变云端模型渠道的管理员配置能力。

#### v0.2.76：M6.11.3-B workflow 状态一致性修复

- 入口：项目级 Agent 工作台 `/projects/:id/agents`，以及本集生产流程页 `/projects/:id/episodes/:episodeId/workbench`。
- 本次修复：
  - workflow stage 显示状态统一通过 `summarizeWorkflowStageDisplayState` 派生，scene-level 进度统一通过 `getWorkflowStageSceneProgress` 汇总。
  - 当 stage3 已有 scene-level 状态时，显示层优先信任场次汇总，不再让旧 `stageState.status=approved` 覆盖未完成场次。
  - stage3 只有全部场次 approved 时才显示“已批准”；仍有未完成场次时显示“部分完成 / 场次未完成”和 `已批准 x / 未完成 y`。
  - 场次驳回或失败会在阶段显示中优先暴露为已驳回或异常，不再显示为已批准。
  - 项目级 Agent 工作台和本集生产流程页使用同一套状态汇总函数，降低同一 workflow run 两边口径不一致的风险。
  - 对没有 scene-level 状态的旧 run，继续按旧 stage 状态展示，避免把历史数据强行改成新语义。
- 验收步骤：
  1. 准备一个 stage3 总状态曾经 approved、但 scene-level 仍有未完成场次的 workflow run。
  2. 打开本集生产流程页，确认 stage3 总标签不是“已批准”，而是显示“部分完成 / 场次未完成”及 `已批准 x / 未完成 y`。
  3. 打开同一项目的 Agent 工作台，确认同一 workflow run 的 stage3 标签与本集生产流程页一致。
  4. 将全部场次审核通过后，再确认 stage3 显示“已批准”。
  5. 将任一场次驳回或制造失败状态，确认阶段总状态不显示“已批准”。
  6. 打开没有 scene-level 状态的旧 run，确认仍按旧 stage 状态展示。
- 明确不应发生：
  - 不改后端。
  - 不接新模型。
  - 不触发图片或视频生成。
  - 不触发扣费。
  - 不改变旧 run 的实际存储数据，只修显示派生和前端 gate 判断。

#### v0.2.75：项目详情总览布局收口

- 入口：项目详情页 `/projects/:id` 的“总览”Tab。
- 本次修复：
  - 不再把 10 个项目统计大卡片铺在总览首屏。
  - “下一步建议”前置为主区域，项目状态改为右侧紧凑摘要。
  - 失败、缺素材、过期引用、项目库和 Agent 数量改为小型状态入口，保留原点击跳转。
- 验收步骤：
  1. 打开任意项目详情页。
  2. 确认总览首屏重点是“下一步建议”，不是大面积统计卡。
  3. 点击画布、分镜、缺素材、过期引用、项目库和 Agent 状态入口，确认仍能进入对应页面或筛选。
- 明确不应发生：
  - 不改变项目、画布、素材、分镜或 Agent 数据。
  - 不触发图片或视频生成。
  - 不触发扣费。

#### v0.2.75：本集生产流程阶段产物可读摘要

- 入口：本集生产流程页 `/projects/:id/episodes/:episodeId/workbench` 的三阶段工作流卡片。
- 本次修复：
  - 阶段产物不再只显示 `最近产物摘要` 的原始 JSON / markdown 片段。
  - 导演分析阶段会展示核心摘要、导演讲戏、人物清单、场景清单、互动道具。
  - 服化道阶段会展示核心摘要、人物设定、场景规划、道具提示词、服化道提示词。
  - Seedance 分镜阶段会展示核心摘要、场次视觉 DNA、拆分计划、Seedance 提示词和工业化预检。
  - 兼容已保存的历史产物：优先读取结构化输出；如果产物包在 JSON 代码块或业务字段嵌在子对象里，也会尽量解析成可读区块。
  - Agent 阶段开始运行时会自动记录本阶段规范读取；`规范读取 x/y` 下方展示具体读取清单，能看到每条必读内容的状态、类型、名称和文件路径。
  - 阶段产物区展示完整业务结果，不按条数或字数压缩；不显示 `stageId`、`verification`、`readPaths`、`artDesignOutput` 等 JSON / 规范读取过程字段；完整原文仍保留在“详细信息”。
- 验收步骤：
  1. 打开本集生产流程页。
  2. 展开已生成产物的导演分析阶段。
  3. 确认能直接看到完整导演讲戏、人物清单、场景清单和互动道具，而不是裸 JSON 或缩略摘要。
  4. 查看“规范读取清单”，确认能看到每条必读规范的状态、类型、名称和路径；运行阶段后确认状态会自动变为已读。
  5. 展开服化道阶段，确认人物 / 场景 / 道具完整内容可读，且不出现 `stageId`、`verification`、`readPaths` 等过程字段。
  6. 点击“详细信息”，确认原始 rawText 和追溯信息仍保留。
- 明确不应发生：
  - 不改变阶段运行、批准 / 驳回、mapping preview 或写入逻辑。
  - 不触发图片或视频生成。
  - 不触发扣费。

#### v0.2.75：M6.11.3-A 本地直连文本 / 生图任务日志与费用追踪

- 入口：项目详情页 `/projects/:id` 的“工作流”Tab，“本地 AI 任务”卡片。
- 本次实现：
  - 新增前端本地任务日志，用于记录本地直连文本和生图调用的来源、模型、状态、输入摘要、输出摘要、项目 / 集 / 画布追溯、估算费用和外部计费提示。
  - workflow 阶段“运行草案”和 Agent 工作台内 workflow 文本草案会写入本地文本任务日志。
  - 画布图片生成、Brief 生图配置节点、画布助手生图、角度变体和直接生图工作台会写入本地生图任务日志。
  - 生图日志区分请求尺寸和返回尺寸；尺寸不一致时提示以外部平台账单和实际资源为准。
  - 费用只做本地静态估算或标记无法估算，不做真实扣点，不回写后台算力点日志。
- 验收步骤：
  1. 运行一个 workflow 文本阶段。
  2. 打开项目详情页“工作流”Tab，查看本地文本任务日志。
  3. 运行一次本地直连生图，优先从项目画布或 Brief 生图配置节点触发。
  4. 回到项目详情页“本地 AI 任务”，查看本地生图任务日志。
  5. 检查模型、类型、状态、输入摘要、输出摘要、项目 / 集 / 画布追溯、估计费用或“无法估算”、外部计费提示。
  6. 检查生图记录中“请求尺寸”和“返回尺寸”是否区分显示。
- 明确不应发生：
  - 不改后端日志。
  - 不伪装成真实扣点。
  - 不把估算费用当正式账单。
  - 不自动触发图片或视频生成。
  - 不接入视频生成。

#### v0.2.74：Agent 工作台 useForm 未连接告警修复

- 入口：项目级 Agent 工作台 `/projects/:id/agents`，尤其是带 `canvasId / episodeId` 的画布跳转入口。
- 本次修复：
  - Agent 工作台默认停留在“工作流执行”Tab 时，不再提前向“单 Agent 配置”Tab 内尚未挂载的 Ant Design 表单写入字段。
  - 切换到“单 Agent 配置”Tab 后，再同步当前 Agent 模板表单值，保留原有编辑、恢复默认、保存项目配置和创建预览 Run 行为。
- 验收步骤：
  1. 从画布或项目详情进入 `/projects/:id/agents`。
  2. 确认首屏默认展示“工作流执行”Tab。
  3. 确认页面不再出现 `Instance created by useForm is not connected to any Form element` 控制台覆盖层。
  4. 切换到“单 Agent 配置”Tab。
  5. 确认表单字段正常显示当前 Agent 模板内容，并可继续保存项目配置。
- 明确不应发生：
  - 不改变 workflow 执行、审核、mapping preview 或写入确认逻辑。
  - 不触发图片或视频生成。
  - 不触发扣费。

#### v0.2.74：M6.11.2 阶段三按场次 / 子场次推进

- 入口：本集生产流程页 `/projects/:id/episodes/:episodeId/workbench` 的阶段三“Seedance 分镜”区域。
- 本次实现：
  - 阶段三新增“场次推进”子工作台，不再把 Seedance 分镜默认当成整集一次性草案执行。
  - 场次列表优先从当前本集分镜头表的 `sceneId / sceneName` 推导；没有分镜头表时，从导演分析产物或剧本文本中的场次标题推导。
  - 每个场次 / 子场次独立记录 `sceneKey`、`sceneLabel`、状态、场次视觉 DNA 摘要、生成 P / 镜头 P 拆分摘要、单 P 任务卡 / Seedance 提示词摘要、工业化预检摘要、审核证据、warning、error 和阻塞原因。
  - 阶段三运行前必须先选择当前场次 / 子场次；运行输入会携带当前场次标识、场次剧本片段、导演讲戏片段、角色 / 场景 / 道具摘要、已有视觉 DNA 和前序衔接摘要。
  - 当前场次产物必须包含场次视觉 DNA、生成 P / 镜头 P 拆分摘要、Seedance 提示词正文和工业化预检摘要，否则不能批准该场次。
  - 场次审核备注和审核证据按场次留痕；场次批准 / 驳回只改变 workflow stage3 内部 scene-level 状态。
  - stage3 mapping preview 不被自动生成；用户需要手动点击“汇总已批准场次”，再沿用原有 storyboard_table / video_node preview 与确认写入链路。
  - 第一版只做 scene-level 推进和简单子场次文本输入，不做复杂 NLP 子场次解析器，不改后端，不接新编排框架。
- 验收步骤：
  1. 打开本集生产流程页。
  2. 完成阶段 1 / 2 批准。
  3. 进入阶段 3。
  4. 选择一个场次 / 子场次。
  5. 运行该场次草案。
  6. 查看场次视觉 DNA / 拆分摘要 / 提示词。
  7. 审核通过当前场次。
  8. 切换下一个场次。
  9. 确认场次状态独立推进。
  10. 汇总生成 storyboard_table / video_node preview。
  11. 写入分镜头表 / 创建视频配置节点。
- 明确不应发生：
  - 不自动跑完整集。
  - 不自动生成视频。
  - 不触发扣费。
  - 不绕过场次审核。
  - 不丢失原有 mapping preview 追溯字段。

#### v0.2.73：M6.11.1 本集生产主线页面

- 入口：项目详情页 `/projects/:id` 的“工作流”Tab 中每集的“生产流程”按钮，或已绑定项目和集数的画布工具栏“本集生产流程”按钮。
- 本次实现：
  - 新增本集级正式流程页 `/projects/:id/episodes/:episodeId/workbench`，页面标题为“本集生产流程”。
  - 页面按单集展示剧本、导演分析、服化道美术设计、Seedance 分镜、写入结果 / 去画布。
  - 三阶段对齐原始 Seedance workflow：`director-analysis` 使用 `director`，`art-design` 使用 `art-designer`，`seedance-storyboard` 使用 `storyboard-artist`。
  - 复用现有 `AgentWorkflowRunRecord`、`AgentWorkflowStageState`、`AgentWorkflowStageOutput`、`AgentWorkflowReviewEvidence`、`useAgentRunnerStore`、三阶段 Agent Core、quality gate manifest、mapping preview 生成与写入方法。
  - 设定库、分镜头表和视频配置节点写入继续复用 mapping preview 的 approved 门禁和重复写入防护。
  - 项目详情页按分集提供“生产流程”入口；Agent 工作台仍保留为全项目 Agent 控制台。
  - 画布工具栏在已有 `projectId + episodeId` 时跳转本集生产流程；缺上下文时仍打开原本集工作台用于绑定剧本。
  - 本轮不做逐场次执行器，不自动生成图片，不自动生成视频，不触发扣费，不改后端。
- 验收步骤：
  1. 新建项目。
  2. 新建集数。
  3. 导入本集剧本。
  4. 进入本集生产流程页面。
  5. 运行导演分析。
  6. 批准导演分析。
  7. 运行服化道美术设计。
  8. 批准服化道。
  9. 运行 Seedance 分镜。
  10. 批准分镜。
  11. 生成 mapping preview。
  12. 写入设定库。
  13. 写入分镜头表。
  14. 创建视频配置节点。
  15. 去画布确认节点存在且为 `idle`。
- 明确不应发生：
  - 不自动生成图片。
  - 不自动生成视频。
  - 不触发扣费。
  - 不绕过 approved 门禁。
  - 不在缺 canvasId 时写画布节点。

#### v0.2.72：M6.11.0-A Agent 工作台项目级入口

- 入口：项目详情页 `/projects/:id` 的“Agent 工作台”，或画布页本集工作台里的“Agent 工作台”按钮。
- 本次实现：
  - 新增项目级页面 `/projects/:id/agents`，页面标题为“Agent 工作台”。
  - 现有 `AgentSettingsDrawer` 的主体已抽成可复用 `AgentWorkspacePanel`，项目级页面和 Drawer 共用同一套业务逻辑。
  - 画布页不再承载完整 Agent 配置 / 执行抽屉，只保留跳转入口。
  - 从画布页进入时会带上 `canvasId / episodeId` query，用于保留 mapping preview 写入分镜和创建视频节点所需上下文。
  - 画布内入口与禁用提示统一改成“Agent 工作台”，不再保留“Agent 设置中心”旧文案。
  - 缺少 `canvasId / episodeId` 时，视频节点 / 分镜写入入口会直接禁用并显示原因，不静默失败。
  - 从画布上下文进入后，`video_node` mapping preview 创建节点会回跳当前画布，并打开新节点的生成配置面板。
  - 已回归确认不再出现 `Drawer width deprecated`、`Modal static function context warning`、`Alert message deprecated` 这三类 AntD 告警。
  - workflow 执行、单 Agent 配置、文本 API 状态、实际模型、模板预览、草案记录、mapping preview 和写入逻辑保持不变。
  - 不改 Agent Runner 数据结构，不接新 LLM，不触发图片或视频生成，不触发扣费。
- 操作步骤：
  1. 打开项目详情页，点击“Agent 工作台”，确认进入 `/projects/:id/agents`。
  2. 打开画布页，在本集工作台点击“Agent 工作台”，确认进入 `/projects/:id/agents?canvasId=...&episodeId=...`。
  3. 在项目级 Agent 工作台检查“工作流执行”Tab，确认仍可运行文本草案、生成 mapping preview，并保留审核与写入确认流程。
  4. 切换到“单 Agent 配置”Tab，确认文本 API 状态、实际模型、模板预览和草案记录仍正常展示。
  5. 直接打开不带上下文的 `/projects/:id/agents`，确认 `video_node` / `storyboard_table` 写入入口会禁用，并显示缺少上下文的中文原因。
  6. 从带 `canvasId / episodeId` 的入口进入后，生成视频节点类 mapping preview，确认仍可“创建节点”，回跳后会定位到当前画布并打开该节点配置，不会直接生成视频或扣费。
  7. 打开本集生产台的“绑定 / 导入剧本”等确认弹窗，再检查项目级 Agent 工作台，确认控制台不再出现指定的 Ant Design deprecated warning。
- 预期结果：
  - 项目详情页或画布页都能进入 `/projects/:id/agents`。
  - Agent 工作台页面可以稳定承载 workflow 和单 Agent 配置，不再依赖画布抽屉作为主入口。
  - 从画布进入时，上下文可保留到项目级页面。
  - 缺少上下文时，相关写入入口会禁用并解释原因。
  - mapping preview 的设定库 / 分镜头表 / 视频节点应用逻辑不变。
  - 不触发真实生成，不触发扣费。

#### v0.2.71：M6.10.UI-R2 Agent 工作台入口拆层与 workflow 路径提示

- 入口：画布页或项目详情页的“Agent 设置 / Agent 工作台”。
- 本次实现：
  - Agent 抽屉标题改为“Agent 工作台”，默认 Tab 改为“工作流执行”。
  - Seedance workflow 与单 Agent 配置拆成两个 Tab，避免正式三阶段流程和模板配置混在同一首屏。
  - Seedance workflow 作为内置流程展示，不再显示预设选择、启用 / 停用、已选择 / 未选择、保存选择和清除选择等暂不可操作的配置控件。
  - Seedance workflow 顶部新增简短路径：阶段 1 → 阶段 2 → 阶段 3 → 生成预览 → 确认写入。
  - 单 Agent 配置中将“可用”改为“模板可用”，并显示文本 API 就绪状态、调用通道和实际文本模型。
  - 单 Agent 配置明确“创建预览 Run”只创建本地记录，真实文本调用在 workflow 阶段“运行草案”中触发。
  - 单 Agent 详情默认展示完整模板预览，包含使用场景、输入变量、系统提示词、用户提示词模板和输出 Schema；编辑字段默认折叠。
  - 单 Agent 的“运行记录”改为“草案记录”，移除列表中的批准 / 驳回按钮，避免把历史记录误当成审核入口。
  - 本集工作台的资产提取草案改为直接展示可读资产卡片，并默认展开处理过程摘要。
  - 视频生产台 Drawer 改用 Ant Design 推荐的 `size` 属性，移除 `width` 废弃警告。
- 操作步骤：
  1. 打开画布页的 Agent 工作台，确认默认进入“工作流执行”Tab。
  2. 检查首屏是否只展示当前内置 Seedance 工作流和三阶段路径，不出现无实际意义的启用 / 选择 / 保存配置控件。
  3. 切换到“单 Agent 配置”Tab，确认旧的单 Agent 模板配置、创建预览 Run 和运行记录仍可用。
  4. 检查单 Agent 列表和详情区，确认能看清模板状态、文本 API 状态、调用通道和实际模型。
  5. 检查单 Agent 模板预览，确认提示词和输出 Schema 可完整查看，编辑字段需要主动展开。
  6. 检查“草案记录”，确认只展示记录和详情，不出现批准 / 驳回按钮。
  7. 在本集工作台点击“运行资产提取”，确认运行后直接看到资产草案卡片、来源片段和处理过程摘要。
  8. 打开视频生产台，确认不再出现 `[antd: Drawer] width is deprecated` 控制台提示。
- 预期结果：
  - 首屏优先呈现实际工作逻辑，而不是配置表单。
  - 内置 workflow 不再表现成可新建 / 可切换 / 可开关的预设管理器。
  - 单 Agent 配置仍保留，但不干扰正式 workflow 执行视图。
  - 单 Agent 默认先看完整模板预览，避免只露出一段被截断的表单。
  - 资产提取结果不再只藏在 JSON 折叠区，用户能直接判断草案是否可用。
  - 用户不会把“模板可用”误解为“API 已真实连通并执行过”。
  - 单 Agent 草案记录不提供审批动作；审批只保留在正式 workflow 阶段审核中。
  - 不改变 Runner、workflow 状态、quality gate、mapping preview 或写入逻辑。

#### v0.2.71：M6.10.UI-R Seedance workflow UI 精简与信息层级收口

- 入口：`/projects/:id` 项目详情页或画布页“Agent 设置”中的“多 Agent 工作流预设”。
- 本次实现：
  - Seedance workflow 主视图改为工作台式摘要，减少长段说明文字。
  - 阶段卡片、required readings / gate result、mapping preview、runner output 与追溯信息均改为默认折叠展开查看。
  - 按钮文案缩短为“运行草案”“生成预览”“写入分镜”“创建节点”等更短操作词。
- 操作步骤：
  1. 打开 Agent 设置中心，确认 Seedance workflow 首屏优先展示阶段状态、数量、warning 和下一步动作。
  2. 检查已完成阶段默认收口、未解锁阶段默认收口且仍可见阻塞原因、当前阶段默认展开。
  3. 展开 quality gate、mapping preview、阶段产物和审核证据详情，确认 sourceFiles / qualityGateIds / mappedFields / 追溯信息入口仍保留。
  4. 点击“运行草案”“生成预览”“写入设定库 / 写入分镜 / 创建节点”等操作前后，确认 workflow 行为与确认弹窗风险说明不变。
- 预期结果：
  - 主界面长说明明显减少。
  - 阶段详情、required readings / gate 详情、mapping preview 详情默认折叠。
  - warning、error、阻塞原因、审核状态仍可见。
  - 关键操作确认弹窗仍保留扣费 / 生成 / 写入范围说明。
  - 不改变 workflow 状态、Runner、quality gate、mapping preview 和应用写入逻辑。

#### v0.2.70：M6.10.4-A 规范读取记录与质量门 manifest 底座

- 入口：`/projects/:id` 项目详情页或画布页“Agent 设置”中的“多 Agent 工作流预设”。
- 本次实现：
  - 新增 Seedance quality gate manifest、required readings、reading records 和基础 gate 纯函数。
  - Agent 设置中心按阶段展示规范读取记录数量、已读 / 缺失、error / warning 和 required readings / gate result 明细。
- 操作步骤：
  1. 打开 Seedance workflow 三个阶段，确认每阶段能看到规范读取记录摘要和 required readings 明细。
  2. 点击“按 manifest 标记已读”，确认当前阶段生成 / 刷新读取记录，已读数量更新。
  3. 在尚未生成 reading、尚无 output、尚无 evidence 的阶段检查 gate result，确认显示对应 error。
  4. 查看阶段三，确认显示 industrial-quality-rules 的四个调用节点：阶段开始前、场次开写前、每条生成 P 后、导演审核前。
  5. 继续运行文本草案、人工审核、mapping preview 和应用链路，确认既有行为不变。
- 预期结果：
  - 三阶段 workflow 行为不变。
  - 三个阶段的 Agent Core 仍可被 workflow 复用。
  - 未新增单独 Agent 入口。
  - 不影响 mapping preview / 设定库 / 分镜 / 视频节点应用链路。
  - gate 结果不自动批准、不自动进入下一阶段、不自动写业务数据。
  - 不执行旧 Python 脚本，不生成图片或视频，不触发扣费。

#### v0.2.69：M6.10.R0 Seedance 三阶段 Agent Core 拆分

- 入口：`/projects/:id` 项目详情页或画布页“Agent 设置”中的“多 Agent 工作流预设”。
- 本次实现：
  - `director`、`art-designer`、`storyboard-artist` 三个正式工作流阶段已拆到 `web/src/app/(user)/projects/workflow-agents/`。
  - 现有文本阶段运行和 mapping preview 生成已接回对应 Agent Core。
- 操作步骤：
  1. 打开 Seedance workflow 三阶段，确认阶段顺序、状态、来源文件、技能和质量门展示不变。
  2. 手动运行任一文本阶段，确认成功后仍进入待审核 review output。
  3. 批准阶段产物后生成 mapping preview，确认 JSON 代码块解析质量修复仍有效。
  4. 分别应用 production_bible / storyboard_table / video_node preview，确认写入和追溯行为不变。
- 预期结果：
  - 三阶段 workflow 行为不变。
  - 三个 Agent Core 可复用。
  - 未新增单独 Agent 入口。
  - 不影响 mapping preview / 应用链路。
  - 不触发图片或视频生成。
  - 不触发扣费。

#### v0.2.68：M6.10.3-Fix1 P1 阻断修复

- 入口：`/projects/:id` 项目详情页和 `/canvas/:id` 画布页。
- 本次发现：
  - v0.2.67 复测 M6.10.3-Fix1 时，`EpisodeWorkbenchDrawer` 挂载后触发 Zustand selector 无限更新。
  - 项目详情页和画布页均出现 `The result of getSnapshot should be cached to avoid an infinite loop` 与 `Maximum update depth exceeded`，导致无法进入剧本绑定、Agent 设置、三阶段 Runner 和 mapping preview。
  - 当前已修复为不在 Zustand selector 中直接返回 `resolvedProjectConfigs(projectId)` 派生数组，改为订阅原始配置字段并在组件内 memo 合并。
- 操作步骤：
  1. 打开项目详情页，确认页面可正常渲染，不再出现无限更新错误。
  2. 打开画布页，确认页面可正常渲染，不再出现无限更新错误。
  3. 从项目详情页或画布页打开本集工作台 / Agent 设置中心，确认 Agent 配置仍能读取项目级覆盖。
  4. 重新执行 M6.10.3-Fix1 全流程复测，确认 JSON 代码块映射 preview 修复有效。
- 预期结果：
  - 项目详情页和画布页可用。
  - 不再出现 getSnapshot / Maximum update depth 相关错误。
  - Agent 设置中心仍能读取全局配置和项目级配置。
  - 不自动生成图片或视频，不触发扣费。

#### v0.2.67：M6.10.3-Fix1 Seedance 映射预览 JSON 代码块解析质量修复

- 入口：`/projects/:id` 项目详情页或画布页“Agent 设置”中的“多 Agent 工作流预设”。
- 本次发现：
  - 人工测试 v0.2.66 时，真实模型返回 JSON 代码块后，映射预览曾把 `workflowId`、`stageId`、`metadata` 等 JSON 元字段误当成业务条目。
  - 当前已修复为优先解析结构化输出 / JSON 代码块，只从 `characters`、`scenes`、`shots`、`videoPrompts` 等目标业务数组生成 preview item，并过滤 workflow / metadata 等非业务字段。
  - 需要复测 preview 映射质量，确认设定库、分镜头表、视频配置节点不再写入元字段条目。
- 操作步骤：
  1. 使用真实模型输出包含 JSON 代码块的三阶段产物，并在 approved 后生成 `production_bible` / `storyboard_table` / `video_node` 映射预览。
  2. 检查 preview 顶部 warning，确认纯文本 fallback 或 JSON 无业务数组时有明确中文提示。
  3. 检查 preview 条目，确认 `workflowId`、`stageId`、`metadata`、`sourceFiles`、`qualityGateIds` 等字段不会作为标题或业务内容出现。
  4. 确认后分别写入设定库、分镜头表或创建视频配置节点，检查写入结果只包含业务条目。
- 预期结果：
  - JSON 代码块优先按业务数组解析。
  - 元字段仅保留为追溯来源，不生成业务条目。
  - JSON 无可映射业务数组时生成 0 条 item，并显示中文 warning。
  - 纯文本 fallback 仍允许用户应用，但 preview 顶部会提示结构化解析不足。
  - 不自动生成图片或视频，不触发扣费。

#### v0.2.66：M6.10.3-R Seedance 映射预览总 review 修复项

- 入口：`/projects/:id` 项目详情页或画布页“Agent 设置”中的“多 Agent 工作流预设”。
- 操作步骤：
  1. 连续对两个不同 approved output 生成同一 targetType 的 mapping preview，确认它们的条目序号可以相同但 `previewId` 不同。
  2. 先应用第一个 preview 的第一个条目，再应用第二个 preview 的第一个条目。
  3. 在项目详情页这种缺少画布 / 本集上下文的位置查看 `storyboard_table` preview。
- 预期结果：
  - 不同 preview 的同名 `previewItemId` 不会互相误判为已写入。
  - 同一个 preview 的同一个条目重复点击仍会被阻止。
  - 缺少画布 / 本集上下文时，分镜头表写入入口禁用并显示中文原因。

#### v0.2.65：M6.10.3-D Seedance 映射预览确认后创建 / 更新画布视频配置节点

- 入口：`/projects/:id` 项目详情页或画布页“Agent 设置”中的“多 Agent 工作流预设”。
- 操作步骤：
  1. 将 `seedance-storyboard` 阶段推进到 approved，并生成 `video_node` 映射预览。
  2. 点击该 preview 的“创建视频配置节点”，确认弹窗明确说明只会在当前画布创建 / 更新视频配置节点，不会开始视频生成，不会扣费，也不会写入设定库或分镜头表。
  3. 确认后检查当前画布，确认新增或更新的视频配置节点被定位 / 选中，并带有 workflow 追溯 metadata。
  4. 重复点击同一 preview，确认不会重复创建，并提示“已创建视频配置节点”或等价中文提示。
  5. 查看 `production_bible` / `storyboard_table` preview，确认本轮没有错误应用到画布节点。
- 预期结果：
  - video_node preview 可确认创建视频配置节点。
  - 创建前有确认。
  - 重复创建被阻止。
  - 节点保留 workflow 追溯。
  - 节点状态为 `idle`，不自动生成。
  - 不写入设定库 / 分镜头表。
  - 不触发图片或视频生成。

#### v0.2.64：M6.10.3-C Seedance 映射预览确认后写入分镜头表

- 入口：`/projects/:id` 项目详情页或画布页“Agent 设置”中的“多 Agent 工作流预设”。
- 操作步骤：
  1. 将任一可生成分镜预览的阶段推进到 approved，并生成 `storyboard_table` 映射预览。
  2. 点击该 preview 的“写入分镜头表”，确认弹窗说明只会追加写入当前本集分镜头表，不会写入设定库，也不会创建或修改画布节点。
  3. 确认写入后，打开当前本集分镜头表，检查新增条目是否追加在末尾。
  4. 重复点击同一 preview，确认不会重复写入，并提示“已写入分镜头表”或等价中文提示。
  5. 查看 `production_bible` / `video_node` preview，确认本轮没有错误写入到分镜头表。
- 预期结果：
  - storyboard_table preview 可确认写入分镜头表。
  - 写入前有确认。
  - 写入为追加，不覆盖已有分镜。
  - 重复写入被阻止。
  - 写入结果保留 workflow 追溯。
  - production_bible / video_node preview 本轮不会应用。
  - 不写入设定库 / 画布节点。

#### v0.2.63：M6.10.3-B Seedance 映射预览确认后写入设定库

- 入口：`/projects/:id` 项目详情页或画布页“Agent 设置”中的“多 Agent 工作流预设”。
- 操作步骤：
  1. 将任一可生成设定库预览的阶段推进到 approved，并生成 `production_bible` 映射预览。
  2. 点击该 preview 的“写入设定库”，确认弹窗说明只会写入设定库，不会写入分镜或画布节点。
  3. 确认写入后，打开设定库查看新增条目和来源追溯信息。
  4. 重复点击同一 preview，确认不会重复写入，并提示“已写入设定库”或等价中文提示。
  5. 查看 `storyboard_table` / `video_node` preview，确认本轮没有应用写入按钮或明确提示后续步骤处理。
- 预期结果：
  - production_bible preview 可确认写入设定库。
  - 写入前有确认。
  - 重复写入被阻止。
  - 写入结果保留 workflow 追溯。
  - storyboard_table / video_node preview 本轮不会应用。
  - 不写入分镜 / 画布节点。

#### v0.2.62：M6.10.3-A Seedance 阶段产物映射预览

- 入口：`/projects/:id` 项目详情页或画布页“Agent 设置”中的“多 Agent 工作流预设”。
- 操作步骤：
  1. 将任一阶段推进到 approved。
  2. 点击该阶段的“生成映射预览”。
  3. 查看 preview 的 targetType、草案条目、mappedFields 和 warnings。
  4. 对未 approved 阶段重复上述操作，确认按钮禁用并显示中文原因。
- 预期结果：
  - approved 阶段可生成映射预览。
  - 未 approved 阶段不可生成。
  - 三阶段 targetType 展示正确。
  - warnings 展示正确。
  - 不写入设定库 / 分镜 / 画布节点。

#### v0.2.61：M6.10.2 Seedance 三阶段 workflow 状态、审核证据和产物存储

- 入口：`/projects/:id` 项目详情页或画布页“Agent 设置”中的“多 Agent 工作流预设”。
- 操作步骤：
  1. 打开 Seedance workflow 区域，确认三阶段状态、Agent、最近产物摘要、审核证据数量和阻塞原因正常展示。
  2. 在导演分析未批准前，确认服化道美术设计和 Seedance 分镜师阶段不可运行并显示中文阻塞原因。
  3. 运行导演分析文本草案，确认成功后阶段进入 review 并保存阶段产物。
  4. 填写可选审核备注后批准 / 驳回，确认保存审核证据和备注。
  5. 批准前置阶段后，确认下一阶段解除阻塞；驳回前置阶段后，后续阶段仍保持阻塞。
- 预期结果：
  - 三阶段状态展示正确。
  - 后置阶段在前置未批准前被阻塞。
  - 文本 Runner 成功后进入 review。
  - 批准 / 驳回保存审核证据。
  - 审核备注可保存。
  - 产物只存在 workflow 阶段产物中。
  - 不写入设定库 / 分镜 / 画布节点。
  - 不触发图片或视频生成。

#### v0.2.60：M6.10.1 Seedance 工作流阶段文本 Runner

- 入口：`/projects/:id` 项目详情页“Agent 设置”中的“多 Agent 工作流预设”。
- 操作步骤：
  1. 在每个阶段卡片点击“运行文本草案（文本执行）”。
  2. 观察运行记录，确认进入 running 后在失败时显示错误，在成功时生成待审核文本产物。
  3. 展开运行记录详情，确认 `workflowTextOutput` 包含 `rawText`、`summary`、`outputFormat`、`stageId`、`agentId`、`workflowId`、`sourceFiles`、`qualityGateIds`、`createdAt`。
  4. 点击“批准”或“驳回”，确认仅更新记录状态。
- 预期结果：
  - workflow stage 可触发文本 Runner。
  - 成功后生成待审核文本产物。
  - 失败时记录错误。
  - 批准 / 驳回只改变 Runner 状态。
  - 不写入设定库 / 分镜 / 画布。
  - 不触发图片或视频生成。

### 当前必须验收

#### v0.2.59：M6.10.0 Seedance 多 Agent 工作流预设导入

- 入口：`/projects/:id` 项目详情页“Agent 设置”。
- 操作步骤：
  1. 打开 Agent 设置中心，确认能看到“多 Agent 工作流预设”区域。
  2. 选择 `Seedance 2.0 分镜师团队`，确认显示三阶段：导演分析、服化道美术设计、Seedance 分镜师。
  3. 检查三阶段顺序和职责是否正确，确认每阶段展示对应 Agent 职责、输入摘要、输出摘要、技能包和质量门。
  4. 展开来源文件清单，确认 `project.config.json`、`AGENTS.md`、三个 `agents/*.md`、阶段 skills、templates、examples、`industrial-quality-rules.md` 和工具文件可追溯。
  5. 切换“启用”和“已选择”，点击“保存 workflow 选择”，刷新页面后重新打开 Agent 设置中心，确认项目级选择仍保留。
  6. 同时检查原有单 Agent 配置、项目覆盖、预览 Run 创建入口仍按 M6.9 行为工作。
- 预期结果：
  - workflow preset 只保存结构化摘要和来源，不把超长 agent / skill 原文塞进 UI 或 store。
  - 保存项目级 workflow 选择不影响已有单 Agent 配置覆盖。
  - 不会触发真实 LLM，不会执行 workflow，不会生成图片或视频，不会触发扣费，不会改后端。
- 失败影响：
  - 如果来源文件不可追溯，后续 M6.10.1 / M6.10.2 无法安全接真实执行和审核证据。
  - 如果保存 workflow 选择污染单 Agent 配置，M6.9 的资产提取 / 分镜草案入口可能失效。
  - 如果预设导入阶段出现执行行为，可能提前引入扣费或业务数据污染风险。

#### v0.2.58：P3-C / M6.9.7 视频节点自动带入本集资产参考

- 入口：`/canvas/:id` 画布工具栏“本集工作台”中的“生成镜头组 / 生成管理”。
- 操作步骤：
  1. 准备同一项目、同一集下的本集生图需求，并通过 Brief 产生 `primaryAssetId` 或 `resultAssetIds`。
  2. 创建包含角色、场景、道具或氛围需求的生成镜头组，确认镜头组卡片显示“将带入 X 个本集参考资产”或来源待确认提示。
  3. 点击“加入画布”，确认弹窗展示素材缩略图、标题、资产类型、匹配原因、来源、是否主参考图和素材版本。
  4. 取消某个参考资产勾选后确认加入画布，检查该素材没有写入视频配置节点。
  5. 来源待确认的素材默认不勾选；用户手动勾选后才写入。
  6. 检查视频配置节点 metadata 的 `references / referenceAssets / referenceRoles / referenceOrder`，确认自动参考排在手动绑定素材之后，且重复素材不会重复写入。
  7. 检查 `referenceAssets` 中保留 `sourceType / sourceLabel / matchReasons / assetVersion / assetBreakdownItemId / imageBriefId`。
  8. 回到生成管理区，确认已入画布的镜头组展示参考资产数量。
- 预期结果：
  - 匹配范围严格限制同 `projectId + episodeId`，不跨项目、不跨集、不使用没有结果素材的需求。
  - 优先使用 Brief 主参考图；没有主参考图时使用结果素材。
  - 用户确认前不写入视频节点，不自动生成图片、视频或扣费。
  - 本轮不接真实 LLM，不改后端，不改旧 localforage key。
- 失败影响：
  - 如果跨项目或跨集带入素材，视频生成会污染项目资产边界。
  - 如果未确认就写入，自动匹配可能把错误资产带入生成链路。
  - 如果不保存素材版本快照，后续素材更新会导致视频节点引用不可追溯。

#### v0.2.58：P3-C / M6.9.R1 Agent 化工作台结构收口

- 入口：代码结构与回归验收；重点页面为 Agent 设置中心、本集工作台、Brief 工作台和镜头组加入画布。
- 操作步骤：
  1. 打开 Agent 设置中心，确认默认配置、项目覆盖、禁用状态和模板变量仍正常。
  2. 运行资产提取、分镜导演、本集生图需求创建 Brief、镜头组加入画布，确认各环节仍要求用户确认。
  3. 检查 Agent run、资产拆解、Brief、分镜头表和视频配置节点是否都保留 `agentRunId / agentConfigId / agentConfigVersion` 等追溯字段。
  4. 回归旧的 M6.9.5 / M6.9.6 流程，确认分镜草案审核写入、已有分镜追加 / 覆盖、镜头组视频节点创建不受影响。
- 预期结果：
  - Agent 配置合并、模板变量填充、输出结构校验、写入预览摘要、本集生图需求摘要、分镜草案 trace、视频参考匹配和合并均有纯函数与测试覆盖。
  - M6.9 仍是单环节可配置 Agent 工作台；不引入 M6.10 的 Seedance 多 Agent 工作流执行。
  - 不改后端、不接真实 LLM、不引入 LangGraph / AutoGen / Dify。
- 失败影响：
  - 如果结构收口后回归失败，M6.10 会在不稳定的工作台基础上继续膨胀。
  - 如果 M6.9/M6.10 边界混淆，可能提前引入真实模型调用或多 Agent 状态复杂度。

#### v0.2.56：P3-B / M6.9.5 分镜草案 Agent 接入

- 入口：`/canvas/:id` 画布工具栏“本集工作台”中的“分镜头表”区域。
- 操作步骤：
  1. 准备已绑定本集剧本快照的画布，打开本集工作台，确认分镜头表入口显示为“运行分镜导演”或等价 Agent 入口。
  2. 在 Agent 设置中心确认 `storyboard_director` 启用，并测试项目级覆盖优先于全局默认配置。
  3. 点击“运行分镜导演”，确认只创建一条 `storyboard_director` Agent Runner 草案记录，状态为待审核，不直接写入分镜头表。
  4. 展开 run 详情，确认 input 包含 `projectId / canvasId / episodeId / episodeTitle / scriptId / scriptSnapshot / sourceType: episode_script / variables`，run 记录包含 `agentKind / agentConfigId / agentConfigVersion`。
  5. 检查草案输出包含 `shotNumber / sceneId / sceneName / location / scriptText / visualDescription / characterAction / dialogue / emotion / shotSize / estimatedDuration / assetNeeds / warnings`。
  6. 不批准或点击“驳回”后，确认不会写入业务分镜头表。
  7. 批准 run 后点击“写入分镜头表”；当前已有分镜头时，确认必须选择“追加”或“覆盖”，也可以取消。
  8. 写入成功后，确认分镜头表条目保留 `agentRunId / agentConfigId / agentConfigVersion / inputScriptSnapshotHash / sourceType: agent_storyboard_director`，run 状态变为 `applied`。
  9. 清空或解除剧本快照后再次运行，确认不能创建 run；禁用 `storyboard_director` 后再次运行，确认提示去 Agent 设置中心启用。
- 预期结果：
  - 第一版继续使用本地规则 / mock runner 生成结构化草案，不接真实 LLM。
  - 草案必须先进入 Agent Runner 待审核状态，用户批准并确认写入前不改业务数据。
  - 写入已有分镜头表前必须明确追加或覆盖，不静默覆盖用户编辑内容。
  - 本轮不改后端、不自动生成图片或视频、不自动扣费。
- 失败影响：
  - 如果未批准 run 可以写入，Agent 化工作台会失去人工确认边界。
  - 如果缺少 Agent 配置和剧本快照追溯，后续 M6.9.R1 无法回查草案来源。
  - 如果禁用配置仍能运行，Agent 设置中心的项目级控制会失效。

#### v0.2.56：P3-B / M6.9.6 镜头组加入画布改为视频生成节点

- 入口：`/canvas/:id` 画布工具栏“本集工作台”中的“生成镜头组 / 生成管理”；或视频生产台里的生成镜头组列表。
- 操作步骤：
  1. 准备已创建的生成镜头组，并在镜头组中绑定图片、参考视频和音频素材。
  2. 点击“加入画布”前，确认页面仍要求用户确认，不会自动创建节点。
  3. 确认后检查画布，主生成入口应为视频生成配置节点；可以保留文本说明节点，但文本节点不能作为主生成入口。
  4. 检查视频配置节点 metadata 是否包含 `prompt / finalPrompt / duration / seconds / ratio / size / provider / model`。
  5. 检查同一节点 metadata 是否包含 `references / videoReferences / audioReferences / referenceAssets / referenceRoles / referenceOrder`，且重复素材不会重复写入。
  6. 检查本集和镜头组追溯字段：`episodeId / episodeTitle / shotGroupId / shotIds / storyboardShotGroupId / storyboardTableShotIds / agentRunId / agentConfigId / agentConfigVersion / sourceType: shot_group`。
  7. 检查来自“我的素材”的参考节点和 `referenceAssets` 继续保存 `assetVersion` 快照。
  8. 加入画布后回到本集工作台“生成管理”，确认镜头组显示已入画布。
  9. 确认节点创建后不会自动触发真实视频生成，只有用户手动点击生成才进入既有视频生成流程。
- 预期结果：
  - 镜头组加入画布只创建节点和连线，不接真实 LLM、不自动生成视频、不自动扣费。
  - 视频配置节点承接图片、视频、音频参考槽位，并保持已有视频生成节点逻辑可用。
  - 本轮不做自动带入本集资产参考图；该能力留到 P3-C / M6.9.7。
- 失败影响：
  - 如果仍以文本节点作为主入口，用户需要重新手工搭建视频生成配置，M6.9.7 无法自动落槽。
  - 如果参考素材或版本快照丢失，生成结果无法追溯到正确素材版本。
  - 如果节点创建即触发生成，可能造成误扣费。

#### v0.2.54：M6.9.4 本集生图需求接入 Brief / 生图链路

- 入口：`/canvas/:id` 画布工具栏“本集工作台”中的“本集生图需求”；从该区域点击“创建 Brief / 打开 Brief”会进入现有“生图 Brief 工作台”。
- 操作步骤：
  1. 先用 M6.9.3 资产提取 Agent 批准并写入本集生图需求，或准备已有资产拆解条目。
  2. 打开本集工作台，确认“本集生图需求”区域按当前 `projectId + canvasId + episodeId` 展示需求。
  3. 分别切换 `character / scene / prop / costume / makeup / mood / effect` 类型筛选，确认服装 / 妆发 / 特效等 Agent 原始类型不会丢失。
  4. 检查每条需求是否展示名称、类型、描述、重要度、建议 Brief 类型、来源、Brief 状态、结果素材数量、主参考图和状态。
  5. 对未建 Brief 的需求点击“创建 Brief”，确认只在用户点击后创建，并回写需求 `briefId / status`。
  6. 再次点击同一需求“打开 Brief”，确认打开已有 Brief，不重复创建。
  7. 在 Brief 表单中编辑结构化字段、参考素材、检查模式和最终提示词，确认沿用标准 / 提醒 / 自由模式校验。
  8. 从 Brief 点击创建图片生成配置节点，确认标准模式 error 会阻止，提醒模式 warning 会二次确认；成功后只新增配置节点，不自动开始图片生成。
  9. 手动触发该配置节点生成图片后，确认素材自动入库，Brief `resultAssetIds / primaryAssetId` 更新，本集生图需求 `assetIds / status` 更新，重复 assetId 不重复写入。
  10. 在 Brief 结果区切换主参考图并同步来源，确认本集生图需求区域展示新的主参考图，但素材本体和素材版本历史不被改写。
- 预期结果：
  - 本集生图需求继续复用 `infinite-canvas:asset_breakdown_store` 和 `infinite-canvas:image_brief_store`，不新增孤立体系，不改旧 localforage key。
  - Brief metadata、配置节点 metadata、素材 `metadata.generation` 都能追溯 `briefId / assetBreakdownItemId / agentRunId / agentConfigId / agentConfigVersion / episodeId / episodeTitle / sourceType / finalPrompt`。
  - 写入 Brief、创建图片配置节点、同步结果都需要用户明确点击。
  - 本轮不改后端、不接真实 LLM、不新增图片生成接口、不自动生成图片、不自动扣费。
- 失败影响：
  - 如果需求创建 Brief 后不能回写 `briefId`，后续会重复创建 Brief 或丢失追溯。
  - 如果配置节点或素材 metadata 缺少 Agent run / 本集字段，生成结果无法回查是哪次资产提取产生的需求。
  - 如果自动生成图片或自动扣费，违反 M6.9 的用户确认边界。

#### v0.2.53：M6.9.3 资产提取 Agent 与本集生图需求

- 入口：`/projects/:id` 项目详情页“剧本 / 本集工作台”；或 `/canvas/:id` 画布工具栏“本集工作台”。
- 操作步骤：
  1. 打开未绑定剧本的画布进入本集工作台，确认“资产提取”按钮不可用，并提示先导入或绑定剧本。
  2. 绑定已有分集或粘贴导入本集剧本后，确认“资产提取”可运行。
  3. 点击“运行资产提取”，确认只新增一条 Agent Runner 草案记录，状态为待审核，不直接写入资产拆解 / 本集生图需求。
  4. 展开草案详情，确认能看到 summary、items、rawJson、warnings 和 proposedActions。
  5. 检查草案 items 至少覆盖角色、场景、道具、服装 / 妆发、情绪氛围、特效需求中的可识别项，并包含 `id / kind / name / description / scriptEvidence / importance / suggestedBriefKind / tags / source / warnings`。
  6. 点击“驳回”，确认不会写入资产拆解列表。
  7. 重新运行并点击“批准”，再点击“写入本集生图需求”，确认需要二次确认。
  8. 确认写入后，打开资产拆解 / 本集生图需求列表，确认新增需求带有本集上下文和 `agentRunId / agentConfigId / agentConfigVersion / sourceType: agent_asset_extractor` 追溯字段。
  9. 对同一剧本重复运行并写入，确认同集同类同名资产会合并，不会无限重复添加。
  10. 在 Agent 设置中心禁用“资产提取 Agent”后再运行，确认不能创建 run，并提示去 Agent 设置中心启用。
- 预期结果：
  - 资产提取必须读取 Agent 设置中心中的 `asset_extractor` 配置，项目级覆盖优先。
  - Agent 输出先进入 `infinite-canvas:agent_runner_store` 的草案 / 待审核状态，用户批准前不写业务数据。
  - 批准并确认写入后，草案转换为现有 `asset_breakdown_store` 中的本集生图需求，后续可继续复用“创建 Brief”链路。
  - 本轮不接真实 LLM、不自动写入、不自动创建 Brief、不自动生图、不触发生成或扣费。
- 失败影响：
  - 如果草案绕过 Runner 或未批准就写入，后续 Agent 链路会失去用户确认边界。
  - 如果资产需求不进入现有资产拆解 store，M6.9.4 接 Brief / 生图链路会形成新的数据孤岛。

#### v0.2.52：M6.9.2 剧本入口调整与独立工作台

- 入口：`/projects/:id` 项目详情页“工作流”中的“剧本 / 本集工作台”；`/canvas/:id` 画布工具栏“视频生产台 / 本集工作台”。
- 操作步骤：
  1. 在项目详情页点击“剧本 / 本集工作台”，确认直接打开独立工作台抽屉，不先跳转到画布。
  2. 当前项目有多个画布时，确认工作台顶部可以选择要进入的画布 / 集数。
  3. 当前项目没有画布时，确认工作台显示“新建一集画布并导入剧本”入口；点击后进入新建画布弹窗。
  4. 打开一个已绑定 `episodeId / scriptSnapshot` 的画布，点击本集工作台，确认直接进入当前集工作台。
  5. 打开一个未绑定剧本的画布，点击本集工作台，确认自动弹出“绑定或导入本集剧本”窗口。
  6. 在导入窗口分别测试“从项目已有分集选择”“粘贴 / 导入本集剧本”“不绑定剧本，继续自由画布制作”。
  7. 已有剧本快照、分镜头或生成镜头组时重新绑定 / 导入，确认必须弹确认，不会静默覆盖。
  8. 导入或绑定成功后，确认只更新画布本集上下文，不自动创建 Agent run、不自动生成资产草案、不自动生成分镜草案、不触发图片 / 视频生成。
  9. 在本集工作台内确认“Agent 设置”入口和 M6.9.1 运行记录区域仍可打开。
- 预期结果：
  - 项目页可以直接进入剧本生产线，画布不再是剧本入口的必经跳板。
  - 画布页未绑定剧本时会主动引导导入 / 绑定，但用户仍可选择自由画布制作。
  - 旧画布不被强制绑定剧本，自由画布路径继续保留。
  - 本轮不接真实 LLM、不新增 Agent 执行能力、不自动运行 Agent、不自动生成或扣费。
- 失败影响：
  - 如果项目页仍必须跳回画布，后续 M6.9.3 资产提取 Agent 会缺少清晰入口。
  - 如果未绑定画布不能明确导入或选择自由模式，用户会误以为剧本绑定是强制迁移。

#### v0.2.51：M6.9.1 Agent Runner 协议与运行记录底座

- 入口：`/projects/:id` 项目详情页“工作流”中的“Agent 设置”，或 `/canvas/:id` 打开“视频生产台”后进入“Agent 设置”。
- 操作步骤：
  1. 打开 Agent 设置中心，选择一个已启用的 Agent。
  2. 点击“创建预览 Run”，确认下方“运行记录”区域新增一条记录。
  3. 检查记录中能看到 Agent 类型、状态、配置版本、来源、本集信息、创建时间和摘要。
  4. 展开记录详情，确认能查看 `draftOutput / rawJson / proposedActions`。
  5. 点击“批准”，确认状态变为“已批准”；再新建一条预览 Run 后点击“驳回”，确认状态变为“已驳回”。
  6. 将当前 Agent 停用并保存项目配置，再尝试创建预览 Run，确认创建被阻止并给出提示。
  7. 验证批准或驳回后，不会新增素材、分镜、Brief、画布节点，也不会触发图片 / 视频生成。
- 预期结果：
  - Agent Runner 运行记录保存到本地 `infinite-canvas:agent_runner_store`，只保存草案、动作预览和 HITL 状态。
  - 创建 run 必须读取 Agent 设置中心的有效配置，并记录 `agentConfigId / agentConfigVersion`。
  - 禁用 Agent 不能创建 run；未批准的 run 不能进入已应用状态。
  - 第一版不接真实 LLM、不做 Agent 自主调度、不自动写入业务数据、不触发真实生成或扣费。
- 失败影响：
  - 如果 Runner 记录不可用，后续资产提取、分镜草案、生图 Brief 和视频提示词 Agent 将缺少统一草案 / 审核 / 应用底座。
  - 如果禁用或批准边界失效，后续 Agent 写入链路可能绕过用户确认。

#### v0.2.50：我的素材画布归类

- 入口：`/assets` 我的素材页面。
- 操作步骤：
  1. 在“画布”筛选中选择一张画布，再导入图片、视频或音频素材。
  2. 确认导入成功提示中包含“已归类到”当前画布。
  3. 选择多个素材，点击“归类画布”，在弹窗中多选不同画布并确认。
  4. 切换“画布”筛选到对应画布，确认同一个素材可以出现在多个画布归类下。
  5. 打开素材详情，确认能看到“画布归类”标签列表。
  6. 选择素材后点击“移出画布”，确认只移除归类关系，不删除素材本体。
- 预期结果：
  - 素材文件只保存一份，但可以同时归类到多个画布。
  - 画布归类用于筛选和整理素材，不影响文件夹、项目库、标签、版本和加白信息。
  - 删除画布归类不会删除素材，删除素材仍按原逻辑移出我的素材。
- 失败影响：
  - 如果画布归类不可用，同一项目多个画布之间仍需要靠文件夹或标签手动区分素材，整理成本较高。

#### v0.2.50：视频生产台 @素材与布局优化

- 入口：`/canvas/:id` 画布工具栏“视频生产台”，编辑任一“生成镜头组”。
- 操作步骤：
  1. 打开视频生产台，确认抽屉标题、顶部画布选择和主要工作区布局更贴近视频生产流程。
  2. 进入“生成镜头组”编辑弹窗，在“视频提示词”中输入 `@`，确认能看到我的素材中的图片、视频和音频候选。
  3. 选择图片素材，确认提示词中插入 `图片 1`，并自动写入“图片 / 参考视频资产”。
  4. 选择参考视频素材，确认提示词中插入 `视频 1`，并自动写入“图片 / 参考视频资产”。
  5. 选择音频素材，确认提示词中插入 `音频 1`，并自动写入“音频资产”。
  6. 保存镜头组后点击“打组加入画布”，确认生成的视频配置节点继续带上所选素材引用。
- 预期结果：
  - 视频生产台的镜头组提示词输入体验和视频节点一致，支持通过 `@` 完成素材引用。
  - `@` 选择不只插入文字，也同步更新镜头组资产绑定，避免加入画布后丢参考素材。
  - 已有手动选择素材、音频和设定引用的能力保持可用。
- 失败影响：
  - 如果 @ 候选或自动绑定失败，生产台生成镜头组仍会出现提示词里提到素材但视频节点没有真实参考输入的问题。

#### v0.2.50：M6.9.0 Agent 设置中心

- 入口：`/projects/:id` 项目详情页“工作流”中的“Agent 设置”；`/canvas/:id` 打开“视频生产台”后点击顶部“Agent 设置”。
- 操作步骤：
  1. 打开项目详情页，进入工作流区域，确认能看到“Agent 设置”入口。
  2. 打开视频生产台，确认顶部有“Agent 设置”快捷入口。
  3. 打开 Agent 设置中心，确认内置 5 类 Agent：资产提取、分镜导演、生图 Brief、视频提示词、提示词质检。
  4. 切换每个 Agent，确认能查看并编辑系统提示词、用户提示词模板、输入变量说明、输出 JSON 示例 / Schema、模型偏好、temperature、最大输出、推理程度、写入策略和启用状态。
  5. 点击“复制默认到项目”，确认当前 Agent 出现项目覆盖标记。
  6. 修改提示词或参数后点击“保存项目配置”，刷新页面后重新打开，确认项目级覆盖仍保留。
  7. 点击“恢复默认模板”，确认只恢复表单内容；未保存前不应写入项目覆盖。
  8. 点击“移除项目覆盖”，确认该 Agent 回到默认配置。
  9. 将某个 Agent 停用，确认列表中显示不可用状态；后续调用入口应能读取该禁用配置。
- 预期结果：
  - Agent 设置保存到本地 `infinite-canvas:agent_settings_store`，不改后端、不改旧 localforage key。
  - 所有 Agent 写入策略默认是“确认后写入”，输出默认只作为草案或预览。
  - 本轮不接真实 LLM、不做 Agent 自主调度、不自动写入业务数据、不触发真实生成或扣费。
  - 项目级覆盖不会污染代码内默认模板。
- 失败影响：
  - 如果设置中心不可用，后续资产提取、分镜草案、生图 Brief、视频提示词可能继续把 Agent 提示词散落在各工作台中。
  - 如果禁用或写入策略不可靠，后续 Agent 调用可能绕过用户确认边界。

#### v0.2.48：M6.8 本集工作台收口完整批次

- 入口：`/canvas/:id` 画布工具栏“本集工作台”、画布顶部本集状态条、`/projects/:id` 项目详情页“工作流”中的“本集工作台”。
- 操作步骤：
  1. 打开一个未绑定剧本的画布，确认画布顶部显示“未绑定剧本”，本集工作台提供绑定已有分集或导入本集剧本入口。
  2. 在本集工作台导入一集剧本，确认顶部总览展示当前集数、剧本状态、资产拆解状态、分镜头数量、生成镜头组数量、已生成视频数量和失败数量。
  3. 编辑剧本快照并保存；如果已有分镜头表，确认保存或重新导入前有明确确认，不会静默覆盖分镜头。
  4. 点击“从剧本生成草案”，确认分镜头表按场次 / 场景折叠展示，行内可见镜头编号、剧本文本、画面描述、人物动作、对白、情绪、景别、预计时长、状态和资产需求。
  5. 对分镜头逐条新增、编辑、删除和排序，并标记角色、场景、道具、服化道、音频、参考视频、特殊效果等资产需求。
  6. 选择同一场次 / 同一场景 / 连续且总时长不超过 15 秒的分镜头组合生成镜头组，确认非法组合会被阻止。
  7. 在生成镜头组中编辑提示词草稿 / 最终提示词，插入提示词仓库模板，绑定图片、音频、参考视频和设定库引用。
  8. 绑定来自资产拆解的素材和独立生图工作台素材，确认生成镜头组能区分剧本拆解资产与独立素材来源。
  9. 点击“打组加入画布”，确认需要用户明确点击 / 确认，不自动触发真实视频生成；画布节点 metadata 写入 `episodeId / shotGroupId / shotIds / storyboardShotGroupId / storyboardTableShotIds`。
  10. 手动触发画布视频生成后，确认本集工作台“生成管理”能展示未入画布、已入画布、生成中、成功、失败、待重试状态，以及 `taskId / aiTaskId / 扣费状态 / 失败原因 / 结果素材 / 主版本`。
  11. 对失败组点击重新加入画布或重试现有配置节点，确认不会绕过用户确认。
  12. 从项目详情页打开本集工作台，确认可以查看项目画布和本集状态；需要加入画布或重试时会引导到具体画布，不在项目页自动生成。
- 预期结果：
  - 剧本、分镜头表、生成镜头组和生成管理都集中在本集工作台，不再要求用户在多个抽屉之间理解流程。
  - 画布仍保留自由创作路径，未绑定剧本或自由画布镜头不会被强制迁移。
  - 本集工作台只做状态管理、节点创建和回流展示，不接真实 LLM，不自动触发视频生成或扣费。
  - 本轮未新增 localforage key，旧画布没有 episode 信息时仍可打开。
- 失败影响：
  - 如果入口或状态总览不清楚，用户仍不知道当前一集应该先补剧本、分镜、资产还是生成。
  - 如果镜头组选中校验失效，可能创建跨场景或超过 15 秒的生成单元，影响 Seedance 视频任务质量。
  - 如果结果回流失败，生成成功的视频无法在本集工作台追溯到生成镜头组和素材版本。

#### v0.2.49：画布新建节点目录与定位规则

- 入口：`/canvas/:id` 画布页面。
- 操作步骤：
  1. 在画布空白处双击，确认只弹出节点目录，不会立刻创建文本节点；选择文本、图片、视频、音频或配置后才创建对应节点。
  2. 连续点击底部工具栏的新建文本、图片、视频、音频和配置节点按钮。
  3. 从已有节点连线拖出，即使松手位置离源节点较远，也在弹出的创建菜单中新建节点。
  4. 在已有节点附近拖拽上传图片 / 视频 / 音频文件。
  5. 从素材库插入图片 / 视频 / 音频，或通过助手插入文本 / 图片。
  6. 复制一个已有节点。
- 预期结果：
  - 双击空白画布是“打开节点目录”，用户选择后才新增节点。
  - 底部工具栏连续新建节点时，节点始终基于当前选中节点或上一个节点向右追加；如果右侧位置被占用，只继续向右寻找空位，不上下左右跳动。
  - 连线拖出创建的新节点距离源节点较近，按连线方向出现在源节点左侧或右侧，不跟随很远的鼠标松手点。
  - 拖拽上传、素材库插入、助手插入和复制节点仍优先出现在原本期望的位置；如果该位置与已有节点重叠，会自动移动到最近的空位。
  - 新节点尺寸、内容、素材引用、配置参数、选中状态和原有弹窗行为不变。
  - 分镜组 / 生成镜头组这类成组插入仍保持自己的结构化排布。
- 失败影响：
  - 双击可能误创建节点，或连续点击工具栏时新节点位置不稳定，导致用户需要频繁手动整理画布。

#### v0.2.43：Linux.do 登录移除

- 入口：`/canvas/:id` 画布页面、`/login` 登录页、后台 `/admin/settings`、后台 `/admin/users`。
- 操作步骤：
  1. 打开 `/login`，确认只显示账号密码登录 / 注册入口，不再显示 Linux.do 登录文案和按钮。
  2. 打开后台系统设置，确认不再显示 Linux.do OAuth 配置卡片。
  3. 打开后台用户列表，确认不再展示 Linux.do 列，关键词搜索占位不再提到 Linux.do。
  4. 访问 `/api/auth/linux-do/authorize`，确认后端不再注册该登录路由。
- 预期结果：
  - Linux.do 登录入口、配置入口和 OAuth 路由均不可用。
  - 用户表历史第三方字段仍保留，不做数据库迁移。
- 失败影响：
  - 如果 Linux.do 入口仍可见或路由仍可调用，登录方式删除不完整。

#### M10.0：云端资产方案冻结文档

- 入口：`docs/cloud-assets-plan.md`、`docs/todo.md`。
- 操作步骤：
  1. 阅读 `docs/cloud-assets-plan.md`，确认 M10.1 / M10.2 / M10.3 阶段边界清楚。
  2. 检查规划表草案是否覆盖 `files`、`project_assets`、`project_asset_versions`、`project_asset_folders`、`project_members`、`project_asset_activities`。
  3. 检查对象存储抽象是否包含 provider、bucket、objectKey、mimeType、bytes、checksum、signedUrl 和 upload session。
  4. 检查本地与云端双轨字段是否明确 `storageKey / fileId / projectAssetId / projectAssetVersionId / syncStatus`。
  5. 检查权限模型是否明确 `owner / admin / editor / viewer`。
  6. 检查迁移策略是否说明本地素材加入项目资产库、画布节点从 `storageKey` 过渡到 `fileId`、旧本地项目继续可用。
- 预期结果：
  - M10.0 只冻结技术方案，不写业务代码、不改数据库、不实现对象存储。
  - 规划表只出现在 `docs/cloud-assets-plan.md`，不会被误写进当前数据库现状文档。
  - 后续 M10.1 开工前，第一版不做事项已经明确：不实时协同、不自动迁移所有本地素材、不无引用计数物理删除云端对象、不静默覆盖本地或远端数据。
- 失败影响：
  - 如果方案边界不清，M10.1 可能在文件底座阶段提前混入项目资产库、云同步或自动迁移，增加后续返工风险。

#### M8.R1：追溯链路结构收口与自查

- 入口：画布生成图片 / 视频、`/assets` 素材详情“生成信息”、后台 `/admin/ai-tasks`。
- 操作步骤：
  1. 用云端渠道分别触发图片生成和视频生成，确认节点 metadata 仍写入 `aiTaskId / upstreamTaskId / creditLogId`。
  2. 生成成功后打开素材详情，确认 generation metadata 中的项目、画布、节点、分镜、生成镜头组和账本字段含义与 M8 一致。
  3. 打开后台 AI 任务日志详情，确认 `frontendArtifacts` 仍能看到素材 `assetId`、画布 `canvasId / nodeId`、分镜和生成镜头组字段。
  4. 切换到本地直连模式，确认请求不会附加 `X-Infinite-Canvas-Trace`，也不会写云端 `ai_tasks`。
  5. 对已有 Ark 视频任务执行刷新，确认不会覆盖已经反写的 `response_json.frontendArtifacts`。
- 预期结果：
  - 本轮不新增 UI 或业务功能，只把 trace / metadata / artifact 构造函数集中到可测试工具中。
  - 图片生成、视频生成、重试生成和素材自动入库的追溯字段保持原行为。
  - 纯函数测试覆盖 trace header、本地直连边界、ledger 读取、artifact payload 构造。
- 失败影响：
  - 如果收口引入回归，前台生成素材和后台任务账本的互查链路可能重新断开。

#### M8：生成历史与任务日志打通

- 入口：画布图片 / 视频节点、`/assets` 我的素材详情“生成信息”、后台 `/admin/ai-tasks`。
- 操作步骤：
  1. 用云端渠道在画布生成一张图片，确认图片节点信息中展示 `aiTaskId / upstreamTaskId / 账本状态 / 扣费 / Credit Log`。
  2. 用云端渠道创建一个 Seedance 视频任务，确认视频节点进度详情中展示 `taskId / aiTaskId / upstreamTaskId / 任务状态 / 失败原因 / 扣费返还摘要`。
  3. 生成成功后打开“我的素材”详情，确认 `metadata.generation` 展示账本任务、上游 taskId、扣费点数、返还状态、创建 / 完成时间。
  4. 打开后台“AI 任务日志”，确认列表有“前台产物”列，详情中可看到关联素材 `assetId`、画布 `canvasId / nodeId`、分镜 `storyboardGroupId / storyboardShotId`、生成镜头组 `shotGroupId / shotIds`。
  5. 在任务详情检查 `request_json / response_json` 仍然脱敏，不出现 API Key、token、secret、完整 base64、`data:` 或 `blob:` 长内容。
  6. 本地直连模式生成时，确认不会强行写入云端 `ai_tasks`，也不会向上游发送云端 trace header。
- 预期结果：
  - 前台生成节点、自动归档素材和后台 `ai_tasks` 可互相追溯。
  - 前台素材入库后会把 `assetId` 反写到对应任务的 `response_json.frontendArtifacts`，不新增后端表结构。
  - 后续刷新 Ark 视频状态不会覆盖已经反写的前台产物记录。
- 失败影响：
  - 生成结果无法按任务账本追溯扣费、返还和上游 taskId，排查失败任务和定位素材来源会变困难。

#### M6.7.3：Brief 导出为美术设定表 / 生图提示词表

- 入口：`/projects/:id` 项目详情页“生图 Brief”；或 `/canvas/:id` 画布工具栏“生图 Brief”。
- 操作步骤：
  1. 打开 Brief 工作台，选择“美术设定表 / 生图提示词表 / 分镜资产表”任一导出视图。
  2. 点击“导出 CSV”，确认下载文件可打开，中文、逗号、换行和双引号内容没有错列。
  3. 点击“导出 JSON”，确认导出内容包含当前筛选后的 Brief 行。
  4. 检查导出字段是否包含 Brief 类型、标题、来源类型 / 来源 ID、集数上下文、剧本片段、结构化字段摘要、参考素材、finalPrompt、结果素材、主参考图和状态。
  5. 确认导出动作不修改 Brief、素材、资产拆解、设定库或分镜数据。
- 预期结果：
  - 第一版只导出 CSV / JSON，不做复杂 Excel 样式。
  - 三种导出视图字段各有侧重：美术设定表偏结构化字段，生图提示词表包含 finalPrompt，分镜资产表偏来源和结果资产。
  - 空列表时会提示暂无可导出 Brief，不写入业务数据。
- 失败影响：
  - Brief 无法交给外部美术或批量生图流程复核，生产链路仍停留在页面内。

#### M6.7.2：Brief 结果版本对比与主参考图强化

- 入口：`/projects/:id` 项目详情页“生图 Brief”；或 `/canvas/:id` 画布工具栏“生图 Brief”。
- 操作步骤：
  1. 打开一个已有多个结果素材的 Brief，确认“生成结果”区域按主参考图优先展示。
  2. 检查每个结果是否展示素材标题、生成时间、模型、provider、finalPrompt 摘要、参考素材数量和素材当前版本号。
  3. 点击非主结果的“设为主参考”，确认只更新 Brief 的 `primaryAssetId`，不修改素材本体。
  4. 对来源为资产拆解或设定库的 Brief，点击主参考的“同步到来源”，确认资产拆解 `assetIds` 或设定库 `assetRefs` 更新，且版本引用仍由素材版本引用工具保留。
  5. 打开素材详情，确认素材版本历史本身没有被 Brief 主参考切换改写。
- 预期结果：
  - Brief 可以查看多次出图结果，并明确哪个结果是主参考图。
  - 主参考图切换只写 Brief；同步到来源必须由用户显式点击。
  - 素材版本号只读取展示，不改变 M7.2 / M7.2.2 / M7.2.3 的版本历史和引用锁定逻辑。
- 失败影响：
  - 多次出图结果无法比较，角色 / 场景 / 道具主参考沉淀会不清晰。
  - 如果同步误改素材本体或版本历史，可能破坏项目素材引用追溯。

#### M6.7.R1：Brief 工作台结构收口

- 入口：`/projects/:id` 项目详情页“生图 Brief”；或 `/canvas/:id` 画布工具栏“生图 Brief”。
- 操作步骤：
  1. 打开 Brief 工作台，确认列表、筛选、新增、编辑、删除、复制、创建图片配置节点仍可用。
  2. 打开已有 Brief，确认结果素材列表、设主参考图、打开素材详情仍保持 v0.2.36 行为。
  3. 从资产拆解、设定库、分镜生成表创建 Brief，确认写入和回显仍正常。
  4. 用 reminder warning 的 Brief 创建配置节点，确认仍先弹确认。
- 预期结果：
  - 本轮只拆分 UI 组件和复用已有纯函数，不新增产品功能。
  - `image-brief-workbench-drawer.tsx` 只负责数据读取和动作编排，卡片 / 表单 UI 下沉到同目录组件。
  - localforage key 和 Brief 数据结构保持兼容。
- 失败影响：
  - 如果结构收口引入回归，Brief 工作台可能出现卡片不渲染、表单不能保存或配置节点创建失败。

#### M6.7.1：Brief 接入生图与结果归档

- 入口：`/projects/:id` 项目详情页“生图 Brief”；或 `/canvas/:id` 画布工具栏“生图 Brief”。
- 操作步骤：
  1. 打开 Brief 工作台，选择一个标准模式且校验通过的 Brief，点击“用于生图 / 创建图片配置节点”。
  2. 检查画布中新增图片生成配置节点，metadata 写入 `briefId / briefKind / briefMode / briefSnapshot / finalPrompt / sourceType / sourceId / episodeId / episodeTitle / assetBreakdownItemId / productionBibleItemId / shotGroupId / shotIds`。
  3. 对 standard 模式但校验 error 的 Brief 点击用于生图，确认被阻止。
  4. 对 reminder 模式且有 warning 的 Brief 点击用于生图，确认先弹确认框，确认后才创建配置节点。
  5. 使用该配置节点执行现有图片生成流程，确认生成成功后素材自动进入“我的素材”，且 generation metadata 写入 `briefId / briefSnapshot / finalPrompt / referenceAssets / episodeId / episodeTitle / sourceType / sourceId`。
  6. 回到 Brief 工作台，确认结果素材出现在“生成结果”列表，可设为主参考图。
  7. 如果 Brief 来源是资产拆解条目，确认结果 assetId 写回 `assetIds`，状态变为 `generated`。
  8. 如果 Brief 来源是设定库，确认结果素材同步写入设定库 `assetRefs`。
- 预期结果：
  - Brief 不新增图片生成接口，只复用现有画布图片生成配置节点和 `addAssetOnce` 自动归档。
  - 重复生成同一素材不会重复入库，但 Brief 结果列表会按 assetId 去重。
  - 生成动作不会绕过用户现有的配置节点确认和生成流程。
- 失败影响：
  - Brief 只能停留在提示词草稿，无法进入画布生产链路。
  - 如果归档 metadata 或回写失败，资产拆解、设定库和 Brief 之间的可追溯关系会断开。

#### M6.7：生图 Brief 工作台第一版

- 入口：`/projects/:id` 项目详情页“工作流”Tab 的“生图 Brief”；或 `/canvas/:id` 画布底部工具栏的“生图 Brief”按钮；资产拆解、设定库、分镜生成表卡片中的“创建 Brief”按钮。
- 操作步骤：
  1. 打开项目详情页，进入“生图 Brief”，手动新增场景图、角色图、道具图、氛围参考图 Brief。
  2. 分别切换标准 / 提醒 / 自由模式，故意留空核心字段，检查标准模式拦截为待补充、提醒模式给 warning、自由模式跳过结构化检查。
  3. 在资产拆解抽屉中对角色 / 场景 / 道具 / 风格条目点击“创建 Brief”，确认 Brief 带入本集、剧本依据、资产名称和描述。
  4. 在设定库条目中点击“创建 Brief”，确认 Brief 带入设定库描述、提示词片段和绑定素材。
  5. 在分镜管理的生成表中对生成镜头组点击“创建 Brief”，确认生成 mood Brief，并记录 `shotGroupId / shotIds`。
  6. 在 Brief 工作台选择参考素材，编辑 `finalPrompt`，点击复制按钮，确认复制的是最终提示词。
  7. 刷新页面后重新打开项目 / 画布，确认 Brief 仍在本地恢复。
- 预期结果：
  - Brief 按 `infinite-canvas:image_brief_store` 本地保存，不改后端。
  - 四类 Brief 都有默认结构化字段，prompt builder 能拼装可复制的最终生图提示词。
  - 标准 / 提醒 / 自由三种模式的校验语义清楚，不自动触发真实生图、不自动扣费。
  - 资产拆解、设定库、分镜生成镜头组都能创建可追溯 Brief。
- 失败影响：
  - 剧本资产拆解无法进一步沉淀为可复用生图 Brief，角色图 / 场景图 / 道具图 / 氛围图仍需手写提示词。
  - 如果 source metadata 缺失，后续图片生成素材无法追溯到资产拆解、设定库或生成镜头组。

#### M6.6.R1：代码结构收口回归

- 入口：`/projects/:id` 项目详情页、`/canvas/:id` 画布页、“分镜管理”“资产拆解”“素材引用”相关入口。
- 操作步骤：
  1. 打开项目详情页，检查总览、素材引用、工作流入口仍能正常渲染。
  2. 打开已绑定本集剧本的画布，进入“分镜管理”，确认分镜头表、生成表、旧分镜组和生成队列区域仍可操作。
  3. 在分镜管理中新增 / 编辑一个分镜头和一个生成镜头组，确认行为与 v0.2.33 一致。
  4. 打开“资产拆解”，确认从剧本整理草案、绑定素材和设定库回写仍正常。
  5. 生成一个视频或检查已有生成视频素材，确认 generation metadata 中仍保留 `storyboardGroupId / storyboardShotId / shotGroupId / shotIds`。
- 预期结果：
  - 本轮只拆分 UI 组件和纯函数，页面行为、localforage key、数据字段保持兼容。
  - `storyboard-manager-drawer` 主文件变薄，分镜头表 / 生成镜头组 UI 被拆到同目录小组件。
  - 生成素材 metadata 扩展字段通过纯函数构造，结果与 v0.2.33 一致。
- 失败影响：
  - 如果结构收口引入回归，M6.6.3 的分镜头表和生成镜头组可能出现 UI 不挂载、表单无法保存或 metadata 缺失。

#### M6.6.3：分镜头表与生成镜头组

- 入口：已绑定本集剧本的画布 `/canvas/:id`，点击“分镜管理”；或 `/projects/:id` 项目详情页进入分镜管理抽屉。
- 操作步骤：
  1. 准备一个已绑定本集剧本且有 `scriptSnapshot` 的画布，打开“分镜管理”。
  2. 在“分镜头表 / 生成表”区域选择该画布，点击“从本集剧本生成草案”。
  3. 检查生成的分镜头草案是否包含场次 / 场景、剧本文本、画面描述、对白、角色、预计时长。
  4. 手动新增、编辑、删除、上下排序分镜头。
  5. 选择多个连续且同场次、总时长不超过 15 秒的分镜头，点击“组合生成镜头组”。
  6. 尝试选择跨场景、跳选或总时长超过 15 秒的分镜头，确认被拦截并有提示。
  7. 编辑生成镜头组的视频提示词，绑定图片 / 参考视频 / 音频资产和设定库条目。
  8. 在具体画布中点击生成镜头组的“打组加入画布”，确认弹出确认框；确认后只创建文本提示词节点、参考素材节点、视频生成配置节点。
  9. 检查新节点 metadata 是否写入 `episodeId / shotGroupId / shotIds / storyboardShotGroupId / storyboardTableShotIds`。
- 预期结果：
  - 分镜头表和生成镜头组按同一个 `storyboard_store` 本地保存，刷新后仍可恢复。
  - 生成镜头组必须同场次、连续、总时长不超过 15 秒。
  - 打组加入画布需要用户确认，不会自动触发真实 AI 生成或扣费。
  - 视频配置节点保留现有 Seedance / OpenAI 视频配置逻辑，只增加追溯 metadata。
- 失败影响：
  - 本集剧本无法稳定拆成可执行的镜头表，后续生成队列和视频制作会继续依赖散乱提示词。
  - 生成镜头组如果不校验连续性 / 时长 / 场景，会导致 Seedance 15 秒视频单元边界失控。
  - 如果 metadata 缺失，后续生成结果无法回流到对应本集和生成镜头组。

#### M6.6.2：剧本资产拆解与资产图 Brief

- 入口：`/projects/:id` 项目详情页的“工作流”Tab，点击“资产拆解”。
- 操作步骤：
  1. 准备一个已绑定本集剧本的画布，打开项目详情页并进入“资产拆解”。
  2. 选择该本集画布，点击“从剧本整理草案”。
  3. 检查是否生成角色、场景、道具、风格 / 光影四类资产草案。
  4. 手动新增、编辑、删除资产条目，并按类型筛选。
  5. 将角色 / 场景 / 道具条目关联到已有设定库条目。
  6. 对每个资产条目点击“创建 Brief”，检查生成的 Brief 草稿是否包含资产名称、描述和剧本依据。
  7. 手动绑定一个素材 ID，确认资产条目 `assetIds` 更新，素材 metadata 写入 `episodeId / episodeTitle / assetBreakdownItemId`，有关联设定库时同步写入 `assetRefs`。
- 预期结果：
  - 资产拆解结果按 `projectId + episodeId` 保存，本地刷新后仍可恢复。
  - 规则生成只是草案，用户可以人工修正，不会自动确认或触发图片生成。
  - 风格 / 光影资产可以生成氛围参考图 Brief 草稿，但不会强行关联设定库。
  - 绑定素材只更新引用和 metadata，不改变素材本体内容。
- 失败影响：
  - 剧本无法沉淀为角色、场景、道具和风格资产清单，后续 M6.6.3 分镜头表和 M6.7 生图 Brief 缺少资产输入。
  - 素材和设定库之间缺少本集追溯关系，后续项目级素材治理会变弱。

#### M6.6.1：一集一画布与剧本导入

- 入口：`/projects/:id` 项目详情页点击“新建画布”；已绑定剧本的画布进入 `/canvas/:id`。
- 操作步骤：
  1. 在项目详情页新建画布，选择“不绑定剧本”，确认画布列表显示“未绑定集数”。
  2. 在项目剧本中准备一个已有分集，再新建画布选择“从项目已有剧本分集选择”，确认新画布绑定该分集。
  3. 新建画布选择“粘贴 / 导入本集剧本”，输入本集标题和正文，确认项目剧本中新增对应分集，新画布绑定该分集。
  4. 打开绑定分集的画布，确认顶部显示本集标题，点击后打开剧本抽屉并定位到该分集。
  5. 在该画布生成图片或视频，检查自动归档素材的 `metadata.generation` 是否包含 `episodeId / episodeTitle / scriptId / scriptSnapshot`。
- 预期结果：
  - 一个画布默认可以对应一集内容，但旧画布仍允许没有集数信息。
  - 粘贴导入的剧本文本会作为画布 `scriptSnapshot` 保存，不依赖后续剧本记录是否被修改。
  - 项目详情画布列表能区分已绑定分集和未绑定集数。
  - 后续生成素材能追溯到项目、画布、本集剧本和生成参数。
- 失败影响：
  - 多集项目仍会混在一个画布上下文里，后续一集一画布、分镜头表和生成镜头组无法稳定追溯。
  - 剧本修改后旧画布缺少本集快照，素材来源会变得不可审计。

#### M6.6：项目工作流首页增强

- 入口：`/projects/:id` 项目详情页的“总览”Tab。
- 操作步骤：
  1. 分别打开空项目、已有剧本 / 分集 / 场次的项目、已有分镜 / 队列 / 生成结果的项目。
  2. 检查总览指标：画布数、剧本 / 分集 / 场次数、分镜组 / 条目数、生成队列数、已生成视频数、失败生成数、缺素材数、过期引用数、项目库素材数。
  3. 点击每张指标卡，确认能跳转到画布、剧本入口、分镜、设定库、素材引用、项目素材筛选页或 Agent 工作台。
  4. 根据项目状态检查“下一步建议”：未绑定剧本、没有设定库资产、没有分镜、有缺素材、有过期引用、有失败生成、有可导出分镜主版本。
  5. 检查最近 Agent 任务摘要只展示已有任务，不触发新的 Agent 能力。
- 预期结果：
  - 总览区域能作为项目制作看板，一眼看到制作进度和阻塞项。
  - 建议按钮只做跳转或打开现有抽屉，不自动修改数据、不自动生成任务。
  - 有过期引用或缺素材时能进入“素材引用”Tab 定位。
  - 有可导出分镜主版本时能进入分镜管理继续导出剪辑包。
- 失败影响：
  - 项目详情页仍只是入口集合，无法指导下一步制作。
  - 缺素材、过期引用和失败生成无法在项目首页被及时发现。
  - 后续一集一画布和剧本资产拆解会缺少项目级承载入口。

#### M7.4：项目级素材引用总览

- 入口：`/projects/:id` 项目详情页的“素材引用”Tab。
- 操作步骤：
  1. 准备一个项目，确保项目内存在画布节点素材引用、分镜条目素材引用、设定库绑定、分镜结果素材，以及带 `generation.projectId / storyboardGroupId / storyboardShotId` 的生成素材。
  2. 打开项目详情页，进入“素材引用”Tab。
  3. 分别切换素材类型、引用类型、版本状态、项目库状态筛选。
  4. 检查每个素材卡片的缩略图、引用数量、过期版本、本地文件缺失、项目库状态和最近更新时间。
  5. 点击“素材详情”“打开画布”“打开分镜”“打开设定库”。
- 预期结果：
  - 素材按项目内引用聚合展示，不做跨项目分析。
  - 画布、分镜、设定库、分镜结果和 generation metadata 生成素材都能被统计。
  - 有旧版本引用的素材显示“有过期引用”；没有旧版本引用的素材显示“最新”。
  - 项目库筛选能区分“仅项目库 / 未入项目库”。
  - 操作按钮能打开对应素材详情、画布、分镜管理或设定库入口。
- 失败影响：
  - 用户无法在项目维度判断素材影响范围。
  - 删除或替换素材前缺少可视化依据。
  - 后续素材引用巡检、缺失文件提示和版本治理会缺少总览入口。

#### M7.2.3：素材版本批量更新与旧版本下载

- 入口：`/assets` 我的素材页；素材详情抽屉的“版本历史”；项目上下文筛选后的“引用：过期引用”。
- 操作步骤：
  1. 在某个项目中准备一个已被画布节点、分镜条目或设定库绑定引用的素材。
  2. 编辑该素材并替换图片、视频、音频或文本内容，形成 v2。
  3. 打开素材详情，在“版本历史”中点击旧版本“下载”。
  4. 回到项目素材视图，选择项目上下文，将引用筛选切到“过期引用”。
  5. 分别测试单项“更新到最新版”和多选后“批量更新”。
- 预期结果：
  - 旧版本可以单独下载；图片、视频、音频优先从本地 `storageKey` 取文件，文本导出为 `.txt`。
  - 过期引用列表能显示画布节点、分镜条目、设定库角色 / 场景 / 道具绑定。
  - 单项和批量更新前能看到影响对象；确认后只修改引用方的 `assetVersion`。
  - 更新后的引用方保留 `previousVersions`，素材本体不被修改。
  - 固定版本引用不会在未确认时自动变化。
- 失败影响：
  - 用户无法判断替换素材会影响哪些项目对象。
  - 旧版本不可下载会降低版本回滚和外部备份可信度。
  - 如果批量更新误改素材本体，会破坏版本管理边界。

#### M7.2.2：素材版本引用关系与画布版本锁定

- 入口：我的素材页、画布素材插入、分镜管理抽屉、设定库抽屉、素材详情抽屉。
- 操作步骤：
  1. 从“我的素材”把同一个素材分别插入画布节点、分镜条目和设定库绑定。
  2. 打开对应引用对象，确认写入 `assetVersion` 快照，模式为 `fixed-version`。
  3. 替换素材内容生成新版本。
  4. 分别查看画布节点、分镜条目和设定库绑定是否提示“有新版本可用”。
  5. 分别点击“更新到最新版”。
- 预期结果：
  - 引用记录包含 `assetId / assetVersionId / versionNumber / assetUpdatedAt`。
  - 素材更新后旧引用不会自动换图、换视频或换文本。
  - 手动更新只修改引用方记录，并将旧引用写入 `previousVersions`。
  - 素材详情能列出当前素材被哪些对象引用。
- 失败影响：
  - 画布、分镜、设定库可能被素材替换意外污染。
  - 后续项目级引用总览无法可信地判断版本状态。

#### M7.2：素材版本历史

- 入口：我的素材页，素材编辑弹窗，素材详情抽屉。
- 操作步骤：
  1. 新建或选择一个图片、视频、音频或文本素材。
  2. 只修改标题、标签、备注、文件夹，确认不会新增版本。
  3. 替换实际内容，确认生成 v2。
  4. 在素材详情查看版本历史，并尝试恢复 v1。
  5. 刷新页面后再次打开该素材。
- 预期结果：
  - 只有内容变更才生成新版本。
  - 版本历史显示版本号、当前版本、变更说明、媒体信息和创建时间。
  - 恢复旧版本后素材内容切回对应版本，`currentAssetVersionId` 保持正确。
  - 版本 metadata 不保存完整 `data:` URL。
- 失败影响：
  - 素材版本会变成“看得见但不可恢复”的伪历史。
  - 误把 data URL 写入版本记录会放大本地存储体积。

#### M7.1：项目共享资产库本地底座

- 入口：项目详情页进入素材页，或 `/assets?projectId=...`。
- 操作步骤：
  1. 选择一个项目上下文。
  2. 多选素材并点击“加入项目库”。
  3. 切换“项目库：全部 / 仅项目库 / 未入项目库”。
  4. 打开素材详情查看项目共享库信息。
  5. 刷新页面后重复查看。
- 预期结果：
  - 素材 metadata 写入 `projectLibraries` membership。
  - 仅项目库和未入项目库筛选结果正确。
  - 素材卡片和详情显示项目库、本地同步状态、角色和远端 ID 预留。
  - 刷新页面后 membership 仍保留。
- 失败影响：
  - 项目资产空间无法作为后续云端共享资产库的本地模型。
  - 项目素材筛选不可靠会影响分镜、设定库和 Agent 复用素材。

#### M7 系列：素材筛选、批量整理、批量加白

- 入口：`/assets` 我的素材页。
- 操作步骤：
  1. 在项目上下文中选择分镜组筛选，并测试默认、最近更新、最近生成、创建时间、标题排序。
  2. 多选素材，测试移动文件夹、批量添加标签、删除选中。
  3. 导入有效素材包和异常素材包。
  4. 多选图片 / 视频素材，测试批量加白和批量刷新。
  5. 打开自动归档的视频素材详情，检查来源链路、生成信息、版本预留和分镜字段搜索。
- 预期结果：
  - 分镜组筛选包含直接引用素材、主版本结果素材和 generation metadata 归属素材。
  - 批量整理只修改目标字段，不丢失已有标签和素材文件。
  - 删除选中必须经过确认，取消不删除。
  - 素材包导入会拒绝非本工具包、缺少 `assets.json` 或文件清单异常的包。
  - 批量加白跳过 `Active / Processing`，允许未提交或 `Failed` 重新提交；刷新后状态同步到卡片和详情。
- 失败影响：
  - 素材资产中心无法承担项目级生产整理工作。
  - 错误导入或批量删除会直接破坏本地素材可信度。

### 回归保留

这些能力不是当前版本最优先，但仍影响主流程；改素材、项目、画布、视频链路时需要抽样回归。

- M6.5 成片交接与剪辑包：分镜组可导出 zip，包含 `shots.json`、`shots.csv`、`prompts/`、`videos/`、`references/`；缺失主版本、失败分镜、非视频主版本或本地文件缺失时必须先给出导出前检查。
- M6.2 渠道边界收口：本地直连只保留 OpenAI 兼容能力，不再向视频请求附带火山 Ark Key、Base URL 或 `X-Volcengine-*` 头；云端 Seedance 仍走后台私有渠道。
- M6.1 生成前提示词自审：视频生成前本地规则检查主体、动作、场景、参考素材和编辑 / 延长模式；用户选择返回修改不能创建任务，选择仍然生成才继续。
- M5.10 Agent Skill 系统：Agent 工作台通过本地 skill registry 生成任务，任务记录 `skillId / skillName / skillVersion`；取消不写入，确认后才应用。
- M5.9 AI 短剧 Agent 工作台：资产管理员、提示词工程、分镜导演三个 Agent 只做本地规则建议和动作预览，不自动生成视频、不扣费。
- M5.3.5 项目工作台总入口：项目可新建、打开、重命名、归档、删除；项目内画布、剧本、分镜、设定库、素材、提示词、队列和 Agent 入口按 `projectId` 串联。
- M5.8.2 批量生成队列：从分镜组创建视频生成队列，支持开始、暂停、继续、取消、失败重试、只重试失败项，并复用单节点视频生成链路。
- M5.8.1 分镜生成结果回流：带 `storyboardGroupId / storyboardShotId` 的视频节点生成成功后，自动入库素材并回写 `resultAssetIds / primaryAssetId`；失败写入分镜错误状态。
- M5.7 分镜管理：分镜组和分镜条目可稳定保存，支持引用素材和设定库，支持打组加入画布。
- M5.6 剧本与集数管理：剧本、分集、场次可保存和重开恢复，场次可引用设定库。
- M5.5 提示词仓库模板化：提示词 metadata、变量替换、设定库变量填充、视频创作台和画布插入入口保持可用。
- M5.4 角色场景设定库：角色、场景、道具设定可增删改，绑定素材并填写 positive / negative / consistency。
- M5.3 画布项目预设：旧画布无 preset 时继续走全局配置；新画布预设能写入生成素材 metadata。
- M5.0-M5.2 素材底座：`addAssetOnce` 去重、生成素材自动归档、素材详情生成信息和筛选保持可用。

### 历史记录

以下记录来自早期页面验收和实现批次，已压缩为摘要保留，用于追溯问题来源；除非相关模块被再次改动，否则不作为当前版本必须逐项执行的清单。

#### M4：AI 任务账本、异步任务生命周期和管理后台

- 已实现 `ai_tasks` 基础账本、云端 AI 代理任务记录、失败返还、Ark 视频 `upstream_task_id` 记录、request / response 脱敏、后台 AI 任务日志列表和详情。
- 已实现视频异步任务查询时同步更新 `ai_tasks`：running / queued 不返还，succeeded 标完成，failed / cancelled 幂等返还，重复刷新不重复返还。
- 管理后台 AI 任务日志要求保留：列表筛选、详情抽屉、视频刷新、失败手动返还、重复返还拦截、管理员鉴权、不得泄露 API Key / token / secret / base64 / data: / blob:。
- 历史页面问题：曾出现登录页 / 后台页只显示顶部和版本号、主体区域不挂载，需要在后台页面异常时优先检查 console、chunk 加载、standalone 资源、auth bootstrap 和 AntD 表格/抽屉。

#### M3：画布助手动作协议

- 已实现助手动作协议纯函数、validator、preview builder 和 apply helper。
- 允许动作：读画布、总结画布、解释选中节点上下游、创建文本节点、创建配置节点、连接已有节点。
- 禁止动作：删除节点、删除连线、覆盖生成结果、自动触发 AI 生成。
- 页面验收曾确认：写入动作只显示预览，取消不改画布，确认后写入历史并支持撤销；自然语言第一版由本地规则解析，不让模型自由执行动作。

#### M2：Seedance 视频画布关系、编辑 / 延长、截帧和任务可观测性

- 已实现已完成视频节点重新生成创建平行变体，`relationType=variant`，不创建 `视频 -> 视频` 连线。
- 已实现只有显式点击“续写”才创建 `视频 -> 尾帧图 -> 下一段视频` 连续链路。
- 已实现 Seedance 编辑 / 延长派生节点 metadata，编辑 / 延长结果不覆盖源视频。
- 已实现视频任务进度、taskId、耗时、手动刷新、任务详情等可观测信息。
- 已实现“截取当前帧”：从视频播放器当前时间点绘制 canvas，生成图片节点并写入本地图片存储。
- 已实现长提示词预览字号、固定高度、滚动和 `data-canvas-no-zoom` 隔离。
- 历史风险仍需记住：旧数据里可能残留早期错误的 `视频 -> 视频` 变体连线；遇到异常连接时先确认 metadata 是否是历史数据。

#### M1 / P1 / P2：Seedance 协议与多模态参考

- 已实现 openai 与 volcengine-ark 协议区分，不强制所有渠道拼接 `/v1`。
- 已实现 Ark / Seedance 视频任务创建、查询、状态归一化、成功后取 `video_url`。
- 已实现 P2 多模态参考：图片、视频、音频按输入顺序生成 Seedance content；图片角色支持普通参考、首帧、尾帧；视频和音频分别作为 reference video / audio。
- 已修复生图返回完整 `data:` URL 时被重复拼接 `data:image/png;base64,` 的问题。
- 已修复切换页面后带 `taskId` 的 loading 视频节点被误判失败的问题。

#### 基础画布、素材、创作台和配置历史

- 画布项目导出 / 导入改为 zip，包含画布 JSON 和本地图片 / 视频文件。
- 上传、拖拽、剪贴板、替换节点导入的图片 / 视频 / 音频会自动加入“我的素材”。
- 我的素材支持文件夹、选择、导出选中 / 全部、导入素材包、本地视频 / 音频上传与预览。
- 生图工作台和视频创作台保留本地生成记录、参数回填、素材保存和下载。
- 后台素材管理支持图片、视频、音频文件上传，并回填素材 URL。
- 火山私域人像素材加白已接入图片和视频素材，状态会在我的素材和画布节点之间同步；公网素材访问地址仍不能是 localhost、`.local` 或内网 IP。

### 已过时 / 待确认是否废弃

这些事项明显和当前版本路径不完全一致，先保留为“待确认是否废弃”，不要当作当前验收要求执行。

- 旧的 3002 Docker 页面验收：当前主要本地运行态已经多次校准为 `3000` 前端 + `8080` 后端；除非明确测试 Docker 镜像，否则不再以 3002 页面状态判断功能。
- 本地直连火山 Ark / Seedance UI：M6.2 已把本地直连收口为 OpenAI 兼容，火山方舟 / Seedance 企业能力走云端渠道；旧的本地 Ark Key / Endpoint UI 验收应视为废弃候选。
- “参考图用途”里的“续写”选项：M2.6 已把续写从图片控制 UI 中移除，只保留视频节点显式“续写”入口；旧验收文案里的该选项应视为废弃。
- 早期默认管理员账号、旧路径缓存、旧损坏 SQLite 数据库问题：这些属于历史运行态诊断，不作为当前功能验收项；如果再次出现页面 500 或数据库错误，再单独开运行态排查。
- 早期 OpenAI-compatible 视频参数 `resolution_name / preset / input_reference[]` 的旧接口细节：当前 Seedance / Ark 和 OpenAI 兼容链路已有协议区分，旧参数只在相关适配代码回归时参考。

## 验收记录维护规则

- 新实现完成后，先写入“当前必须验收”或“回归保留”，不要直接写进正式功能说明。
- 当前版本通过真实页面验收后，可从“当前必须验收”降级到“回归保留”。
- 长期不再适配当前产品路径的项目，先移动到“已过时 / 待确认是否废弃”，确认后再从待验收清单移除。
- 历史摘要必须保留问题来源、涉及模块和关键风险，不要求保留早期逐字日志。
