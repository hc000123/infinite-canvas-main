import assert from "node:assert/strict";
import test from "node:test";

import type { AdminTencentMPSTemplate } from "../../../../services/api/admin.ts";
import { mergeTencentTemplateSettings } from "./tencent-mps-template-settings.ts";

test("sync preserves administrator fields by Definition", () => {
    const current = [{ definition: 400001, displayName: "我的方案", scene: "custom", enabled: true } as AdminTencentMPSTemplate];
    const remote = [{ definition: 400001, upstreamName: "Remote", displayName: "Remote", scene: "custom", enabled: false, target: "1080p", supported: true } as AdminTencentMPSTemplate];
    const result = mergeTencentTemplateSettings(current, remote);
    assert.equal(result[0].displayName, "我的方案");
    assert.equal(result[0].enabled, true);
    assert.equal(result[0].upstreamName, "Remote");
});

test("new synchronized templates remain disabled", () => {
    const result = mergeTencentTemplateSettings([], [{ definition: 400001, enabled: true, supported: true } as AdminTencentMPSTemplate]);
    assert.equal(result[0].enabled, false);
});
