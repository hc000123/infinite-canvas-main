# Seedance 2.0 全能参考视频节点设计

## 背景

画布视频节点已支持在 OpenAI 兼容视频接口和火山 Seedance 之间按节点切换。Seedance 2.0 的全能参考能力允许在视频生成任务的 `content` 数组中混合文本、图片、视频、音频等输入，并通过 `role` 标记参考用途。

当前项目已有图片节点、视频节点、本地图片存储、本地视频存储和节点连接关系；暂未支持音频素材或音频节点。因此第一版只实现图片参考和视频参考，不引入音频相关数据结构。

## 目标

- 在画布视频节点和生成配置节点的 Seedance 2.0 模式下，支持把上游图片节点作为 `reference_image`、上游视频节点作为 `reference_video` 发送给火山 Ark。
- OpenAI 兼容视频接口保持现有行为，只继续使用图片参考，不发送视频参考。
- 保存生成元数据时记录本次使用的参考资源，便于后续重试和排查。
- 不新增音频节点、音频素材、音频上传或音频导入导出能力。

## 交互设计

用户通过画布连线提供参考素材：

- 图片节点连接到视频节点或视频模式的生成配置节点：作为图片参考。
- 视频节点连接到视频节点或视频模式的生成配置节点：作为视频参考。
- 文本节点仍作为提示词上下文拼接进 prompt。

视频模式下的配置区域增加一个轻量提示，展示当前输入统计：

- `提示词 N 个`
- `参考图 图片 1-3`，无图片时显示 `0 张`
- `参考视频 视频 1-2`，无视频时显示 `0 个`

预览弹窗也展示图片和视频参考卡片，卡片角标使用 `图片 1`、`视频 1` 这类标签，让用户按 Seedance 的“素材类型 + 序号”规则写提示词。第一版不提供“角色类型”下拉，所有图片固定发送 `role: "reference_image"`，所有视频固定发送 `role: "reference_video"`。

## 数据结构

扩展画布生成输入上下文：

- `referenceImages: ReferenceImage[]`
- `referenceVideos: ReferenceVideo[]`
- `videoCount: number`

新增轻量类型 `ReferenceVideo`：

```ts
type ReferenceVideo = {
    id: string;
    name: string;
    url: string;
    storageKey?: string;
    type?: string;
};
```

扩展视频节点元数据：

- `videoReferences?: string[]`

其中 `references` 继续保存图片引用，`videoReferences` 保存视频 `storageKey` 或 URL。旧画布数据不需要迁移；缺少该字段时按空数组处理。

## 请求数据流

Seedance 2.0 本地模式：

1. 根据节点连接收集上游文本、图片、视频。
2. 图片通过现有 `imageToDataUrl` 转成可提交的 URL/base64。
3. 视频通过 `storageKey` 读取本地 Blob 后转成 data URL；没有 `storageKey` 时使用节点 `content` URL。
4. 构造 Ark JSON payload：

```json
{
  "model": "doubao-seedance-2-0-260128",
  "content": [
    { "type": "text", "text": "图片 1和视频 1..." },
    { "type": "image_url", "image_url": { "url": "..." }, "role": "reference_image" },
    { "type": "video_url", "video_url": { "url": "..." }, "role": "reference_video" }
  ],
  "duration": 10,
  "ratio": "16:9",
  "resolution": "720p",
  "generate_audio": true,
  "watermark": false
}
```

OpenAI 兼容模式：

- 保持现有 FormData 请求。
- 图片参考继续作为 `input_reference[]`。
- 视频参考不发送，避免破坏兼容接口。

远程后端代理模式：

- 后端现有 Ark 转换逻辑已经能读取 JSON `content` 并透传到 Ark payload。
- 如果前端在远程模式仍走 `/api/v1/videos`，第一版不额外启用视频参考；远程模式的多模态参考能力后续单独验证。

## 限制与校验

- 图片最多取前 9 张。
- 视频最多取前 3 个。
- 图片 + 视频总数最多 12 个。
- Seedance 提示词提交前会把 `图片1`、`视频1`、`音频1` 归一成 `图片 1`、`视频 1`、`音频 1`，并阻止使用 `asset://...` Asset ID 指代素材。
- 如果视频 Blob 读取或转 data URL 失败，当前生成失败并显示中文错误。
- 不尝试计算视频总时长；Seedance 2.0 对参考视频时长的限制由上游返回错误处理。

## 错误处理

- 没有提示词但有文本上游时，沿用现有拼接结果。
- 没有任何提示词时，仍阻止生成。
- 参考视频丢失时，重试失败并提示“参考视频已丢失，无法继续重试”。
- 火山接口错误继续走现有 `normalizeAiError` 和节点 `errorDetails` 展示。

## 测试计划

- 单元测试：构建 Seedance payload 时同时包含 `reference_image` 和 `reference_video`。
- 单元测试：OpenAI 兼容 payload 忽略视频参考并保留图片参考。
- 浏览器检查：画布连接图片、视频到视频生成配置节点后，面板显示参考图和参考视频数量。
- 浏览器检查：切换到火山 Seedance 后，生成调用路径仍使用 Ark JSON payload。

## 不做事项

- 不新增音频节点或音频素材。
- 不做每个参考资源的角色自定义。
- 不做参考素材公网托管。
- 不承诺本地 Blob URL 能被火山服务器直接访问；本地模式会转 data URL 提交。
