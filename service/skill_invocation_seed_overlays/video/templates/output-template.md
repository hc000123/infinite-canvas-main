# 输出模板

```json
{
  "items": [
    {
      "shotId": "shot-001",
      "prompt": "场景：……\n声音：……\n画面内容：0-2秒，……2-6秒，……\n限制：……",
      "inputArtifactRefs": [
        {
          "bindingName": "asset_rendition",
          "artifactId": "artifact-001",
          "contentHash": "sha256:0123456789abcdef"
        }
      ]
    }
  ]
}
```

每个镜头一项，按分镜顺序输出。没有参考资产时 `inputArtifactRefs` 使用 `[]`。只返回 JSON。
