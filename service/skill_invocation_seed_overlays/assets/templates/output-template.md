# 输出模板

每个产物是一个独立 `asset_brief` payload：

```json
{
  "assetId": "character-001",
  "brief": "完整、可独立执行的资产制作描述",
  "format": "character-four-view"
}
```

Runtime 会按输出基数接收 1–300 个 payload。每个 payload 只使用 `assetId/brief/format`，不回写上游资产的其他字段。
