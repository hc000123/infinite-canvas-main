import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./model-channel-wizard.tsx", import.meta.url), "utf8");

test("channel wizard exposes four named steps", () => {
    ["选择渠道类型", "连接信息", "配置模型", "确认使用范围"].forEach((label) => assert.match(source, new RegExp(label)));
});

test("model step supports manual names and Ark endpoint mappings", () => {
    assert.match(source, /mode="tags"/);
    assert.match(source, /手动输入模型名称/);
    assert.match(source, /endpointMappings/);
    assert.match(source, /火山 Endpoint \/ EP/);
});

test("Jimeng copy keeps personal login outside admin setup", () => {
    assert.match(source, /管理员只检查 CLI 环境，用户仍在个人配置中完成即梦网页登录/);
});

test("publication is explicit", () => {
    assert.match(source, /保存渠道不会自动公开，只有这里选中的模型会加入系统可用模型/);
});
