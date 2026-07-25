# 输出模板

对上游每一项原样回写身份字段，并新增两个字段：

```json
{
  "items": [
    {
      "logicalAssetId": "CHAR-001",
      "kind": "character",
      "name": "角色名",
      "scriptEvidence": "上游原文",
      "description": "上游描述",
      "imagePrompt": "完整、可独立执行的生图提示词",
      "status": "ready"
    }
  ]
}
```

`imagePrompt` 内不放 JSON 字段名。外观马甲还必须原样保留 `parentLogicalAssetId` / `variantType` / `variantName`。
