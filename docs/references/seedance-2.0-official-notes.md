# Seedance 2.0 官方资料核对摘要

本目录已保存本轮用户提供的两份官方资料原文：

- `seedance-2.0-series-official-2026-06.txt`：Doubao Seedance 2.0 系列教程。
- `seedance-2.0-private-assets-official-2026-06.txt`：Seedance 2.0 私域虚拟人像素材库 / 加白资料。

## 官方规则摘录

- Seedance 2.0 系列支持文本、图片、视频、音频等多模态输入，但不支持“文本 + 音频”和纯音频输入。
- 官方教程中的模型 ID 为 `doubao-seedance-2-0-260128`、`doubao-seedance-2-0-fast-260128`。
- 标准版支持 480p、720p、1080p；Fast 版支持 480p、720p。
- 官方比例包含 `21:9`、`16:9`、`4:3`、`1:1`、`3:4`、`9:16`。
- 时长范围为 4-15 秒。
- 多模态参考数量限制：图片 0-9、视频 0-3、音频 0-3。
- 严格首尾帧需要使用 `role: first_frame` / `role: last_frame`。
- 普通参考素材要求 URL 可公网访问。
- 私域加白素材通过 `CreateAssetGroup`、`CreateAsset`、`GetAsset` 管理，使用 AK/SK 鉴权，不使用 Seedance 视频生成 API Key。
- `CreateAsset` 是异步接口，不承诺入库时间 SLA；只有 `Status=Active` 后素材才可用于视频生成。
- 私域素材生成视频时，在 `content.<模态>_url.url` 里传入 `asset://<asset_ID>`。
- Prompt 里应使用“图片 1”“视频 1”“音频 1”按顺序指代参考素材，不应直接写 Asset ID。
- Asset Group / Asset 的 `ProjectName` 必须和视频生成 API Key 所属项目一致。
- 私域素材库当前强调虚拟人像素材；非虚拟人像素材通常不需要入库。

## 当前实现核对风险

- 视频加白素材的 URL 优先级存在测试与文档口径冲突：私域加白素材官方要求使用 `asset://<asset_ID>`，但当前前端测试里有用例要求视频引用优先公网 URL。
- 代码已有 `Active` 后使用 `asset://` 的路径，这符合私域素材库资料；但普通公网参考素材仍应走公网 URL 路径，不能把两者混成一个策略。
- 官方支持音频素材入库和 `audio_url` 参考；当前加白入口主要覆盖图片 / 视频，音频加白与音频参考链路需要单独确认。
- Fast 模型不支持 1080p，调用前应避免把 Fast + 1080p 组合发出。
- 官方支持 `21:9`，当前调用归一化和后端白名单需要确认是否完整覆盖。
- 编辑、扩展视频的官方示例使用普通 `content` 多模态输入和 `reference_video`，应继续核对现有 `task_mode`、`source_video` 等字段是否仍被当前官方 API 接受。

## 本轮测试记录

- `go test ./service ./handler -run 'Ark|Seedance|Volcengine'`：通过。
- `node --test web/src/services/api/video-reference.test.mts web/src/services/api/video-normalizers.test.mts web/src/app/(user)/canvas/utils/canvas-video-generation-plan.test.mts web/src/app/(user)/canvas/components/canvas-node-generation.test.mts`：1 个用例失败。
- 失败用例：`selects Volcengine public URL before regular video URL`。
- 失败含义：当前代码返回 `asset://asset-video`，测试期望 `https://example.com/reference.mp4`。结合官方私域素材资料，优先使用 `asset://` 对“已 Active 的加白素材”是合理的；真正需要调整的是测试口径和普通公网素材路径的边界。
