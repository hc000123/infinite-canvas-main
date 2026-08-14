import type { CSSProperties } from "react";
import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

const studio = {
    light: {
        primary: "#4257a7",
        primaryHover: "#5269bf",
        primaryText: "#ffffff",
        menuBg: "rgba(66, 87, 167, 0.08)",
        menuText: "#344788",
        selectActiveBg: "#efefe9",
        selectSelectedBg: "#e5eccd",
        selectText: "#171717",
        controlBg: "#f7f7f2",
        controlHoverBg: "rgba(66, 87, 167, 0.08)",
        panelBg: "#f8f8f4",
        elevatedBg: "#fbfbf8",
        border: "rgba(23, 24, 23, 0.14)",
        borderStrong: "rgba(66, 87, 167, 0.4)",
        tableSelectedBg: "rgba(66, 87, 167, 0.08)",
        tableSelectedHoverBg: "rgba(66, 87, 167, 0.12)",
    },
    dark: {
        primary: "#8ea4ff",
        primaryHover: "#a8b8ff",
        primaryText: "#10131d",
        menuBg: "rgba(142, 164, 255, 0.1)",
        menuText: "#a8b8ff",
        selectActiveBg: "#1b1e19",
        selectSelectedBg: "#262d18",
        selectText: "#f3f4ed",
        controlBg: "#191b18",
        controlHoverBg: "rgba(142, 164, 255, 0.09)",
        panelBg: "#151714",
        elevatedBg: "#1b1e1a",
        border: "rgba(223, 226, 218, 0.12)",
        borderStrong: "rgba(142, 164, 255, 0.34)",
        tableSelectedBg: "rgba(142, 164, 255, 0.09)",
        tableSelectedHoverBg: "rgba(142, 164, 255, 0.13)",
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
            borderRadiusLG: 6,
            borderRadiusSM: 6,
            controlHeight: 34,
            controlOutline: dark ? "rgba(142, 164, 255, 0.22)" : "rgba(66, 87, 167, 0.18)",
            colorBgBase: dark ? "#0c0d0c" : "#f4f4f0",
            colorBgLayout: dark ? "#101110" : "#efefe9",
            colorBgContainer: color.panelBg,
            colorBgElevated: color.elevatedBg,
            colorFillSecondary: dark ? "rgba(255, 255, 255, 0.075)" : "rgba(15, 23, 42, 0.055)",
            colorFillTertiary: dark ? "rgba(255, 255, 255, 0.045)" : "rgba(15, 23, 42, 0.035)",
            colorBorder: color.border,
            colorBorderSecondary: color.border,
            colorText: dark ? "#f3f4ed" : "#171817",
            colorTextSecondary: dark ? "#b7bcb3" : "#545750",
            colorTextTertiary: dark ? "#7f857c" : "#747870",
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
                headerBg: dark ? "#191b18" : "#efefe9",
            },
            Tooltip: {
                colorBgSpotlight: dark ? "#1b1e1a" : "#171817",
            },
        },
    };
}
