import assert from "node:assert/strict";
import test from "node:test";

import { agentAssetSlotReference, agentAssetSlotSummary, bindAgentAssetSlot, createAgentAssetSlot, ignoreAgentAssetSlot, mergeAgentAssetSlots, removeAgentAssetSlot, renameAgentAssetSlot, splitAgentAssetSlot, type AgentAssetSlot } from "./workflow-asset-slots.ts";

const slot: AgentAssetSlot = { slotId: "slot-1", category: "character", name: "阿宁", description: "年轻女性，黑色短发", status: "placeholder", sourceSceneIds: ["scene-1"], sourceEvidence: ["阿宁进入房间"] };

test("keeps stable slot identity across manual corrections", () => {
    assert.equal(renameAgentAssetSlot(slot, "阿宁（雨夜）").slotId, slot.slotId);
    assert.equal(bindAgentAssetSlot(slot, { assetId: "asset-1", subjectId: "subject-1" }).slotId, slot.slotId);
});

test("uses text for placeholders and image references only for valid bindings", () => {
    assert.deepEqual(agentAssetSlotReference(slot, new Set()), { kind: "text", value: "阿宁：年轻女性，黑色短发" });
    const bound = bindAgentAssetSlot(slot, { assetId: "asset-1" });
    assert.deepEqual(agentAssetSlotReference(bound, new Set(["asset-1"])), { kind: "image", assetId: "asset-1", value: "阿宁" });
    assert.deepEqual(agentAssetSlotReference(bound, new Set()), { kind: "text", value: "阿宁：年轻女性，黑色短发" });
});

test("merges and splits slots without reusing a removed identity", () => {
    const merged = mergeAgentAssetSlots([slot, { ...slot, slotId: "slot-2", name: "女主" }], { slotId: "slot-merged", name: "阿宁" });
    assert.deepEqual(merged.sourceSceneIds, ["scene-1"]);
    const split = splitAgentAssetSlot(merged, [{ slotId: "slot-a", name: "阿宁" }, { slotId: "slot-b", name: "阿宁雨衣" }]);
    assert.deepEqual(split.map((item) => item.slotId), ["slot-a", "slot-b"]);
});

test("supports manual add, ignore, delete and status summaries", () => {
    const added = createAgentAssetSlot("slot-new", "scene");
    assert.equal(added.name, "未命名场景");
    const ignored = ignoreAgentAssetSlot(slot);
    assert.equal(ignored.status, "ignored");
    assert.equal(ignored.assetId, undefined);
    assert.deepEqual(removeAgentAssetSlot([slot, added], slot.slotId), [added]);
    assert.deepEqual(agentAssetSlotSummary([slot, bindAgentAssetSlot(added, { assetId: "asset-1" }), { ...slot, slotId: "slot-candidate", status: "candidate", candidateId: "candidate-1" }, ignored]), {
        total: 4,
        bound: 1,
        candidate: 1,
        placeholder: 1,
        ignored: 1,
    });
});
