# 火山人像加白配置入口设计

## 背景

火山私域人像素材加白配置已接入后台管理设置页，但用户在“我的素材”里测试加白时，需要频繁切换到后台页面配置 AK/SK、项目名称和公网素材访问地址。前台右上角“配置”弹窗已经用于集中调整模型和密钥，因此本次把加白相关配置也放入该弹窗，方便统一测试。

## 目标

- 在前台“配置”弹窗中增加“火山人像加白”配置区。
- 字段保存到现有后端 Admin Settings，不写入浏览器本地配置。
- 只允许管理员登录后查看和编辑 AK/SK 等敏感字段。
- 保存成功后刷新公开配置，让“我的素材”里的加白入口立即同步启用状态。

## 非目标

- 不新增独立加白测试页。
- 不把 AK/SK 存入 `useConfigStore` 或 localStorage。
- 不改变后端火山加白接口、上传校验和素材 metadata 结构。
- 不改变后台管理设置页已有配置入口。

## 方案

复用现有 `fetchAdminSettings` / `saveAdminSettings`：

1. `AppConfigModal` 打开时，如果当前用户是管理员且已有 token，则拉取 Admin Settings。
2. 弹窗中新增“火山人像加白”区块，编辑 `private.volcengineAsset`。
3. 点击“完成”时，如果管理员配置已加载，则把完整 Admin Settings 合并后提交。
4. 提交成功后调用 `loadPublicSettings()`，更新 `public.volcengineAsset.enabled`。
5. 如果用户不是管理员，则隐藏敏感输入，只显示需要管理员登录后配置的提示。

## 字段

- `enabled`：是否开启素材加白入口。
- `accessKey`：火山 Access Key，留空沿用已保存值。
- `secretKey`：火山 Secret Key，留空沿用已保存值。
- `projectName`：默认 `default`。
- `region`：默认 `cn-beijing`。
- `publicAssetBaseUrl`：后端静态素材目录的公网访问前缀。

## 错误处理

- 拉取配置失败：提示“读取加白配置失败”，但不影响模型配置继续使用。
- 保存失败：保持弹窗打开，并显示接口错误信息。
- 非管理员：不尝试调用 Admin Settings API。

## 验证

- TypeScript 类型检查通过。
- 代码格式检查通过。
- 手动确认“配置”弹窗里可看到火山人像加白区块，管理员保存后素材库加白开关状态同步。

