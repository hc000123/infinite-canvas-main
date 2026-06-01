# 火山私域人像素材加白设计

## 背景

“我的素材”当前主要保存在浏览器本地。图片素材通常只有浏览器 Blob URL 和本地 `storageKey`，火山方舟无法从公网拉取这些地址。

火山私域虚拟人像素材资产库的接入流程是：先创建素材组合 `CreateAssetGroup`，再提交单个可访问媒体 URL 到 `CreateAsset`，随后通过 `GetAsset` 查询处理状态。只有素材状态为 `Active` 后，才可作为可信素材在 Seedance 2.0 视频生成中使用。

参考文档：

- [私域虚拟人像素材资产库使用指南](https://www.volcengine.com/docs/82379/2333565?lang=zh)
- [CreateAssetGroup](https://www.volcengine.com/docs/82379/2318270)
- [CreateAsset](https://www.volcengine.com/docs/82379/2318271)
- [GetAsset](https://www.volcengine.com/docs/82379/2318274)

## 目标

- 在“我的素材”的图片素材上提供“提交人脸加白/审核”能力。
- 后端接收本地图片文件，保存为公网可访问文件，再提交给火山 `CreateAsset`。
- AK/SK、ProjectName、Region 等敏感配置只保存在后端私有配置中。
- 前端保存火山素材 ID、素材组 ID、ProjectName 和状态，方便用户查看与刷新。
- 上传后不做自动长轮询，先提供手动刷新状态，降低限流和后台复杂度。

## 非目标

- 不实现火山视频生成时自动引用该 `asset://` 素材。
- 不实现真人人像库、活体授权或真人肖像授权流程。
- 不实现云同步“我的素材”；仍保持当前本地素材库模型。
- 不接入复杂对象存储 SDK。第一版使用后端本地静态文件目录加公网 Base URL。

## 配置

在后台系统设置的私有配置中新增 `volcengineAsset`：

```json
{
  "enabled": false,
  "accessKey": "",
  "secretKey": "",
  "projectName": "default",
  "region": "cn-beijing",
  "publicAssetBaseUrl": ""
}
```

- `enabled`：关闭时前端隐藏或禁用加白入口。
- `accessKey` / `secretKey`：用于火山 OpenAPI AK/SK 鉴权；保存时留空则沿用已保存值。
- `projectName`：传给 `CreateAssetGroup`、`CreateAsset`、`GetAsset`，默认 `default`。
- `region`：第一版默认 `cn-beijing`。
- `publicAssetBaseUrl`：后端静态文件的公网前缀，例如 `https://example.com/uploaded-assets`。为空时拒绝提交火山。

## 后端设计

新增服务模块负责三件事：

1. 保存上传图片到后端目录，例如 `data/public-assets/images/{id}.{ext}`。
2. 组合公网 URL：`{publicAssetBaseUrl}/images/{id}.{ext}`。
3. 使用火山 OpenAPI 调用 `CreateAssetGroup`、`CreateAsset`、`GetAsset`。

后端新增接口：

### 提交图片素材

`POST /api/v1/volcengine/assets/image-review`

请求使用 `multipart/form-data`：

- `file`：图片文件，必填。
- `assetTitle`：素材标题，选填。
- `groupId`：已有火山素材组 ID，选填。
- `groupName`：新建素材组名称，未传 `groupId` 时必填。

流程：

1. 校验用户登录。
2. 校验私有配置已启用，AK/SK、ProjectName、publicAssetBaseUrl 完整。
3. 校验图片格式、大小小于 30 MB、尺寸与比例符合火山要求。
4. 保存文件并生成公网 URL。
5. 如果没有 `groupId`，调用 `CreateAssetGroup` 创建素材组。
6. 调用 `CreateAsset`，传入 `GroupId`、图片 URL、`AssetType=Image`、`ProjectName`、`Name`。
7. 返回本地文件 URL、火山 `assetId`、`groupId`、`projectName`、初始状态 `Processing`。

### 查询素材状态

`POST /api/v1/volcengine/assets/status`

请求 JSON：

```json
{
  "assetId": "asset-xxx",
  "projectName": "default"
}
```

流程：

1. 校验用户登录和私有配置。
2. 调用 `GetAsset`。
3. 返回 `Status`、`URL`、`AssetType`、`GroupId`、`UpdateTime` 等必要字段。

## 前端设计

“我的素材”图片卡片和详情抽屉增加入口：

- 未提交：显示“提交加白”。
- `Processing`：显示“审核中”和“刷新状态”。
- `Active`：显示“已加白”，展示火山 Asset ID，可复制。
- `Failed`：显示“审核失败”，允许重新提交或刷新。

提交弹窗：

- 展示图片标题和基础信息。
- 输入素材组名称，默认使用素材标题或“我的素材”。
- 如果该素材已有 `metadata.volcengineAsset.groupId`，可直接沿用。
- 提示“仅提交你有权使用的虚拟人像素材”。

前端从 `storageKey` 读取 Blob，使用 multipart 上传到后端。提交成功后更新当前素材 `metadata.volcengineAsset`：

```ts
{
  assetId: string;
  groupId: string;
  projectName: string;
  status: "Processing" | "Active" | "Failed";
  publicUrl: string;
  submittedAt: string;
  updatedAt: string;
}
```

## 数据模型

第一版不新增“我的素材”数据库表字段，因为“我的素材”仍是本地 Zustand/localForage 数据。火山相关信息放入现有 `Asset.metadata`。

后端保存的公网图片文件暂不建表，文件名使用随机 ID，避免覆盖。后续如果需要清理孤儿文件，再新增文件索引表。

## 错误处理

- 配置未启用：返回“火山素材审核未启用”。
- 缺少公网 Base URL：返回“请先配置公网素材访问地址”。
- 文件不符合限制：返回明确限制说明。
- 火山返回错误：后端记录完整错误日志，对前端返回安全中文错误。
- 火山状态 `Failed`：前端显示失败，并保留重新提交入口。

## 安全与合规

- AK/SK 不下发到前端。
- 后端只允许登录用户调用提交和查询接口。
- 上传目录只允许图片扩展名和图片 MIME 类型。
- 前端提交弹窗展示授权提醒：仅上传自己合法拥有并有权使用的虚拟人像素材。
- 不在文档或 UI 中承诺本地开发地址可被火山访问；必须配置公网可访问地址。

## 测试

第一版需要覆盖：

- 后端配置归一化：空 AK/SK 保留旧值，默认 ProjectName 和 Region 生效。
- 图片校验：格式、大小、尺寸、比例。
- 火山客户端：对 `CreateAssetGroup`、`CreateAsset`、`GetAsset` 的请求参数做单元测试或可替换客户端测试。
- 前端：图片素材提交后 metadata 更新；不同状态下按钮和标签展示正确。

## 实施顺序

1. 扩展设置模型、后台设置 UI 和前端类型。
2. 新增后端静态文件目录和公网 URL 生成。
3. 新增火山 OpenAPI 客户端和两个业务接口。
4. 在“我的素材”图片卡片与详情抽屉接入提交和刷新状态。
5. 更新文档中的待测试事项。
