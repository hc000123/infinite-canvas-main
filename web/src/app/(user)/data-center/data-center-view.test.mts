import assert from "node:assert/strict";
import test from "node:test";

import dayjs from "dayjs";

import { dataCenterCanExport, dataCenterDefaultScope, dataCenterDetailActions, dataCenterExportRange, dataCenterRecordColumnKeys, dataCenterSectionTitles, dataCenterScopeOptions } from "./data-center-view.ts";

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

test("data center separates overview, distribution, and records", () => {
    assert.deepEqual(dataCenterSectionTitles, ["使用概览", "使用分布", "消费明细"]);
    assert.deepEqual(dataCenterDetailActions, []);
});

test("only administrators in all-user scope can export", () => {
    assert.equal(dataCenterCanExport("admin", "all"), true);
    assert.equal(dataCenterCanExport("superadmin", "all"), true);
    assert.equal(dataCenterCanExport("admin", "mine"), false);
    assert.equal(dataCenterCanExport("user", "all"), false);
});

test("usage export defaults to the current Shanghai calendar month", () => {
    assert.deepEqual(dataCenterExportRange(dayjs("2026-08-11T12:00:00+08:00")), {
        startAt: "2026-08-01T00:00:00+08:00",
        endAt: "2026-09-01T00:00:00+08:00",
    });
});
