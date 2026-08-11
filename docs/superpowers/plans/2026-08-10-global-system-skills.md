# 全局 System Skill 实施计划（精简版）

> 状态：**实施完成，等待用户最终验收**
> 设计依据：[Global System Skills Design](../specs/2026-08-10-global-system-skills-design.md)

## 目标

取消项目专属 Skill，统一为：

- 所有 Skill 都是全局 `system` Skill。
- 所有登录账号、所有项目共享同一套已启用、已发布且契约匹配的 Skill。
- 只有管理员可以创建、导入、编辑、评测、发布、推荐、停用和删除 Skill。
- 项目侧只选择和运行精确 Skill Version，不再管理 Skill。
- 保留已有 Definition、Version、评测、审计和运行引用的稳定 ID。

## 当前进度

| 阶段 | 状态 | 已完成结果 |
| --- | --- | --- |
| 1. 全局目录 | ✅ 完成 | Repository、Options 和精确解析只接受 System Skill；项目上下文不再改变候选目录。 |
| 2. 管理权限 | ✅ 完成 | 生命周期写接口全部收口到管理员路由；普通项目 Skill 写接口和 Handler 已移除。 |
| 3. 前端收口 | ✅ 完成 | 后台 Skill 中心成为唯一管理入口；项目详情移除 Skill 管理；旧地址返回项目详情。 |
| 4. 运行时路由 | ✅ 完成 | Workflow、Agent、Invocation 和画布总控只接受 System Skill；画布总控升级为不可变 `1.1.0`。 |
| 5. 数据转换 | ✅ 完成 | 现有 Project owner Definition 已原位转为 System owner，稳定 ID 与关联记录不变。 |
| 6. 文档整理 | ✅ 完成 | 数据库说明、todo、pending-test 和 CHANGELOG 已同步。 |
| 7. 运行态检查 | ✅ 完成 | 前后端已重启；后台、项目选择器、旧地址跳转和配置折叠已在本地页面确认。 |

整体实施进度：**100%**。剩余工作仅为人工验收，不再继续扩展实现范围。

## 已落地的关键规则

### 后端

- `skill_definitions.owner_type` 当前只允许业务创建和解析 `system`。
- `owner_user_id`、`owner_project_id` 对新 System Skill 保持为空。
- `/api/v1/skill-options` 保留为登录用户的全局运行目录。
- 创建、导入、编辑、评测、发布、推荐、停用和删除均使用 `/api/v1/admin/...`。
- 被评测、绑定、Workflow、Agent 或运行引用的版本受生命周期保护。
- Skill、Workflow、Agent 和评测写入在事务内复验 System owner 与版本状态，失败不产生部分数据。

### 前端

- `/admin/skills` 是唯一 Skill 管理页面。
- 项目详情不再显示“Skill 管理”。
- `/projects/:id/skills` 自动返回 `/projects/:id`。
- Skill 中心不再显示 System / Project owner 筛选和标记。
- Capability、输入 / 输出 Artifact、项目标签由 Skill 清单自动识别，默认隐藏在“高级筛选”中；普通使用只看到名称搜索。
- 后台“火山素材审核（唯一配置入口）”默认收起，展开后保留原表单和保存逻辑。

### 数据

“全家穿越-剧本优化”已完成原位转换：

- Skill ID：`skill-29636f60-0b2e-466a-9788-edb712a9a52b`
- 推荐 Version ID：`skillversion-9d62c1e4-f44b-4691-ad5c-000814ae2d85`
- Version：`1.0.0`
- 状态：`published`
- Owner：`system`
- Owner user / project ID：空

版本、评测、审计、绑定和运行引用未改写。转换前数据库临时备份位于：

```text
/tmp/infinite-canvas-before-global-skills.db
```

## 最终人工验收

- [ ] 分别用两个账号打开两个项目，确认剧本 Skill 候选一致，并包含“全家穿越-剧本优化”。
- [ ] 管理员在 `/admin/skills` 完成一次导入、试跑和发布；普通用户确认看不到管理入口。
- [ ] 打开旧 `/projects/:id/skills`，确认最终地址和内容均回到项目详情。
- [ ] 刷新 `/admin/skills`，确认默认只显示名称搜索；“高级筛选”可展开、筛选和清除。
- [ ] 刷新后台私有设置，确认火山素材审核配置默认收起，展开后原值和保存功能正常。

验收通过后，只需把对应记录从 `docs/pending-test.md` 迁移到 `docs/features.md`；无需再执行新的开发任务。

## 可选检查

按项目规则，未获得明确授权时不运行全量测试或构建。需要发布前完整检查时再执行：

```bash
go test ./...
cd web && npm test
cd web && npm run typecheck
```

## 回滚

- 代码：从 `codex/global-system-skills` 分支按提交回退，或从原工作区移除对应功能差异；不要回滚用户的其他未提交改动。
- 数据：停止服务后恢复上述 SQLite 备份，再启动前后端并检查 `/api/health`。
- 回滚后确认：项目 Skill 选择、管理员登录、Workflow / Agent 运行和数据库引用均可读取。

## 不再执行的旧流程

- 不再创建、复制或隔离 Project Skill。
- 不再恢复普通用户 Skill 写接口。
- 不再为每个小修改重复派发多轮实现 / 规格 / 质量代理；只有出现真实阻断问题时才追加修复。
- 不再在计划中粘贴大段实现代码；具体实现以当前源码、测试和 Git 提交为准。
