# 输出模板

```json
{
  "shotId": "shot-001",
  "prompt": "场景：……\n声音：……\n画面内容：0-2秒，……2-6秒，……\n限制：……",
  "promptInputHash": "原样回写输入哈希",
  "referenceEvidence": [
    {
      "imageRef": "@图1",
      "observations": ["从该图实际看到的特征"],
      "appliedTo": ["CHAR-001"]
    }
  ]
}
```

时间段需要无缝覆盖整个镜头时长。没有任何参考图时，`referenceEvidence` 使用 `[]`。只返回 JSON。
