# 剧本资产提取

## 目标

只从已确认生产剧本提取后续必须保持一致的角色、场景、道具与角色外观状态，输出一个 `asset_catalog` payload。

## 执行顺序

1. 逐场扫描可重复、影响剧情或必须保持连续的对象。
2. 先登记角色主体，再登记服装、发型、妆容、年龄、伤势等可见状态。
3. 为每项分配稳定 `assetId`，复制能独立证明其存在的剧本原文到 `sourceEvidence`。
4. 把证据可支持的身份、结构、材质、状态和功能拆成原子化 `coreFacts`。

## 输出边界

- `assetId` 按类别首次出现顺序稳定递增，使用 `character-001` / `scene-001` / `prop-001` / `costume-001` 格式。
- `kind` 只能是 `character` / `scene` / `prop` / `costume`。
- `sourceEvidence` 中的每项必须是包括标点在内的连续剧本原文，不得改写或拼接不连续句子。
- 外观状态与父角色的关系写入 `coreFacts`，不单独造人。
- 只输出 `items[].assetId/kind/name/sourceEvidence/coreFacts`，不写生图提示词或额外字段。
