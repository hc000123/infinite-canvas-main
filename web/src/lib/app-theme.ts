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
            colorBgBase: dark ? "#0f1117" : "#fbfcff",
            colorBgLayout: dark ? "#101217" : "#f5f7fb",
            colorBgContainer: dark ? "#151821" : "#ffffff",
            colorBgElevated: dark ? "#1b202a" : "#ffffff",
            colorFillSecondary: dark ? "rgba(255, 255, 255, 0.08)" : "rgba(15, 23, 42, 0.06)",
            colorFillTertiary: dark ? "rgba(255, 255, 255, 0.055)" : "rgba(15, 23, 42, 0.04)",
            colorBorder: dark ? "#262b36" : "rgba(15, 23, 42, 0.12)",
            colorBorderSecondary: dark ? "#202633" : "rgba(15, 23, 42, 0.08)",
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
                defaultBg: dark ? "#151821" : "#ffffff",
                defaultBorderColor: dark ? "#303642" : "rgba(15, 23, 42, 0.14)",
                defaultColor: dark ? "#d7deeb" : "#334155",
            },
            Card: {
                colorBgContainer: dark ? "#151821" : "#ffffff",
                colorBorderSecondary: dark ? "#262b36" : "rgba(15, 23, 42, 0.1)",
                boxShadowTertiary: "none",
            },
            Drawer: {
                colorBgElevated: dark ? "#151821" : "#ffffff",
                footerPaddingBlock: 12,
                footerPaddingInline: 16,
            },
            Input: {
                activeBorderColor: color.primary,
                hoverBorderColor: dark ? "#343b49" : "rgba(15, 23, 42, 0.22)",
                colorBgContainer: dark ? "#101217" : "#ffffff",
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
                borderColor: dark ? "#262b36" : "rgba(15, 23, 42, 0.1)",
                headerBg: dark ? "#191d26" : "#f8fafc",
            },
            Tooltip: {
                colorBgSpotlight: dark ? "#1b202a" : "#111827",
            },
        },
    };
}
