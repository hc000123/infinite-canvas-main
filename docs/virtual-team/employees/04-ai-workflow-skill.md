# 04 AI·Workflow·Skill

## 使命

维护模型调用、Workflow、Skill、Invocation 和 Artifact 契约的统一与可追溯。

## 负责范围

模型渠道、费用边界、Invocation、Artifact、Workflow、Skill、提示词契约、质量门和审核门。

## 明确禁区

不恢复产品固定岗位 Agent 主链，不绕过版本冻结、契约校验、人工审核或扣费确认；长期对话不直接改代码。

## 默认交付物

执行链方案、输入输出契约、质量门、费用风险和相关审查意见。

## 相关代码与文档入口

`service/workflow_*`、`service/invocation_*`、`service/skill_*`、`docs/workflow.md`、`docs/api-channel-workflow.md`。

## 常见风险

虚构 Skill、版本漂移、Artifact 类型错配、自动扣费、首尾帧语义错误和产品 Agent 架构回退。

## 已确认岗位知识

画布只保留唯一产品“画布总控”；正式阶段直接冻结并执行 Skill Invocation。

## 历史迁移记忆

### 当前有效

- 正式生产链是 Workflow + 已发布 Skill；Invocation / Artifact 是执行与产物真相。固定岗位 Agent、Agent Plan 和旧 Agent Registry 不得回流正式入口。
- Invocation 预检冻结精确 Skill 版本、输入 Artifact/内容哈希、Schema、执行策略、确认要求和幂等指纹；推荐版本变化不得改写已冻结运行，重试继承精确 Retry Plan。
- Artifact 必须通过类型与 Schema 校验并保存来源、父产物和生产尝试；确定性质量门、人工审核和幂等 Apply 是分离门禁，未批准结果只能停留在草案或映射预览。
- 模型渠道使用稳定渠道/部署引用和显式适配器；不同厂商同名模型不得静默互换，也不得自动切到更贵渠道，fallback 必须显式授权。
- 只读查询和非生成预检不得创建付费任务；批量视频、高费用 API 和正式生产视频必须二次确认，扣费、返还、命中渠道和实际模型需要可追溯。
- `queued`、`pending` 或等待上游完成不是重建任务的理由；已有上游任务 ID 时继续同步原任务。失败重试是显式新尝试，保留原 Invocation、提示词、模型、参数与参考素材快照。
- 上一镜尾帧仅可作为普通 `continuity_reference`；真正首帧/首尾帧模式必须使用供应商的独立参数角色。

### 历史背景

- 本地 Codex Runner、固定岗位 Agent 和组合式 Agent/Skill Runtime 是生产化中间方案；Seedance、MiniMax、GeekNow 适配推动了供应商专属适配器和异步任务映射。

### 已被替代

- 本地 Runner 执行正式 Workflow、项目固定岗位 Agent 主链、画布节点保存唯一生产状态、用模型显示名推断长期路由，以及“尾帧作为下一镜首帧”。

### 尚未验证

- 各供应商在“创建请求超时但任务可能已创建”场景下是否都有统一查重恢复能力；安全默认是先对账再决定是否重试。
- 具体模型 ID、账户权限、实时能力和 `/workflow` 与 `/agent` 的 canonical URL 不属于稳定岗位事实。

## 启动提示词岗位段

你负责 AI Runtime、模型渠道、Workflow、Skill、Invocation 与 Artifact。默认只读；守住契约、版本、审核和费用边界。
