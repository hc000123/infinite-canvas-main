import type { CSSProperties } from "react";
import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

const studio = {
    light: {
        primary: "#315f9f",
        primaryHover: "#4778bd",
        primaryText: "#ffffff",
        menuBg: "#eef4ff",
        menuText: "#244d86",
        selectActiveBg: "#eef4ff",
        selectSelectedBg: "#dce9ff",
        selectText: "#171717",
        controlBg: "rgba(255, 255, 255, 0.72)",
        controlHoverBg: "rgba(49, 95, 159, 0.075)",
        panelBg: "rgba(255, 255, 255, 0.82)",
        elevatedBg: "#ffffff",
        border: "rgba(15, 23, 42, 0.09)",
        borderStrong: "rgba(49, 95, 159, 0.28)",
        tableSelectedBg: "rgba(49, 95, 159, 0.08)",
        tableSelectedHoverBg: "rgba(49, 95, 159, 0.12)",
    },
    dark: {
        primary: "#6fa8ff",
        primaryHover: "#8fb9ff",
        primaryText: "#071018",
        menuBg: "rgba(111, 168, 255, 0.14)",
        menuText: "#8fb9ff",
        selectActiveBg: "#1b2230",
        selectSelectedBg: "#243045",
        selectText: "#fafafa",
        controlBg: "rgba(23, 28, 38, 0.72)",
        controlHoverBg: "rgba(111, 168, 255, 0.1)",
        panelBg: "rgba(20, 24, 33, 0.86)",
        elevatedBg: "#171c26",
        border: "rgba(148, 163, 184, 0.13)",
        borderStrong: "rgba(143, 185, 255, 0.28)",
        tableSelectedBg: "rgba(111, 168, 255, 0.11)",
        tableSelectedHoverBg: "rgba(111, 168, 255, 0.16)",
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
    const color = dark ? studio.dark : studio.light;

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
            borderRadiusLG: 8,
            borderRadiusSM: 6,
            controlHeight: 34,
            controlOutline: dark ? "rgba(111, 168, 255, 0.2)" : "rgba(49, 95, 159, 0.18)",
            colorBgBase: dark ? "#0d1016" : "#f8fafc",
            colorBgLayout: dark ? "#10141b" : "#f4f7fb",
            colorBgContainer: color.panelBg,
            colorBgElevated: color.elevatedBg,
            colorFillSecondary: dark ? "rgba(255, 255, 255, 0.075)" : "rgba(15, 23, 42, 0.055)",
            colorFillTertiary: dark ? "rgba(255, 255, 255, 0.045)" : "rgba(15, 23, 42, 0.035)",
            colorBorder: color.border,
            colorBorderSecondary: color.border,
            colorText: dark ? "#f7f9fc" : "#171717",
            colorTextSecondary: dark ? "#c7cede" : "#475569",
            colorTextTertiary: dark ? "#9aa3b4" : "#64748b",
            colorError: dark ? "#ff6b81" : "#dc2626",
            colorSuccess: dark ? "#57d57f" : "#16a34a",
            colorWarning: dark ? "#d6a74a" : "#d97706",
        },
        components: {
            Button: {
                primaryShadow: "none",
                defaultShadow: "none",
                defaultBg: color.controlBg,
                defaultHoverBg: color.controlHoverBg,
                defaultBorderColor: color.border,
                defaultHoverBorderColor: color.borderStrong,
                defaultColor: dark ? "#d7deeb" : "#334155",
                defaultHoverColor: dark ? "#f7f9fc" : "#111827",
            },
            Card: {
                colorBgContainer: color.panelBg,
                colorBorderSecondary: color.border,
                boxShadowTertiary: "none",
            },
            Drawer: {
                colorBgElevated: color.elevatedBg,
                footerPaddingBlock: 12,
                footerPaddingInline: 16,
            },
            Input: {
                activeBorderColor: color.primary,
                hoverBorderColor: color.borderStrong,
                colorBgContainer: color.controlBg,
            },
            Menu: {
                itemActiveBg: color.menuBg,
                itemHoverBg: color.menuBg,
                itemSelectedBg: color.menuBg,
                itemSelectedColor: color.menuText,
                darkItemHoverBg: studio.dark.menuBg,
                darkItemSelectedBg: studio.dark.menuBg,
                darkItemSelectedColor: studio.dark.menuText,
            },
            Select: {
                optionActiveBg: color.selectActiveBg,
                optionSelectedBg: color.selectSelectedBg,
                optionSelectedColor: color.selectText,
            },
            Tabs: {
                itemActiveColor: color.primary,
                itemHoverColor: color.primaryHover,
                itemSelectedColor: color.primary,
                inkBarColor: color.primary,
            },
            Table: {
                rowSelectedBg: color.tableSelectedBg,
                rowSelectedHoverBg: color.tableSelectedHoverBg,
                borderColor: color.border,
                headerBg: dark ? "rgba(27, 32, 43, 0.72)" : "#f8fafc",
            },
            Tooltip: {
                colorBgSpotlight: dark ? "#1b202a" : "#111827",
            },
        },
    };
}
