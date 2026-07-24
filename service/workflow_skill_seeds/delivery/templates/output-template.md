# 输出模板

```json
{
  "summary": "本次交付的简明事实摘要",
  "succeeded": [{"shotId": "shot-001", "output": "可定位结果"}],
  "failed": [{"shotId": "shot-002", "reason": "可定位失败原因"}],
  "retrySuggestions": [{"shotId": "shot-002", "suggestion": "一次只改一个主变量的建议"}],
  "exportManifest": [
    {"shotId": "shot-001", "file": "实际文件或产物标识", "status": "ready"},
    {"shotId": "shot-002", "file": "预期但未完成的目标", "status": "failed"}
  ]
}
```

数组可为空，但五个顶层字段都必须存在。只返回 JSON。
