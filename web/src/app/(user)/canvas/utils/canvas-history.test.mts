import assert from "node:assert/strict";
import test from "node:test";

import { canvasHistoryAvailability, createEmptyCanvasHistoryStack, isSameCanvasHistoryEntry, pushCanvasHistoryEntry, redoCanvasHistory, undoCanvasHistory, type CanvasHistoryEntry } from "./canvas-history.ts";

function entry(id: string): CanvasHistoryEntry {
    return {
        nodes: [{ id, type: "text", title: id, position: { x: 0, y: 0 }, width: 100, height: 80 }],
        connections: [],
        chatSessions: [],
        activeChatId: null,
        backgroundMode: "lines",
        showImageInfo: false,
    };
}

test("pushes history entries with bounded past and clears redo stack", () => {
    let stack = { past: [entry("old"), entry("mid")], future: [entry("redo")] };
    stack = pushCanvasHistoryEntry(stack, entry("new"), 2);

    assert.deepEqual(
        stack.past.map((item) => item.nodes[0].id),
        ["mid", "new"],
    );
    assert.equal(stack.future.length, 0);
    assert.deepEqual(canvasHistoryAvailability(stack), { canUndo: true, canRedo: false });
});

test("undo and redo return target entries without mutating the source stack", () => {
    const current = entry("current");
    const stack = { past: [entry("first"), entry("previous")], future: [] };

    const undone = undoCanvasHistory(stack, current);
    assert.equal(undone.entry?.nodes[0].id, "previous");
    assert.deepEqual(
        undone.stack.past.map((item) => item.nodes[0].id),
        ["first"],
    );
    assert.deepEqual(
        undone.stack.future.map((item) => item.nodes[0].id),
        ["current"],
    );
    assert.equal(stack.past.length, 2);

    const redone = redoCanvasHistory(undone.stack, undone.entry);
    assert.equal(redone.entry?.nodes[0].id, "current");
    assert.deepEqual(
        redone.stack.past.map((item) => item.nodes[0].id),
        ["first", "previous"],
    );
    assert.equal(redone.stack.future.length, 0);
});

test("empty history operations are no-ops and entry comparison uses state references", () => {
    const first = entry("same");
    const sameRefs = { ...first };
    const differentNodes = { ...first, nodes: [...first.nodes] };

    assert.equal(undoCanvasHistory(createEmptyCanvasHistoryStack(), first).entry, null);
    assert.equal(redoCanvasHistory(createEmptyCanvasHistoryStack(), first).entry, null);
    assert.equal(isSameCanvasHistoryEntry(first, sameRefs), true);
    assert.equal(isSameCanvasHistoryEntry(first, differentNodes), false);
});
