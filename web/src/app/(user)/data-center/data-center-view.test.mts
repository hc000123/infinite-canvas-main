import assert from "node:assert/strict";
import test from "node:test";

import { dataCenterDefaultScope, dataCenterRecordColumnKeys, dataCenterScopeOptions } from "./data-center-view.ts";

test("ordinary users are fixed to their own usage", () => {
    assert.equal(dataCenterDefaultScope("user"), "mine");
    assert.deepEqual(dataCenterScopeOptions("user"), []);
});

test("administrators default to all users and can switch scope", () => {
    assert.equal(dataCenterDefaultScope("admin"), "all");
    assert.deepEqual(
        dataCenterScopeOptions("superadmin").map((item) => item.value),
        ["all", "mine"],
    );
});

test("default record columns stay business focused", () => {
    assert.deepEqual(dataCenterRecordColumnKeys("mine"), ["createdAt", "kind", "model", "netCredits", "creditsRefunded", "status"]);
    assert.deepEqual(dataCenterRecordColumnKeys("all"), ["createdAt", "user", "kind", "model", "netCredits", "creditsRefunded", "status"]);
    for (const key of ["provider", "upstreamTaskId", "errorMessage", "actions"]) {
        assert.equal(dataCenterRecordColumnKeys("all").includes(key), false);
    }
});
