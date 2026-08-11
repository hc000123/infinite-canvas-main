import assert from "node:assert/strict";
import test from "node:test";

import { buildChannelModelSourceGroups } from "./model-channel-source-options.ts";
import type { AdminModelChannel } from "../../../../services/api/admin.ts";

const channel = (id: string, name: string, models: string[], enabled = true): AdminModelChannel => ({
    id,
    name,
    models,
    enabled,
    protocol: "openai",
    baseUrl: "https://api.example.com/v1",
    apiKey: "key",
    cliPath: "",
    workDir: "",
    outputDir: "",
    timeoutSeconds: 30,
    sessionId: 0,
    concurrencyLimit: 1,
    endpointId: "",
    endpointMappings: [],
    capabilities: ["text"],
    environment: "dev",
    weight: 1,
    remark: "",
});

test("系统可用模型按单一渠道和多渠道共享分组", () => {
    const groups = buildChannelModelSourceGroups([
        channel("a", "主渠道", ["shared-model", "alpha", "ep-hidden"]),
        channel("b", "备用渠道", ["shared-model", " beta ", "beta"]),
        channel("off", "已禁用", ["disabled-model"], false),
    ]);

    assert.deepEqual(groups, [
        { label: "多渠道共享", options: [{ label: "shared-model", value: "shared-model", sources: ["主渠道", "备用渠道"], searchText: "shared-model 主渠道 备用渠道" }] },
        { label: "主渠道", options: [{ label: "alpha", value: "alpha", sources: ["主渠道"], searchText: "alpha 主渠道" }] },
        { label: "备用渠道", options: [{ label: "beta", value: "beta", sources: ["备用渠道"], searchText: "beta 备用渠道" }] },
    ]);
});
