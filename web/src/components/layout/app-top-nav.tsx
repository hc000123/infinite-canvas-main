"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { AppConfigModal } from "@/components/layout/app-config-modal";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { VersionReleaseModal } from "@/components/layout/version-release-modal";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import { useState } from "react";
import { useCanvasStore } from "@/app/(user)/canvas/stores/use-canvas-store";

export function AppTopNav() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const user = useUserStore((state) => state.user);
    const isReady = useUserStore((state) => state.isReady);
    const canvasProjects = useCanvasStore((state) => state.projects);
    const hideHeader = /^\/canvas\/[^/]+/.test(pathname) || pathname.startsWith("/login");
    const slug = pathname.split("/").filter(Boolean)[0];
    const activeToolSlug = navigationTools.some((tool) => tool.slug === slug) ? (slug as NavigationToolSlug) : undefined;
    const returnTarget = buildReturnTarget(searchParams);
    const themeToggleLabel = theme === "dark" ? "切换到全局浅色主题" : "切换到全局深色主题";
    const getToolHref = (toolSlug: NavigationToolSlug) => {
        if (toolSlug === "assets") return buildAssetsReturnHref(pathname, searchParams);
        if (toolSlug === "canvas") {
            const currentCanvasId = pathname.match(/^\/canvas\/([^/]+)/)?.[1];
            const projectId = searchParams.get("projectId") || canvasProjects.find((canvas) => canvas.id === currentCanvasId)?.projectId || "";
            return projectId ? `/canvas?projectId=${encodeURIComponent(projectId)}` : "/canvas";
        }
        return `/${toolSlug}`;
    };

    return (
        <>
            {!hideHeader ? (
                <header className="sticky top-0 z-[80] h-14 shrink-0 border-b border-[var(--studio-border-subtle)] bg-[color-mix(in_srgb,var(--studio-app-bg)_94%,transparent)] backdrop-blur-xl">
                    <div className="mx-auto flex h-full w-full max-w-7xl items-stretch justify-between gap-3 px-4 sm:px-5">
                        <div className="flex min-w-0 items-center">
                            <Link href="/" className="workspace-top-button whitespace-nowrap !px-3 text-base !font-semibold tracking-tight">
                                AI · 画布
                            </Link>

                            <button type="button" className="workspace-top-button ml-3 md:hidden" onClick={() => setMobileNavOpen(true)} aria-label="打开导航菜单" title="导航菜单">
                                菜单
                            </button>

                            <nav className="ml-4 hidden h-10 min-w-0 items-center gap-1 overflow-hidden md:flex">
                                {navigationTools.map((tool) => {
                                    const active = tool.slug === activeToolSlug;
                                    return (
                                        <Link key={tool.slug} href={getToolHref(tool.slug)} className="workspace-top-button relative" title={tool.label} aria-label={tool.label} aria-current={active ? "page" : undefined}>
                                            <span className="whitespace-nowrap">{tool.shortLabel}</span>
                                        </Link>
                                    );
                                })}
                            </nav>
                        </div>

                        <div className="my-auto flex h-9 min-w-0 items-center justify-end gap-2 justify-self-end whitespace-nowrap">
                            {returnTarget ? (
                                <button type="button" className="workspace-top-button hidden sm:flex" onClick={() => window.location.assign(returnTarget.href)} title={returnTarget.label}>
                                    {returnTarget.label}
                                </button>
                            ) : null}
                            {isReady && user ? (
                                <UserStatusActions variant="text" />
                            ) : (
                                <>
                                    <button type="button" className="workspace-top-button hidden sm:inline-flex" onClick={() => openConfigDialog(false)} aria-label="配置" title="配置">
                                        配置
                                    </button>
                                    <AnimatedThemeToggler theme={theme} onThemeChange={setTheme} className="workspace-top-button hidden sm:inline-flex" aria-label={themeToggleLabel} title={themeToggleLabel}>
                                        {theme === "dark" ? "浅色" : "深色"}
                                    </AnimatedThemeToggler>
                                    <VersionReleaseModal className="workspace-top-button hidden sm:inline-flex" />
                                    <Link href="/login" className="workspace-top-button">
                                        登录
                                    </Link>
                                </>
                            )}
                        </div>
                    </div>
                </header>
            ) : null}

            <MobileNavDrawer open={mobileNavOpen} activeToolSlug={activeToolSlug} getHref={getToolHref} onClose={() => setMobileNavOpen(false)} />
            <AppConfigModal />
        </>
    );
}

function buildReturnTarget(searchParams: URLSearchParams) {
    const returnTo = searchParams.get("returnTo") || "";
    if (returnTo.startsWith("/")) return { href: returnTo, label: searchParams.get("returnLabel") || "返回上一步" };
    const source = searchParams.get("source") || "";
    const projectId = searchParams.get("projectId") || "";
    if (source === "episode-workbench" && projectId) return { href: `/projects/${encodeURIComponent(projectId)}`, label: "返回项目详情" };
    return undefined;
}

type SearchParamReader = {
    get: (name: string) => string | null;
    toString: () => string;
};

function buildAssetsReturnHref(pathname: string, searchParams: SearchParamReader) {
    if (pathname === "/assets" || pathname.startsWith("/assets/")) return "/assets";

    const currentQuery = searchParams.toString();
    const currentHref = currentQuery ? `${pathname}?${currentQuery}` : pathname;
    const params = new URLSearchParams();
    params.set("returnTo", currentHref);
    params.set("returnLabel", "返回上一页");
    return `/assets?${params.toString()}`;
}
