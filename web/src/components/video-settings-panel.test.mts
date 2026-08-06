import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./video-settings-panel.tsx", import.meta.url), "utf8");

test("video settings derive Dreamina ranges from the shared capability resolver", () => {
    assert.match(source, /resolveDreaminaVideoCapability/);
    assert.match(source, /dreaminaCapability\.resolutions/);
    assert.match(source, /dreaminaCapability\.duration/);
    assert.doesNotMatch(source, /config\.videoModel === "seedance2\.5"/);
});
