# 输出模板

```json
{
  "items": [
    {
      "assetId": "character-001",
      "kind": "character",
      "name": "角色名",
      "sourceEvidence": ["可定位的连续剧本原文"],
      "coreFacts": ["证据可支持的可见事实"]
    },
    {
      "assetId": "costume-001",
      "kind": "costume",
      "name": "角色名·状态名",
      "sourceEvidence": ["支持该状态的原文"],
      "coreFacts": ["所属角色为 character-001", "状态的可见差异"]
    }
  ]
}
```

每个 `items` 项严格使用五个核心字段，只返回 JSON。
