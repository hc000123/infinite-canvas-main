import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const sectionSource = readFileSync(new URL("./components/image-upscale-settings-section.tsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../../../../services/api/admin.ts", import.meta.url), "utf8");

test("图片超分设置使用私有表单路径和密码输入", () => {
    for (const field of ["enabled", "provider", "accessKeyId", "accessKeySecret", "securityToken"]) {
        assert.match(sectionSource, new RegExp(`\"private\", \"imageUpscale\", \"${field}\"`));
    }
    assert.match(sectionSource, /Input\.Password/);
    assert.match(sectionSource, /accessKeyIdConfigured/);
    assert.match(sectionSource, /accessKeySecretConfigured/);
    assert.match(sectionSource, /securityTokenConfigured/);
    assert.match(sectionSource, /https:\/\/ram\.console\.aliyun\.com\/manage\/ak/);
    assert.match(sectionSource, /target="_blank"/);
});

test("图片超分连接测试使用管理员接口且不保存设置", () => {
    assert.match(apiSource, /\/api\/admin\/settings\/image-upscale-test/);
    assert.match(pageSource, /testAdminImageUpscale\(token/);
    const handler = pageSource.slice(pageSource.indexOf("const testImageUpscale"), pageSource.indexOf("const applyProviderPreset"));
    assert.doesNotMatch(handler, /saveAdminSettings/);
});
