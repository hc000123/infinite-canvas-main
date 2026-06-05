import assert from "node:assert/strict";
import test from "node:test";

import { isProjectCardInteractiveTarget, shouldOpenProjectCardFromTarget } from "./project-card-navigation.ts";

test("project card opens from plain card areas only", () => {
    assert.equal(shouldOpenProjectCardFromTarget(null), true);
    assert.equal(isProjectCardInteractiveTarget(targetMatching("")), false);
    assert.equal(isProjectCardInteractiveTarget(targetMatching("button")), true);
    assert.equal(isProjectCardInteractiveTarget(targetMatching("input")), true);
    assert.equal(isProjectCardInteractiveTarget(targetMatching("a")), true);
    assert.equal(isProjectCardInteractiveTarget(targetMatching("[data-project-card-action]")), true);
});

function targetMatching(match: string) {
    return {
        closest: (selector: string) => (selector.includes(match) && match ? {} : null),
    };
}
