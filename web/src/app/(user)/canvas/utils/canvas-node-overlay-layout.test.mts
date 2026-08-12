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

test("node content keeps baseline progress and error routing", () => {
    const content = readCanvasFile("../components/canvas-node-content.tsx");
    const progressCheck = content.indexOf("if (shouldShowCanvasNodeProgress(props.node))");
    const imageContentCheck = content.indexOf("if (props.node.type === CanvasNodeType.Image && props.node.metadata?.content)");
    const videoContentCheck = content.indexOf("if (props.node.type === CanvasNodeType.Video && props.node.metadata?.content)");

    assert.ok(progressCheck >= 0);
    assert.ok(progressCheck < imageContentCheck);
    assert.ok(progressCheck < videoContentCheck);
    assert.match(content, /function LoadingContent/);
    assert.match(content, /function ErrorContent/);
    assert.match(content, /<VideoTaskProgressPanel node=\{node\} theme=\{theme\} onRefreshVideoTask=\{onRefreshVideoTask\} showPanel=\{showPanel\}/);
    assert.match(content, /\[CanvasNodeType\.Config\]: EmptyImageContent/);
    assert.doesNotMatch(content, /deriveCanvasNodePresentation|NodeStatusOverlay|LogoBody/);
});

test("empty images use the logo while retaining baseline quick actions", () => {
    const content = readCanvasFile("../components/canvas-node-content.tsx");

    assert.match(content, /function EmptyImageContent/);
    assert.match(content, /<CanvasLogoPlaceholder/);
    assert.match(content, /onImageQuickAction\?\.\(node, "image-to-image"\)/);
    assert.match(content, /onImageQuickAction\?\.\(node, "upscale"\)/);
});

test("canvas logo placeholder is accessible and contains no clapperboard", () => {
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
    assert.doesNotMatch(node, /0 0 0 1px|0 2px 8px/);
    assert.match(connections, /theme\.accent/);
    assert.doesNotMatch(connections, /drop-shadow/);
});
