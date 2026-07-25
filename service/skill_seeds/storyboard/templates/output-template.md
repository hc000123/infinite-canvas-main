# 输出模板

```json
{
  "shots": [
    {
      "shotId": "shot-001",
      "sceneKey": "scene-001",
      "sourceScript": "该镜直接对应的剧本原文",
      "shotDraft": {
        "shotSize": "景别",
        "camera": "机位高度、角度与主体关系",
        "movement": "一个主运镜的起点、速度与终点",
        "action": "可见主动作及完成状态",
        "performance": "可执行的身体、视线、呼吸或微表情",
        "dialogue": "剧本原台词，无则为空字符串",
        "durationSeconds": 6,
        "continuityMode": "continuous"
      }
    }
  ]
}
```

只返回 JSON。不增加镜头标题、解释、参考图或最终提示词字段。
