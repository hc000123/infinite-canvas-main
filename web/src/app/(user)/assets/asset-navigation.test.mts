import assert from "node:assert/strict";
import test from "node:test";

import { assetSubjectHref } from "./asset-navigation.ts";

test("asset subject returns to the exact filtered asset list", () => {
    const href = assetSubjectHref("subject 1", "/assets", "projectId=p1&kind=image");
    const url = new URL(href, "https://workspace.test");
    assert.equal(url.pathname, "/assets/subject%201");
    assert.equal(url.searchParams.get("returnTo"), "/assets?projectId=p1&kind=image");
    assert.equal(url.searchParams.get("returnLabel"), "返回素材");
});
