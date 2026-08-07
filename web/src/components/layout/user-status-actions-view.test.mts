import assert from "node:assert/strict";
import test from "node:test";

import { accountDestinationItems } from "./user-status-actions-view.ts";

test("all authenticated roles receive data center before admin tools", () => {
    assert.deepEqual(accountDestinationItems("user"), [{ key: "data-center", label: "数据中心", href: "/data-center" }]);
    assert.deepEqual(
        accountDestinationItems("admin").map((item) => item.key),
        ["data-center", "admin"],
    );
});
