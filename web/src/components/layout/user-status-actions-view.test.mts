import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { accountDestinationItems } from "./user-status-actions-view.ts";

test("all authenticated roles receive data center before admin tools", () => {
    assert.deepEqual(accountDestinationItems("user"), [{ key: "data-center", label: "数据中心", href: "/data-center" }]);
    assert.deepEqual(
        accountDestinationItems("admin").map((item) => item.key),
        ["data-center", "admin"],
    );
});

test("account logout clears the session and opens login even when activity reporting fails", () => {
    const source = fs.readFileSync(new URL("./user-status-actions.tsx", import.meta.url), "utf8");
    const logoutItem = source.slice(source.indexOf('key: "logout"'), source.indexOf("    ];", source.indexOf('key: "logout"')));
    assert.match(logoutItem, /try \{[\s\S]*reportActivity\([\s\S]*\} finally \{[\s\S]*logout\(\);[\s\S]*window\.location\.replace\("\/login"\);[\s\S]*\}/);
});
