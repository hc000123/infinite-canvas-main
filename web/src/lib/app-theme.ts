import type { CSSProperties } from "react";
import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

const neutral = {
    light: {
        primary: "#0f766e",
        primaryHover: "#0d9488",
        primaryText: "#ffffff",
        menuBg: "#eefaf7",
        menuText: "#134e4a",
        selectActiveBg: "#eefaf7",
        selectSelectedBg: "#dff7f1",
        selectText: "#171717",
        tableSelectedBg: "rgba(15, 118, 110, 0.08)",
        tableSelectedHoverBg: "rgba(15, 118, 110, 0.12)",
    },
    dark: {
        primary: "#5eead4",
        primaryHover: "#99f6e4",
        primaryText: "#042f2e",
        menuBg: "#0f2f2b",
        menuText: "#ccfbf1",
        selectActiveBg: "#0f2f2b",
        selectSelectedBg: "#123c36",
        selectText: "#fafafa",
        tableSelectedBg: "rgba(94, 234, 212, 0.11)",
        tableSelectedHoverBg: "rgba(94, 234, 212, 0.16)",
    },
};

export const adminLayoutStyle = {
    siderWidth: 232,
    headerHeight: 56,
    brandHeight: 64,
    menu: { borderInlineEnd: 0, padding: "18px 12px", fontSize: 15 } satisfies CSSProperties,
    menuItem: { height: 44, lineHeight: "44px", marginBlock: 4, borderRadius: 8 } satisfies CSSProperties,
};

export function getAntThemeConfig(dark: boolean): ThemeConfig {
    const color = dark ? neutral.dark : neutral.light;

    return {
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        cssVar: { key: dark ? "infinite-canvas-dark" : "infinite-canvas-light" },
        token: {
            colorPrimary: color.primary,
            colorInfo: color.primary,
            colorLink: color.primary,
            colorLinkHover: color.primaryHover,
            colorLinkActive: color.primary,
            colorTextLightSolid: color.primaryText,
            borderRadius: 8,
            colorBgContainer: dark ? "#101313" : "#fffefa",
            colorBgElevated: dark ? "#111515" : "#fffefa",
            colorBorder: dark ? "rgba(255, 255, 255, 0.12)" : "rgba(28, 25, 23, 0.12)",
        },
        components: {
            Button: {
                primaryShadow: "none",
            },
            Menu: {
                itemActiveBg: color.menuBg,
                itemHoverBg: color.menuBg,
                itemSelectedBg: color.menuBg,
                itemSelectedColor: color.menuText,
                darkItemHoverBg: neutral.dark.menuBg,
                darkItemSelectedBg: neutral.dark.menuBg,
                darkItemSelectedColor: neutral.dark.menuText,
            },
            Select: {
                optionActiveBg: color.selectActiveBg,
                optionSelectedBg: color.selectSelectedBg,
                optionSelectedColor: color.selectText,
            },
            Table: {
                rowSelectedBg: color.tableSelectedBg,
                rowSelectedHoverBg: color.tableSelectedHoverBg,
            },
        },
    };
}
