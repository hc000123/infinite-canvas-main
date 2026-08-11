import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./video-settings-panel.tsx", import.meta.url), "utf8");
const configNodeSource = readFileSync(new URL("../app/(user)/canvas/components/canvas-config-node-panel.tsx", import.meta.url), "utf8");
const popoverSource = readFileSync(new URL("../app/(user)/canvas/components/canvas-video-settings-popover.tsx", import.meta.url), "utf8");

test("video settings derive Dreamina ranges from the shared capability resolver", () => {
    assert.match(source, /resolveDreaminaVideoCapability/);
    assert.match(source, /normalizeDreaminaVideoSettings/);
    assert.match(source, /dreaminaCapability\.resolutions/);
    assert.match(source, /dreaminaCapability\.duration/);
    assert.match(source, /dreaminaCapability\?\.durationOptions/);
    assert.match(source, /dreaminaCapability\?\.fallbackResolution/);
    assert.doesNotMatch(source, /config\.videoModel === "seedance2\.5"/);
});

test("video settings show MiniMax 2K and hide unsupported controls", () => {
    assert.match(source, /config\.videoProtocol === "minimax" && value === "2160" \? "2K"/);
    assert.match(source, /dreaminaCapability\?\.fallbackResolution \|\| "720"/);
    assert.match(source, /supportsGenerateAudio/);
    assert.match(source, /supportsSeed/);
    assert.match(source, /videoResolutionLabel\(value: string, config\?:/);
    assert.match(source, /showTaskMode && supportsSeedanceTaskMode/);
    assert.match(configNodeSource, /showMultiFrame=\{config\.videoProtocol !== "minimax"\}/);
    assert.match(configNodeSource, /videoResolutionLabel\(config\.vquality, config\)/);
    assert.match(popoverSource, /videoResolutionLabel\(config\.vquality, config\)/);
});
