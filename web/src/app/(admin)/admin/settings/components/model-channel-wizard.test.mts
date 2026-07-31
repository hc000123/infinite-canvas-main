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

test("wizard initialization uses a stable snapshot and explicitly invalidates discovery", () => {
    assert.match(source, /const initializationKey = wizardInitializationKey/);
    assert.match(source, /initializedKeyRef/);
    assert.match(source, /initializedKeyRef\.current === initializationKey/);
    assert.match(source, /invalidateDiscovery/);
    assert.match(source, /setDiscovering\(false\)/);
});

test("finish has a synchronous local submission lock", () => {
    assert.match(source, /const \[submitting, setSubmitting\] = useState\(false\)/);
    assert.match(source, /submittingRef\.current/);
    assert.match(source, /const busy = saving \|\| submitting/);
    assert.match(source, /if \(saving \|\| submittingRef\.current\) return/);
    assert.match(source, /finally[\s\S]*submittingRef\.current = false[\s\S]*setSubmitting\(false\)/);
});

test("default model options follow explicit publication and capability", () => {
    assert.match(source, /Form\.useWatch\("publishedModels"/);
    assert.match(source, /applyWizardPublication/);
    assert.match(source, /modelMatchesAiCapability/);
    assert.match(source, /defaultTextOptions/);
    assert.match(source, /defaultImageOptions/);
    assert.match(source, /defaultVideoOptions/);
});

test("protocol scoped drafts do not retain mutually exclusive connection fields", () => {
    assert.match(source, /apiConnectionDraftRef/);
    assert.match(source, /cliConnectionDraftRef/);
    assert.match(source, /scopeDraftToProtocol/);
});
