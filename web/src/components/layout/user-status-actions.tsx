"use client";

import type { CSSProperties, RefObject } from "react";
import { Avatar, Dropdown, Tooltip } from "antd";
import { BarChart3, Keyboard, LogOut, Settings2, Shield } from "lucide-react";
import type { ItemType } from "antd/es/menu/interface";
import Link from "next/link";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { VersionReleaseModal } from "@/components/layout/version-release-modal";
import { CreditSymbol } from "@/constant/credits";
import { canvasThemes } from "@/lib/canvas-theme";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import { useActivityAudit } from "@/hooks/use-activity-audit";
import { accountDestinationItems } from "./user-status-actions-view";

type UserStatusActionsProps = {
    showConfig?: boolean;
    hideVersion?: boolean;
    variant?: "default" | "canvas" | "text";
    onOpenShortcuts?: () => void;
    accountOpen?: boolean;
    onAccountOpenChange?: (open: boolean) => void;
    accountRef?: RefObject<HTMLDivElement | null>;
    getPopupContainer?: (node: HTMLElement) => HTMLElement;
};

export function UserStatusActions({ showConfig = true, hideVersion = false, variant = "default", onOpenShortcuts, accountOpen, onAccountOpenChange, accountRef, getPopupContainer }: UserStatusActionsProps) {
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const user = useUserStore((state) => state.user);
    const logout = useUserStore((state) => state.logout);
    const reportActivity = useActivityAudit();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const canvasTheme = canvasThemes[theme];
    const userName = user?.displayName || user?.username || "";
    const credits = user?.credits ?? 0;
    const avatarUrl = user?.avatarUrl?.trim();
    const avatarText = (userName.trim()[0] || "U").toUpperCase();
    const actionClass =
        variant === "canvas"
            ? "inline-flex size-8 shrink-0 items-center justify-center rounded-md opacity-85 transition hover:bg-[var(--studio-hover-bg)] hover:opacity-100 [&_svg]:size-4"
            : variant === "text"
              ? "workspace-top-button"
              : "inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-transparent text-[var(--studio-text-secondary)] transition hover:border-[var(--studio-border-subtle)] hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)] [&_svg]:size-4";
    const iconStyle: CSSProperties | undefined = variant === "canvas" ? { color: canvasTheme.node.text } : undefined;
    const versionStyle = iconStyle;
    const avatarStyle: CSSProperties | undefined = variant === "canvas" ? { borderColor: canvasTheme.toolbar.border, color: canvasTheme.node.text, background: "transparent" } : undefined;
    const themeToggleLabel = theme === "dark" ? "切换到全局浅色主题" : "切换到全局深色主题";
    const menuItems: ItemType[] = [
        { key: "user", disabled: true, label: <span className="font-medium text-current">{userName}</span> },
        ...(user
            ? accountDestinationItems(user.role).map((item) => ({
                  key: item.key,
                  icon: item.key === "data-center" ? <BarChart3 className="size-4" /> : <Shield className="size-4" />,
                  label: <Link href={item.href}>{item.label}</Link>,
              }))
            : []),
        ...(onOpenShortcuts ? [{ key: "shortcuts", icon: <Keyboard className="size-4" />, label: "快捷键", onClick: onOpenShortcuts }] : []),
        { type: "divider" },
        {
            key: "logout",
            icon: <LogOut className="size-4" />,
            label: "退出登录",
            onClick: () => {
                try {
                    reportActivity("account.logout", { summary: "退出登录" });
                } finally {
                    void logout();
                    window.location.replace("/login");
                }
            },
        },
    ];

    return (
        <div className="inline-flex shrink-0 items-center gap-1.5">
            {showConfig ? (
                <button type="button" className={`${actionClass} ${variant === "text" ? "hidden sm:inline-flex" : ""}`} style={iconStyle} onClick={() => openConfigDialog(false)} aria-label="配置" title="配置">
                    {variant === "text" ? "配置" : <Settings2 className="size-4" />}
                </button>
            ) : null}
            <AnimatedThemeToggler theme={theme} onThemeChange={setTheme} className={`${actionClass} ${variant === "text" ? "hidden sm:inline-flex" : ""}`} style={iconStyle} aria-label={themeToggleLabel} title={themeToggleLabel}>
                {variant === "text" ? (theme === "dark" ? "浅色" : "深色") : undefined}
            </AnimatedThemeToggler>
            {hideVersion ? null : <VersionReleaseModal className={variant === "text" ? `${actionClass} hidden sm:inline-flex` : undefined} style={versionStyle} />}
            {variant === "canvas" && user ? (
                <Tooltip title="查看数据中心" placement="bottom">
                    <Link href="/data-center" className="flex h-8 shrink-0 items-center gap-1.5 px-1.5 text-xs font-medium tabular-nums opacity-75 transition hover:opacity-100" style={{ color: canvasTheme.node.text }}>
                        <CreditSymbol className="text-sm leading-none" />
                        <span>{credits.toLocaleString()}</span>
                    </Link>
                </Tooltip>
            ) : null}
            {!user && onOpenShortcuts ? (
                <button type="button" className={actionClass} style={iconStyle} onClick={onOpenShortcuts} aria-label="快捷键" title="快捷键">
                    {variant === "text" ? "快捷键" : <Keyboard className="size-4" />}
                </button>
            ) : null}
            {!user ? (
                <Link
                    href="/login"
                    className={
                        variant === "canvas"
                            ? "px-1.5 text-sm font-medium opacity-85 underline-offset-4 transition hover:opacity-100 hover:underline"
                            : variant === "text"
                              ? "workspace-top-button"
                              : "rounded-md px-2 py-1 text-sm font-medium text-[var(--studio-text-secondary)] underline-offset-4 transition hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)] hover:no-underline"
                    }
                    style={iconStyle}
                >
                    登录
                </Link>
            ) : null}
            {user ? (
                <div ref={accountRef}>
                    <Dropdown open={accountOpen} onOpenChange={onAccountOpenChange} trigger={["click"]} placement="bottomRight" getPopupContainer={getPopupContainer} styles={{ root: { minWidth: 150 } }} menu={{ items: menuItems }}>
                        <button
                            type="button"
                            className={variant === "text" ? `${actionClass} max-w-28 overflow-hidden text-ellipsis whitespace-nowrap` : "flex size-8 shrink-0 items-center justify-center rounded-full bg-transparent p-0 text-[0] leading-[0] transition"}
                            aria-label="账户菜单"
                        >
                            {variant === "text" ? (
                                userName
                            ) : (
                                <Avatar
                                    size={28}
                                    src={avatarUrl ? <img src={avatarUrl} alt={userName} referrerPolicy="no-referrer" /> : undefined}
                                    alt={userName}
                                    className="!flex !items-center !justify-center border border-[var(--studio-border-subtle)] bg-transparent text-xs font-semibold text-[var(--studio-text-primary)] transition hover:border-[var(--studio-border-strong)] hover:text-[var(--studio-accent)]"
                                    style={avatarStyle}
                                >
                                    {avatarText}
                                </Avatar>
                            )}
                        </button>
                    </Dropdown>
                </div>
            ) : null}
        </div>
    );
}
