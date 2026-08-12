import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readCanvasFile(path: string) {
    return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("media version control keeps its label in one compact group", () => {
    const control = readCanvasFile("../components/canvas-media-version-control.tsx");

    assert.match(control, /inline-flex shrink-0 items-center overflow-hidden whitespace-nowrap rounded-lg border/);
    assert.match(control, /shrink-0 whitespace-nowrap/);
});

test("node hover toolbar always stays above the node content", () => {
    const toolbar = readCanvasFile("../components/canvas-node-hover-toolbar.tsx");

    assert.match(toolbar, /const top = viewport\.y \+ node\.position\.y \* viewport\.k - 12;/);
    assert.match(toolbar, /-translate-x-1\/2 -translate-y-full/);
    assert.doesNotMatch(toolbar, /shouldOverlayMedia/);
});

test("node content renders real media before adding status overlays", () => {
    const content = readCanvasFile("../components/canvas-node-content.tsx");
    const bodyCheck = content.indexOf('presentation.body === "media"');
    const overlayCheck = content.indexOf('presentation.overlay === "loading"');

    assert.ok(bodyCheck >= 0);
    assert.ok(overlayCheck > bodyCheck);
    assert.match(content, /deriveCanvasNodePresentation/);
    assert.match(content, /CanvasLogoPlaceholder/);
    assert.doesNotMatch(content, /Clapperboard|clapper|场记板/i);
});

test("logo-based empty images retain their existing quick action callbacks", () => {
    const content = readCanvasFile("../components/canvas-node-content.tsx");

    assert.match(content, /onImageQuickAction\?\.\(node, "image-to-image"\)/);
    assert.match(content, /onImageQuickAction\?\.\(node, "upscale"\)/);
});

test("empty videos preserve frame reference previews and task refresh actions", () => {
    const content = readCanvasFile("../components/canvas-node-content.tsx");

    assert.match(content, /props\.node\.type === CanvasNodeType\.Video && Boolean\(props\.frameReferenceNodes\?\.first \|\| props\.frameReferenceNodes\?\.last\)/);
    assert.match(content, /hasVideoFramePreview \? <Renderer \{\.\.\.props\} \/>/);
    assert.match(content, /<NodeStatusOverlay[\s\S]*onRefreshVideoTask=\{props\.onRefreshVideoTask\}/);
    assert.match(content, /node\.type === CanvasNodeType\.Video && node\.metadata\?\.taskId/);
    assert.doesNotMatch(content, /node\.metadata\?\.taskId \|\| node\.metadata\?\.aiTaskId/);
    assert.match(content, /onRefreshVideoTask\?\.\(node\)/);
    assert.match(content, /刷新状态/);
});

test("config fallback uses non-logo content", () => {
    const content = readCanvasFile("../components/canvas-node-content.tsx");

    assert.match(content, /\[CanvasNodeType\.Config\]: ConfigContent/);
    assert.match(content, /function ConfigContent/);
    assert.doesNotMatch(content, /\[CanvasNodeType\.Config\]: EmptyImageContent/);
});

test("canvas logo placeholder is accessible and owns the only canvas logo reference", () => {
    const logo = readCanvasFile("../components/canvas-logo-placeholder.tsx");

    assert.equal((logo.match(/\/logo\.svg/g) || []).length, 1);
    assert.match(logo, /aria-label=/);
    assert.match(logo, /alt=""/);
    assert.doesNotMatch(logo, /Clapperboard|clapper|场记板/i);
});

test("editorial canvas theme exposes warm surface, accent, and focus tokens", () => {
    const theme = readCanvasFile("../../../../lib/canvas-theme.ts");

    for (const token of ["accent", "surfaceRaised", "surfaceOverlay", "focusRing"]) assert.equal((theme.match(new RegExp(`${token}:`, "g")) || []).length, 2);
    assert.match(theme, /background: "#171512"/);
    assert.match(theme, /fill: "#24211B"/);
    assert.match(theme, /panel: "#2A261F"/);
    assert.match(theme, /accent: "#DF593B"/);
    assert.match(theme, /accent: "#C94D34"/);
});

test("node and connection styling uses thin editorial accents without glow", () => {
    const node = readCanvasFile("../components/canvas-node.tsx");
    const connections = readCanvasFile("../components/canvas-connections.tsx");

    assert.match(node, /rounded-\[4px\] border/);
    assert.doesNotMatch(node, /isRelated && !isBatchChild \? theme\.node\.muted : "transparent"/);
    assert.doesNotMatch(node, /0 0 0 1px/);
    assert.doesNotMatch(node, /0 2px 8px/);
    assert.match(connections, /theme\.accent/);
    assert.doesNotMatch(connections, /drop-shadow/);
});
