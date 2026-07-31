import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./model-channel-wizard.tsx", import.meta.url), "utf8");
const presetModalSource = readFileSync(new URL("./provider-preset-modal.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../page.tsx", import.meta.url), "utf8");

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
    assert.match(presetModalSource, /普通用户在个人配置中完成即梦网页登录/);
    assert.doesNotMatch(presetModalSource, /渠道编辑中完成一次网页授权/);
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
    const invalidation = source.match(/const invalidateDiscovery = useCallback\(\(\) => \{([\s\S]*?)\n\s*}, \[\]\);/)?.[1] || "";
    assert.match(invalidation, /setDiscoveredModels\(\[\]\)/);
});

test("wizard wires discovery coordination to the live connection draft", () => {
    assert.match(source, /createModelDiscoveryCoordinator/);
    assert.match(source, /discoveryCoordinatorRef\.current\.sync/);
    assert.match(source, /setDiscoveredModels\(\[\]\)/);
    assert.match(source, /runModelDiscoveryRequest\(discoveryCoordinatorRef\.current/);
});

test("closing the wizard immediately resets the visible step", () => {
    const closeBranch = source.match(/if \(!open\) \{([\s\S]*?)\n\s*return;\n\s*\}/)?.[1] || "";
    assert.match(closeBranch, /setStep\(0\)/);
    assert.match(closeBranch, /setInitializedKey\(""\)/);
});

test("wizard unmount cleanup invalidates active discovery", () => {
    assert.match(source, /useEffect\(\(\) => \(\) => discoveryCoordinatorRef\.current\.reset\(\), \[\]\)/);
});

test("default cleanup waits for a render initialized from the current snapshot", () => {
    assert.match(source, /const \[initializedKey, setInitializedKey\] = useState\(""\)/);
    assert.match(source, /initializedKey !== initializationKey/);
    const fieldsInitializedAt = source.indexOf("form.setFieldsValue");
    const renderReadyAt = source.indexOf("setInitializedKey(initializationKey)");
    assert.ok(fieldsInitializedAt >= 0 && renderReadyAt > fieldsInitializedAt);
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
    assert.match(source, /isRoutableModelChannel/);
    assert.match(source, /modelChannelHasCapability/);
    assert.match(source, /defaultTextOptions/);
    assert.match(source, /defaultImageOptions/);
    assert.match(source, /defaultVideoOptions/);
});

test("prospective publication uses the current connection draft", () => {
    assert.match(source, /buildWizardProspectiveChannel/);
    assert.match(source, /Form\.useWatch\("baseUrl"/);
    assert.match(source, /Form\.useWatch\("apiKey"/);
});

test("protocol scoped drafts do not retain mutually exclusive connection fields", () => {
    assert.match(source, /apiConnectionDraftRef/);
    assert.match(source, /cliConnectionDraftRef/);
    assert.match(source, /scopeDraftToProtocol/);
});

test("dedicated video protocol switches constrain capabilities and clear stale publication", () => {
    const selectProtocol = source.slice(source.indexOf("const selectProtocol ="), source.indexOf("const preparePublication ="));
    assert.match(source, /capabilityDraftsRef/);
    assert.match(selectProtocol, /switchWizardProtocolCapabilities/);
    assert.match(selectProtocol, /publishedModels:\s*\[\]/);
    assert.match(selectProtocol, /applyWizardPublication/);
    assert.match(source, /dedicatedVideoProtocol/);
});

test("settings page connects create and edit actions to the channel wizard", () => {
    assert.match(pageSource, /import \{ ModelChannelWizard \} from "\.\/components\/model-channel-wizard"/);
    assert.match(pageSource, /<ModelChannelWizard/);
    assert.match(pageSource, /onClick=\{\(\) => openChannelWizard\(null\)\}/);
    assert.match(pageSource, /onClick=\{\(\) => openChannelWizard\(item\._index\)\}/);
});

test("settings page removes the legacy channel drawer and embedded model selector", () => {
    assert.doesNotMatch(pageSource, /\bDrawer\b/);
    assert.doesNotMatch(pageSource, /channelForm/);
    assert.doesNotMatch(pageSource, /isModelSelectorOpen/);
    assert.doesNotMatch(pageSource, /channelAutoSave/);
});

test("wizard persistence accepts the publication snapshot without rereading stale form state", () => {
    assert.match(pageSource, /publicModelChannel\?: AdminSettings\["public"\]\["modelChannel"\]/);
    assert.match(pageSource, /options\.publicModelChannel \|\| values\.public\.modelChannel/);
    assert.match(pageSource, /filterWizardPublicationSnapshot/);
    assert.match(pageSource, /filterWizardPublicationSnapshot\([\s\S]*?nextPublicModelChannel,[\s\S]*?nextChannels/);
    assert.match(pageSource, /finishChannelWizard\(channel, publicModelChannel\)/);
    assert.match(pageSource, /persistChannels\(nextChannels, \{ publicModelChannel, setPending: setIsSavingChannelWizard \}\)/);
    assert.match(pageSource, /finishAuthoritativeSettingsOperation/);
    assert.match(pageSource, /setPending:\s*setIsSavingChannelWizard/);
});

test("page guards verification state with a session coordinator", () => {
    assert.match(pageSource, /createChannelVerificationCoordinator/);
    assert.match(pageSource, /verificationCoordinatorRef/);
    assert.ok((pageSource.match(/verificationCoordinatorRef\.current\.reset\(\)/g) || []).length >= 2);
    assert.match(pageSource, /verificationCoordinatorRef\.current\.begin/);
    assert.match(pageSource, /verificationCoordinatorRef\.current\.isCurrent/);
    assert.match(pageSource, /verificationCoordinatorRef\.current\.finish/);
    const beginAt = pageSource.indexOf("verificationCoordinatorRef.current.begin");
    const firstGuardAt = pageSource.indexOf("verificationCoordinatorRef.current.isCurrent", beginAt);
    const setTestingAt = pageSource.indexOf("setTestingModels", beginAt);
    assert.ok(beginAt >= 0 && firstGuardAt > beginAt && setTestingAt > firstGuardAt);
});

test("wizard discovery keeps the existing channel index and normalized draft", () => {
    assert.match(pageSource, /onDiscoverModels/);
    assert.match(pageSource, /fetchChannelModels\(token, \{ index: editingChannelIndex \?\? undefined, channel: normalizeChannel\(channel\) \}\)/);
    const callback = pageSource.match(/const discoverChannelModels = async[\s\S]*?\n\s*};/)?.[0] || "";
    assert.doesNotMatch(callback, /rememberModels|setKnownModels/);
    assert.match(source, /modelDiscoveryCandidates\(configuredModels, discoveredModels\)/);
    assert.doesNotMatch(pageSource, /\brememberKnownModels\b/);
    assert.doesNotMatch(pageSource, /rememberConfiguredChannelModels/);
    assert.match(pageSource, /syncConfiguredModelsFromAuthoritativeSettings/);
});

test("page delegates verification orchestration and copy to executable helpers", () => {
    assert.match(pageSource, /channelVerificationCopy/);
    assert.match(pageSource, /runChannelVerification/);
    assert.match(pageSource, /fetchChannelModels\(token, \{ index: testChannelIndex, channel \}\)/);
    assert.match(pageSource, /连接与鉴权可用；未创建视频任务/);
    assert.match(pageSource, /channelVerificationCopy\(item\)\.tableLabel/);
});

test("settings page keeps provider presets and channel table operations", () => {
    assert.match(pageSource, /<ProviderPresetModal/);
    assert.match(pageSource, /openTestDialog\(item\._index\)/);
    assert.match(pageSource, /openChannelWizard\(item\._index\)/);
    assert.match(pageSource, /DeleteOutlined/);
    assert.match(pageSource, /deleteChannel\(item\.id\)/);
    assert.match(pageSource, /message\.error\(error instanceof Error \? error\.message : "保存失败"\)/);
});
