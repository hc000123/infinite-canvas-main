# 云端图片超分实施计划

> 对应设计：`docs/superpowers/specs/2026-08-09-cloud-image-upscale-design.md`
>
> 开发验证只使用假 Provider 和本地测试 HTTP 服务，不调用真实阿里云推理。

## 基线

- 隔离 worktree：`.worktrees/cloud-image-upscale`
- 分支：`codex/cloud-image-upscale`
- Go 全包基线：通过。
- 前端 TypeScript 基线：通过。
- 前端测试基线：1022 项中 1018 通过、4 项失败；失败来自既有路径别名、分镜文案和导航断言，与本功能无关。本计划的新增专项测试必须全部通过。

## 任务 1：冻结服务端任务模型与数据库访问

**新增文件**

- `model/image_upscale.go`
- `repository/image_upscale.go`
- `repository/image_upscale_test.go`

**修改文件**

- `repository/db.go`

**TDD 步骤**

1. 先写 repository 测试，覆盖保存任务、按所有者读取、非所有者不可见、更新状态和查询中断任务。
2. 运行 `go test ./repository -run ImageUpscale -count=1`，确认因模型/函数缺失失败。
3. 实现 `ImageUpscaleJob`、状态枚举和最小 repository 函数。
4. 把新模型加入 `AutoMigrate`。
5. 重跑专项测试至通过。

## 任务 2：实现统一 Provider 契约和阿里云适配器

**新增文件**

- `service/image_upscale_provider.go`
- `service/image_upscale_aliyun.go`
- `service/image_upscale_aliyun_test.go`

**修改文件**

- `config/config.go`
- `config/config_test.go`
- `go.mod`
- `go.sum`

**TDD 步骤**

1. 写 Provider 契约测试，验证倍率映射、固定 `base/png/95` 参数和缺少凭据时的安全错误。
2. 写配置测试，验证 provider/work dir 默认值和空白归一化。
3. 运行对应测试，确认失败。
4. 引入官方 `github.com/alibabacloud-go/imageenhan-20190930/v3` SDK。
5. 实现 `ImageUpscaleProvider` 与阿里云 adapter；生产调用使用 `MakeSuperResolutionImageAdvance` 的 `UrlObject io.Reader`。
6. adapter 测试只注入假 SDK 调用器，断言请求，不访问网络。

## 任务 3：实现任务创建、验证、执行、下载和恢复

**新增文件**

- `service/image_upscale.go`
- `service/image_upscale_test.go`

**修改文件**

- `service/runtime_media.go`（仅在复用安全下载公共逻辑确有必要时做最小抽取）

**TDD 步骤**

1. 写失败测试覆盖：2×/4×、非法倍率、空文件、超过 5 MB、非图片、超尺寸、未配置 Provider。
2. 写状态测试覆盖：`queued → processing → downloading → succeeded`、服务商失败、下载失败、失败重试、运行中拒绝重试。
3. 写安全测试覆盖：结果 URL 只允许公网 HTTP(S)、结果必须是图片、结果超限失败。
4. 写恢复测试覆盖：启动恢复把遗留活动任务标记为可重试失败。
5. 实现输入私有落盘、任务 DTO、异步执行、结果持久化、错误清洗和恢复函数。
6. 任务执行器通过可替换的 Provider/下载器注入测试，不调用付费服务。

## 任务 4：暴露鉴权 API

**新增文件**

- `handler/image_upscale.go`
- `handler/image_upscale_test.go`

**修改文件**

- `router/router.go`
- `router/router_test.go`

**TDD 步骤**

1. 写 handler 测试覆盖 capabilities、multipart 创建、所有者读取、失败重试和参数错误。
2. 写 router 接线断言，确认接口位于 `middleware.UserAuth` 下。
3. 运行专项测试确认失败。
4. Handler 只解析请求、读取当前用户、调用 service、返回 `OK` / `FailError`。
5. 注册 `/api/v1/image-upscale/*` 路由，并在 router 初始化后执行一次中断任务恢复。
6. 重跑 handler/router 专项测试。

## 任务 5：实现前端 API 契约与纯函数

**新增文件**

- `web/src/services/api/image-upscale.ts`
- `web/src/services/api/image-upscale.test.mts`
- `web/src/app/(user)/canvas/utils/canvas-image-upscale.ts`
- `web/src/app/(user)/canvas/utils/canvas-image-upscale.test.mts`

**修改文件**

- `web/src/app/(user)/canvas/types.ts`

**TDD 步骤**

1. 写 API 测试，断言 multipart 字段、GET job 和 retry 路径。
2. 写纯函数测试，覆盖右侧布局、源节点不变、派生连线、任务元数据、成功尺寸与错误状态。
3. 运行新增测试确认失败。
4. 实现 API 类型与调用函数。
5. 实现 `CanvasImageUpscaleMetadata`、派生节点构建和任务投影函数。
6. 重跑新增测试。

## 任务 6：实现弹窗、任务动作、轮询与刷新恢复

**新增文件**

- `web/src/app/(user)/canvas/components/canvas-image-upscale-modal.tsx`
- `web/src/app/(user)/canvas/hooks/use-canvas-image-upscale-actions.ts`
- `web/src/app/(user)/canvas/components/canvas-image-upscale-wiring.test.mts`

**修改文件**

- `web/src/app/(user)/canvas/hooks/use-canvas-page-local-state.ts`
- `web/src/app/(user)/canvas/hooks/use-canvas-render-actions.ts`
- `web/src/app/(user)/canvas/hooks/use-canvas-node-crud-actions.ts`
- `web/src/app/(user)/canvas/components/canvas-page-overlays.tsx`
- `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`

**TDD 步骤**

1. 写接线测试，要求页面装配 upscale hook、弹窗和恢复逻辑。
2. 实现弹窗：2×/4×、尺寸预览、云端处理告知、提交 loading。
3. 实现动作 hook：读取 source Blob、创建任务、创建派生节点/连线、轮询、成功下载到 localforage、自动归档。
4. hook 启动时扫描带活动 job ID 的节点并恢复轮询；卸载时清理定时器。
5. 重试沿用派生节点和服务端 job，不走通用图片生成重试。
6. 资产归档失败只提示，不回滚成功节点。

## 任务 7：接入工具栏、检查器和节点信息

**修改文件**

- `web/src/app/(user)/canvas/components/canvas-node-hover-toolbar.tsx`
- `web/src/app/(user)/canvas/components/canvas-node-inspector.tsx`
- `web/src/app/(user)/canvas/components/canvas-side-inspector.tsx`
- `web/src/app/(user)/canvas/hooks/use-canvas-node-tool-actions.ts`
- `web/src/app/(user)/canvas/components/canvas-node-info-modal.tsx`
- 相关现有 wiring 测试

**TDD 步骤**

1. 扩充接线断言，要求有内容的图片显示“超分”，空图片/视频不显示。
2. 在 `CanvasNodeHoverToolbarActions` 新增 `onUpscale`，接到动作 hook。
3. 悬浮工具栏和检查器使用现有主题和 `lucide-react` 图标，不新增硬编码主题色。
4. 信息弹窗显示倍率、服务商、云端处理、输入/输出尺寸、request ID、耗时和错误码。
5. 将触及到的“加入我的素材/素材”按钮文案收敛为“加入资产/存资产”，不做无关页面大范围替换。

## 任务 8：配置与文档

**修改文件**

- `.env.example`
- `docs/backend-database.md`
- `docs/todo.md`
- `docs/pending-test.md`

**步骤**

1. 记录后端环境变量、服务端密钥要求和云端数据处理事实。
2. 记录 `image_upscale_jobs` 表和字段用途。
3. 从 todo 移除已完成的对应事项（若存在），在 pending-test 增加实际可验收变更。
4. 不更新 `docs/features.md`，等待用户真实配置后的验收。

## 任务 9：验证与变更审查

**验证命令**

1. `go test ./repository ./service ./handler ./router -run ImageUpscale -count=1`
2. `cd web && node --experimental-strip-types --test src/services/api/image-upscale.test.mts 'src/app/(user)/canvas/utils/canvas-image-upscale.test.mts' 'src/app/(user)/canvas/components/canvas-image-upscale-wiring.test.mts'`
3. `go test ./...`
4. `cd web && npm run typecheck`
5. `cd web && npm test`，对照基线确认没有新增失败。
6. `git diff --check`

**审查清单**

- 搜索确保前端 bundle、API DTO、日志和文档没有 AccessKey 值。
- 搜索确保新增用户文案统一使用“资产”。
- 确认测试没有真实阿里云域名调用或付费请求。
- 确认源图片节点未被替换。
- 确认 refresh recovery 只继续已有 job，不重复创建付费任务。
- 确认结果已先持久化，资产归档失败不会丢图。
- 检查 `docs/todo.md` 和 `docs/pending-test.md` 与实际变更一致。
