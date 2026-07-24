# 输出模板

```json
{
  "items": [
    {
      "logicalAssetId": "CHAR-001",
      "kind": "character",
      "name": "角色名",
      "scriptEvidence": "可定位的剧本原文",
      "description": "不超出原文的可见描述"
    },
    {
      "logicalAssetId": "COSTUME-001",
      "kind": "costume",
      "name": "角色名·状态名",
      "scriptEvidence": "支持该状态的原文",
      "description": "状态的可见特征",
      "parentLogicalAssetId": "CHAR-001",
      "variantType": "costume",
      "variantName": "状态名"
    }
  ]
}
```

普通角色、场景、道具不输出马甲三字段。只返回 JSON。
