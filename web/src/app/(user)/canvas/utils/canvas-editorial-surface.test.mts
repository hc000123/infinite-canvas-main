import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const componentsUrl = new URL("../components/", import.meta.url);

function source(name: string) {
    return readFileSync(new URL(name, componentsUrl), "utf8");
}

function editorialSurfaces(name: string) {
    return [...source(name).matchAll(/data-canvas-editorial-surface[^>]*?className="([^"]+)"/gs)].map(([, className]) => className);
}

test("常驻画布工具表面使用主题面板、小圆角和一像素边界", () => {
    for (const name of ["canvas-toolbar.tsx", "canvas-node-hover-toolbar.tsx", "canvas-create-rail.tsx", "canvas-production-package-bar.tsx", "canvas-zoom-controls.tsx", "canvas-mini-map.tsx"]) {
        const content = source(name);
        const surfaces = editorialSurfaces(name);
        assert.match(content, /canvasThemes/);
        assert.match(content, /background:\s*theme\.toolbar\.panel/);
        assert.ok(surfaces.length, `${name} 应标记常驻编辑表面`);
        for (const surface of surfaces) {
            assert.match(surface, /rounded-md/);
            assert.match(surface, /\bborder\b/);
            assert.doesNotMatch(surface, /backdrop-blur|var\(--studio-shadow\)|rounded-(?:xl|2xl|3xl)/);
        }
    }
});

test("右侧检查器保持常驻结构并使用平面主题表面", () => {
    const context = source("canvas-context-inspector.tsx");
    const side = source("canvas-side-inspector.tsx");
    const surfaces = editorialSurfaces("canvas-context-inspector.tsx");

    assert.equal(surfaces.length, 2, "展开和折叠外壳都应纳入视觉契约");
    assert.match(context, /background:\s*theme\.node\.panel/);
    for (const surface of surfaces) {
        assert.match(surface, /\bborder-l\b/);
        assert.doesNotMatch(surface, /backdrop-blur|var\(--studio-shadow\)|rounded-(?:xl|2xl|3xl)/);
    }

    for (const prop of ["collapsed={collapsed}", "onCollapsedChange={onCollapsedChange}", "assistantSlot=", "selectedNode={selectedNode}", "selectedProductionPackage={selectedProductionPackage}", "selectedShot={selectedShot}"]) {
        assert.match(side, new RegExp(prop.replace(/[{}]/g, "\\$&")), `CanvasSideInspector 应保留 ${prop}`);
    }
    for (const component of ["CanvasAssistantPanel", "NodeInspector", "ProductionPackageContentView", "ShotInspector", "CanvasOverview"]) {
        assert.match(side + context, new RegExp(`<${component}\\b`), `右栏应保留 ${component}`);
    }
    assert.match(context, /md:w-\[clamp\(320px,30vw,420px\)\]/);
    assert.match(context, /onViewChange\("assistant"\)/);
    assert.match(context, /onViewChange\("context"\)/);
});

test("顶部栏继续保持无常驻面板阴影的扁平结构", () => {
    const topBar = source("canvas-top-bar.tsx");
    const header = topBar.match(/<div className="pointer-events-none absolute left-0 right-0 top-0[^>]+>/)?.[0] || "";
    assert.ok(header);
    assert.doesNotMatch(header, /backdrop-blur|shadow-|rounded-(?:xl|2xl|3xl)/);
    assert.match(topBar, /canvasThemes/);
});
