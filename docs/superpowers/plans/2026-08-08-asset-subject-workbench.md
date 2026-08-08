# 资产主体工作台实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有资产库扩展为支持人设、场景、道具和站位持续生产的主体工作台，同时保留其他素材管理。

**Architecture:** 正式图片继续使用现有 `Asset`；在同一个 localforage Zustand store 中增加稳定的形态和工作台图片记录。新动态路由负责主体生产，复用现有图片 API、模型配置、图片存储与任务追踪；资产库只增加创建主体和进入工作台的入口。

**Tech Stack:** Next.js App Router、React 19、TypeScript、Ant Design 6、Tailwind CSS、Zustand、localforage、Node test runner。

**Implementation status:** Tasks 1–8 implemented. The checkboxes below preserve the original executable handoff sequence; fresh verification evidence is recorded in the completion report and `docs/pending-test.md`.

---

### Task 1: 形态与工作台图片纯函数

**Files:**
- Create: `web/src/app/(user)/assets/asset-workbench.ts`
- Test: `web/src/app/(user)/assets/asset-workbench.test.mts`

- [ ] **Step 1: 写失败测试**

覆盖默认形态命名、同名形态校验、项目作用域过滤、候选转正式资产输入和参考图转换：

```ts
assert.equal(defaultVariantName("character"), "基础形象");
assert.equal(validateVariantName("战损", [{ name: "战损" }]), "形态名称已存在");
assert.deepEqual(filterReferenceAssets(assets, "project-a", "project"), [assets[0]]);
assert.equal(candidateAssetInput(subject, variant, candidate).assetBinding?.variantId, variant.id);
assert.equal(workbenchImageReference(candidate).dataUrl, candidate.dataUrl);
```

- [ ] **Step 2: 确认测试失败**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-workbench.test.mts'`

Expected: FAIL，提示找不到 `asset-workbench.ts`。

- [ ] **Step 3: 实现最小纯函数**

导出 `defaultVariantName`、`validateVariantName`、`filterReferenceAssets`、`candidateAssetInput`、`workbenchImageReference` 和工作台图片分组函数。正式资产输入必须包含：

```ts
assetBinding: {
  projectId: subject.projectId,
  subjectId: subject.id,
  category: subject.category,
  variantId: variant.id,
  variantName: variant.name,
  allEpisodes: true,
  episodeIds: [],
}
```

- [ ] **Step 4: 确认测试通过**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-workbench.test.mts'`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add 'web/src/app/(user)/assets/asset-workbench.ts' 'web/src/app/(user)/assets/asset-workbench.test.mts'
git commit -m "feat: add asset workbench domain helpers"
```

### Task 2: 扩展本地资产数据模型

**Files:**
- Modify: `web/src/stores/use-asset-store.ts`
- Create: `web/src/stores/use-asset-workbench-store.test.mts`
- Modify: `web/src/app/(user)/assets/asset-subjects.ts`
- Modify: `web/src/app/(user)/assets/asset-subjects.test.mts`

- [ ] **Step 1: 写失败测试**

测试以下动作：创建主体自动创建默认形态、新增/重命名/复制/删除形态、最后一个形态不可删除、工作台图片增删、删除主体保留正式资产但解除绑定、当前主图被删除时清空。

```ts
const subjectId = store.ensureSubject({ projectId: "p1", category: "character", name: "小也", tags: [] });
assert.equal(store.variants.find((item) => item.subjectId === subjectId)?.name, "基础形象");
assert.equal(store.removeVariant(onlyVariant.id), false);
```

- [ ] **Step 2: 确认测试失败**

Run: `cd web && node --experimental-strip-types --test src/stores/use-asset-workbench-store.test.mts 'src/app/(user)/assets/asset-subjects.test.mts'`

Expected: FAIL，缺少 `variants`、`workbenchImages` 和相关动作。

- [ ] **Step 3: 实现模型与持久化**

在 store 中增加 `AssetVariant`、`AssetWorkbenchImage`、`variantId` 和动作：

```ts
ensureVariant(input): string;
updateVariant(id, patch): void;
duplicateVariant(id, name): string;
removeVariant(id): boolean;
addWorkbenchImage(input): string;
updateWorkbenchImage(id, patch): void;
removeWorkbenchImage(id): void;
setVariantCurrentAsset(variantId, assetId): void;
```

持久化 `variants` 与 `workbenchImages`；rehydrate 时使用 `resolveImageUrl` 恢复 blob URL。删除动作调用现有图片清理，并把剩余工作台图片作为 `extra` 传入，防止误删共享 storage key。

- [ ] **Step 4: 确认测试通过**

Run: `cd web && node --experimental-strip-types --test src/stores/use-asset-workbench-store.test.mts 'src/app/(user)/assets/asset-subjects.test.mts'`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add web/src/stores/use-asset-store.ts web/src/stores/use-asset-workbench-store.test.mts 'web/src/app/(user)/assets/asset-subjects.ts' 'web/src/app/(user)/assets/asset-subjects.test.mts'
git commit -m "feat: persist asset variants and candidate images"
```

### Task 3: 增加资产库主体入口

**Files:**
- Create: `web/src/app/(user)/assets/components/asset-subject-create-modal.tsx`
- Modify: `web/src/app/(user)/assets/components/asset-subject-section.tsx`
- Modify: `web/src/app/(user)/assets/page.tsx`
- Test: `web/src/app/(user)/assets/asset-subject-entry-wiring.test.mts`

- [ ] **Step 1: 写失败测试**

静态接线测试确认：分类创建操作打开主体创建弹窗；主体保存后调用 `ensureSubject` 并跳转 `/assets/${subjectId}`；没有正式资产的主体仍渲染；主体卡包含工作台链接。

- [ ] **Step 2: 确认测试失败**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-subject-entry-wiring.test.mts'`

Expected: FAIL，缺少创建弹窗和工作台链接。

- [ ] **Step 3: 实现主体创建与卡片**

主体弹窗字段为名称、项目、分类和备注。`page.tsx` 对四个主体分类拦截现有创建动作，普通素材继续调用 `openCreate`。`AssetSubjectSection` 不再过滤空主体，空卡显示“待生产”，有主图时显示当前形态主图。

- [ ] **Step 4: 确认测试通过**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-subject-entry-wiring.test.mts'`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add 'web/src/app/(user)/assets/components/asset-subject-create-modal.tsx' 'web/src/app/(user)/assets/components/asset-subject-section.tsx' 'web/src/app/(user)/assets/page.tsx' 'web/src/app/(user)/assets/asset-subject-entry-wiring.test.mts'
git commit -m "feat: add asset subject creation entry"
```

### Task 4: 建立独立主体工作台骨架

**Files:**
- Create: `web/src/app/(user)/assets/[subjectId]/page.tsx`
- Create: `web/src/app/(user)/assets/[subjectId]/components/asset-variant-nav.tsx`
- Create: `web/src/app/(user)/assets/[subjectId]/components/asset-reference-panel.tsx`
- Create: `web/src/app/(user)/assets/[subjectId]/components/asset-candidate-grid.tsx`
- Create: `web/src/app/(user)/assets/[subjectId]/components/asset-version-panel.tsx`
- Test: `web/src/app/(user)/assets/asset-workbench-wiring.test.mts`

- [ ] **Step 1: 写失败测试**

静态接线测试确认动态路由读取 `subjectId`，包含形态导航、生产表单、参考图区、候选池、正式版本区和主体不存在空状态。

- [ ] **Step 2: 确认测试失败**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-workbench-wiring.test.mts'`

Expected: FAIL，动态页面不存在。

- [ ] **Step 3: 实现响应式工作台**

页面顶部使用面包屑和主体标题；桌面端网格为 `320px minmax(0,1fr)`，移动端单列。形态导航支持创建、重命名、复制配置和删除；至少保留一个形态。全部颜色来自 studio CSS 变量或 Ant Design token。

- [ ] **Step 4: 确认测试通过**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-workbench-wiring.test.mts'`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add 'web/src/app/(user)/assets/[subjectId]' 'web/src/app/(user)/assets/asset-workbench-wiring.test.mts'
git commit -m "feat: add asset subject workbench shell"
```

### Task 5: 上传、引用和跨项目作用域

**Files:**
- Create: `web/src/app/(user)/assets/[subjectId]/components/asset-reference-picker.tsx`
- Modify: `web/src/app/(user)/assets/[subjectId]/page.tsx`
- Modify: `web/src/app/(user)/assets/[subjectId]/components/asset-reference-panel.tsx`
- Test: `web/src/app/(user)/assets/asset-reference-scope.test.mts`

- [ ] **Step 1: 写失败测试**

测试默认只返回当前项目图片，切换 `all` 后返回所有项目图片；上传图片生成 reference 记录；源资产已删除时仍能使用快照并显示来源缺失。

- [ ] **Step 2: 确认测试失败**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-reference-scope.test.mts'`

Expected: FAIL，引用选择器和作用域接线不存在。

- [ ] **Step 3: 实现引用与上传**

引用选择器提供“当前项目/全部项目”分段选择和搜索；选择正式图片后经 `uploadImage` 创建快照记录。上传参考图支持多选，逐张持久化，单张失败不影响其他文件。

- [ ] **Step 4: 确认测试通过**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-reference-scope.test.mts'`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add 'web/src/app/(user)/assets/[subjectId]' 'web/src/app/(user)/assets/asset-reference-scope.test.mts'
git commit -m "feat: add scoped asset references"
```

### Task 6: 内嵌图片生成与候选池

**Files:**
- Create: `web/src/app/(user)/assets/[subjectId]/use-asset-workbench-generation.ts`
- Modify: `web/src/app/(user)/assets/[subjectId]/page.tsx`
- Modify: `web/src/app/(user)/assets/[subjectId]/components/asset-candidate-grid.tsx`
- Test: `web/src/app/(user)/assets/asset-workbench-generation.test.mts`

- [ ] **Step 1: 写失败测试**

测试请求快照在有参考图时选择 edit、无参考图时选择 generation；批次结果允许部分成功；成功图片转换为持久化 candidate 输入；失败槽位保留可重试错误。

- [ ] **Step 2: 确认测试失败**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-workbench-generation.test.mts'`

Expected: FAIL，生成 hook 不存在。

- [ ] **Step 3: 实现生成 hook**

hook 复用 `useEffectiveConfig`、`requestGeneration`、`requestEdit`、`readImageMeta` 与 `uploadImage`。每个槽位使用 `count: "1"` 独立请求，trace 使用：

```ts
{
  projectId: subject.projectId,
  sourceType: "image_generation",
  sourceId: `${subject.id}:${variant.id}`,
  inputSummary: `${subject.name} / ${variant.name}；参考图 ${references.length} 张`,
}
```

成功即写入候选池；失败只更新临时槽位。生成按钮在提示词为空、配置缺失或正在运行时禁用。

- [ ] **Step 4: 确认测试通过**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-workbench-generation.test.mts'`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add 'web/src/app/(user)/assets/[subjectId]' 'web/src/app/(user)/assets/asset-workbench-generation.test.mts'
git commit -m "feat: generate asset candidates in workbench"
```

### Task 7: 候选转正、版本与继续迭代

**Files:**
- Modify: `web/src/app/(user)/assets/[subjectId]/page.tsx`
- Modify: `web/src/app/(user)/assets/[subjectId]/components/asset-candidate-grid.tsx`
- Modify: `web/src/app/(user)/assets/[subjectId]/components/asset-version-panel.tsx`
- Test: `web/src/app/(user)/assets/asset-candidate-promotion.test.mts`

- [ ] **Step 1: 写失败测试**

测试候选转正输入携带主体/形态/项目/生成元数据；已转正候选不可重复创建；切换当前主图保留历史正式资产；“作为参考图”和“复制到其他形态”生成正确工作台图片记录。

- [ ] **Step 2: 确认测试失败**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-candidate-promotion.test.mts'`

Expected: FAIL，转正操作未接线。

- [ ] **Step 3: 实现候选操作**

转正调用 `addAssetOnce` 后补齐 binding，更新 `selectedAssetId` 与 `currentAssetId`。版本区从正式 assets 按 `variantId` 派生；允许旧版本重新设为主图。候选菜单提供“作为参考图”“复制到其他形态”“下载”“删除”。

- [ ] **Step 4: 确认测试通过**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-candidate-promotion.test.mts'`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add 'web/src/app/(user)/assets/[subjectId]' 'web/src/app/(user)/assets/asset-candidate-promotion.test.mts'
git commit -m "feat: promote and version asset candidates"
```

### Task 8: 文档与定向验收

**Files:**
- Modify: `docs/todo.md`
- Modify: `docs/pending-test.md`
- Modify: `docs/superpowers/plans/2026-08-08-asset-subject-workbench.md`

- [ ] **Step 1: 更新计划勾选与待验收文档**

在 `docs/pending-test.md` 记录四类主体创建、多形态、参考图、生成候选、候选转正、主图版本和跨项目引用；从 `docs/todo.md` 移除本次已完成的对应事项，仅保留明确未实现的音色、三视图、视频工作台和团队协作。

- [ ] **Step 2: 执行全部本次定向测试**

Run:

```bash
cd web && node --experimental-strip-types --test \
  'src/app/(user)/assets/asset-workbench.test.mts' \
  'src/app/(user)/assets/asset-subjects.test.mts' \
  'src/stores/use-asset-workbench-store.test.mts' \
  'src/app/(user)/assets/asset-subject-entry-wiring.test.mts' \
  'src/app/(user)/assets/asset-workbench-wiring.test.mts' \
  'src/app/(user)/assets/asset-reference-scope.test.mts' \
  'src/app/(user)/assets/asset-workbench-generation.test.mts' \
  'src/app/(user)/assets/asset-candidate-promotion.test.mts'
```

Expected: 全部 PASS。

- [ ] **Step 3: 执行改动文件 TypeScript 检查**

Run: `cd web && npx tsc --noEmit --pretty false`

Expected: 本次新增或修改文件无 TypeScript 错误；若工作区既有错误导致全局检查失败，记录与本次无关的错误文件并继续完成定向验证。

- [ ] **Step 4: 检查变更范围**

Run: `git diff --check && git status --short`

Expected: 无空白错误；仅提交本任务文件，不暂存用户已有改动。

- [ ] **Step 5: 提交**

```bash
git add docs/todo.md docs/pending-test.md docs/superpowers/plans/2026-08-08-asset-subject-workbench.md
git commit -m "docs: add asset workbench acceptance checks"
```
