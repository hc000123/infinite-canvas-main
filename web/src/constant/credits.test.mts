import assert from "node:assert/strict";
import test from "node:test";

import { requestCreditQuantity } from "./credit-quantity.ts";

test("uses 30 seconds for Ark Seedance 2.5 edit credit previews", () => {
    assert.equal(requestCreditQuantity({ count: "6", videoProtocol: "volcengine-ark", videoModel: "doubao-seedance-2-5", videoTaskMode: "edit" }), 30);
    assert.equal(requestCreditQuantity({ count: "6", videoProtocol: "volcengine-ark", videoModel: "seedance-2.50", videoTaskMode: "edit" }), 6);
    assert.equal(requestCreditQuantity({ count: "6", videoProtocol: "volcengine-ark", videoModel: "doubao-seedance-2-5", videoTaskMode: "generate" }), 6);
    assert.equal(requestCreditQuantity({ count: "6", videoProtocol: "openai", videoModel: "doubao-seedance-2-5", videoTaskMode: "edit" }), 6);
});
