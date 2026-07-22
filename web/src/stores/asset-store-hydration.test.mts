import assert from "node:assert/strict";
import test from "node:test";

import { createAssetStoreHydrationGate, mergeHydratedAssetCollections } from "./asset-store-hydration.ts";

test("waits for hydration before continuing asset writes", async () => {
    const gate = createAssetStoreHydrationGate();
    let continued = false;
    const waiting = gate.wait().then(() => {
        continued = true;
    });

    await Promise.resolve();
    assert.equal(continued, false);

    gate.release();
    gate.release();
    await waiting;
    assert.equal(continued, true);
});

test("keeps synchronous additions made while persisted assets are hydrating", () => {
    const merged = mergeHydratedAssetCollections(
        {
            assets: [
                { id: "existing", title: "旧快照" },
                { id: "persisted", title: "已保存素材" },
            ],
            folders: [{ id: "persisted-folder", name: "已保存文件夹" }],
        },
        {
            assets: [
                { id: "new", title: "恢复期间新增" },
                { id: "existing", title: "当前内存版本" },
            ],
            folders: [{ id: "new-folder", name: "恢复期间新增文件夹" }],
        },
    );

    assert.deepEqual(merged.assets, [
        { id: "new", title: "恢复期间新增" },
        { id: "existing", title: "当前内存版本" },
        { id: "persisted", title: "已保存素材" },
    ]);
    assert.deepEqual(merged.folders, [
        { id: "new-folder", name: "恢复期间新增文件夹" },
        { id: "persisted-folder", name: "已保存文件夹" },
    ]);
});
