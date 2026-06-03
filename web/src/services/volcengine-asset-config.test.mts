import assert from "node:assert/strict";
import test from "node:test";

import { VOLCENGINE_ASSET_CONFIG_NOTICE, summarizeVolcengineAssetConfig } from "./volcengine-asset-config.ts";

test("summarizes editable Volcengine asset config without exposing keys", () => {
    assert.deepEqual(
        summarizeVolcengineAssetConfig({
            enabled: true,
            accessKey: "ak-test",
            secretKey: "sk-test",
            projectName: "default",
            region: "cn-beijing",
            assetGroupId: "group-test",
            publicAssetBaseUrl: "https://example.com/assets",
        }),
        {
            statusText: "已开启",
            statusColor: "success",
            projectName: "default",
            region: "cn-beijing",
            assetGroupId: "group-test",
        },
    );
});

test("summarizes public-only Volcengine asset config as admin-only details", () => {
    assert.deepEqual(summarizeVolcengineAssetConfig({ enabled: false }, { showDetails: false }), {
        statusText: "未开启",
        statusColor: "default",
        projectName: "请到后台系统设置查看",
        region: "请到后台系统设置查看",
        assetGroupId: "请到后台系统设置查看",
    });
});

test("explains asset review config is separate from Seedance video channel keys", () => {
    assert.match(VOLCENGINE_ASSET_CONFIG_NOTICE, /加白配置不同于 Seedance 生成渠道/);
    assert.match(VOLCENGINE_ASSET_CONFIG_NOTICE, /填一次即可/);
    assert.match(VOLCENGINE_ASSET_CONFIG_NOTICE, /本地直连\/云端渠道只影响视频生成 Key/);
});
