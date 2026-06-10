"use client";

import { useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { theme as antdTheme, Tooltip } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

export function CanvasToolButton({
    title,
    label,
    icon,
    onClick,
    active = false,
    danger = false,
    disabled = false,
    size = "sm",
}: {
    title?: string;
    label: string;
    icon: ReactNode;
    onClick?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
    active?: boolean;
    danger?: boolean;
    disabled?: boolean;
    size?: "sm" | "md";
}) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const { token } = antdTheme.useToken();
    const [hovered, setHovered] = useState(false);
    const dangerColor = token.colorError;
    const textColor = danger ? dangerColor : theme.toolbar.item;
    const buttonSize = size === "md" ? "h-12 w-12 px-1.5" : "h-8 w-8";
    const iconSize = size === "md" ? "size-9 rounded-lg" : "size-8 rounded-lg";
    const hoverActive = hovered && !disabled && !active;

    const tooltipText = title || label;

    return (
        <Tooltip
            title={<span style={{ color: theme.node.text }}>{tooltipText}</span>}
            placement="top"
            mouseEnterDelay={0.2}
            classNames={{ root: "canvas-tool-tooltip" }}
            styles={{ container: { color: theme.node.text } }}
        >
            <button
                type="button"
                className={`group relative grid ${buttonSize} place-items-center transition disabled:cursor-not-allowed`}
                style={{ color: textColor, opacity: disabled ? 0.35 : 1 }}
                disabled={disabled}
                onClick={onClick}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                aria-label={tooltipText}
            >
                <span
                    className={`grid ${iconSize} place-items-center transition`}
                    style={{
                        background: active ? theme.toolbar.activeBg : hoverActive ? theme.toolbar.itemHover : undefined,
                        color: active ? theme.toolbar.activeText : danger ? dangerColor : hoverActive ? theme.toolbar.activeText : undefined,
                    }}
                >
                    {icon}
                </span>
            </button>
        </Tooltip>
    );
}

export function CanvasToolDivider({ size = "sm" }: { size?: "sm" | "md" }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return <span className={`${size === "md" ? "h-7" : "h-6"} mx-1 w-px scale-x-50`} style={{ background: theme.toolbar.border }} />;
}
