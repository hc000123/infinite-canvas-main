"use client";

import { Menu, Settings2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { useState } from "react";

export function AppTopNav() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const user = useUserStore((state) => state.user);
    const isReady = useUserStore((state) => state.isReady);
    const hideHeader =
        /^\/canvas\/[^/]+/.test(pathname) ||
        ["/image", "/video", "/prompts", "/assets"].some((path) => pathname === path || pathname.startsWith(`${path}/`)) ||
        pathname === "/projects" ||
        pathname.startsWith("/projects/") ||
        pathname.startsWith("/login");
    const slug = pathname.split("/").filter(Boolean)[0];
    const activeToolSlug = navigationTools.some((tool) => tool.slug === slug) ? (slug as NavigationToolSlug) : undefined;
    const themeToggleLabel = theme === "dark" ? "切换到全局浅色主题" : "切换到全局深色主题";
    const getToolHref = (toolSlug: NavigationToolSlug) => {
        if (toolSlug === "assets") return buildAssetsReturnHref(pathname, searchParams);
        if (toolSlug === "original-workflow") return buildOriginalWorkflowToolHref(pathname, searchParams);
        return `/${toolSlug}`;
    };

    return (
        <>
            {!hideHeader ? (
                <header className="sticky top-0 z-20 h-16 shrink-0 border-b border-[var(--studio-border-subtle)] bg-[color-mix(in_srgb,var(--studio-app-bg)_92%,transparent)] shadow-[0_10px_28px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:shadow-[0_10px_28px_rgba(0,0,0,0.18)]">
                    <div className="mx-auto flex h-full max-w-7xl items-stretch justify-between gap-5 px-5 sm:px-6">
                        <div className="flex min-w-0 items-center">
                            <Link href="/" className="group flex h-full shrink-0 items-center gap-3 text-sm font-semibold leading-none tracking-tight text-[var(--studio-text-primary)] transition hover:text-[var(--studio-accent)]">
                                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-active-bg)] text-[var(--studio-accent)] transition group-hover:border-[var(--studio-border-strong)] group-hover:bg-[var(--studio-hover-bg)]">
                                    <span
                                        className="size-5 bg-current"
                                        style={{
                                            mask: "url(/logo.svg) center / contain no-repeat",
                                            WebkitMask: "url(/logo.svg) center / contain no-repeat",
                                        }}
                                    />
                                </span>
                                <span className="grid gap-1">
                                    <span className="flex items-center gap-2 text-base font-semibold">
                                        AI · 画布
                                        <span className="rounded-md border border-[var(--studio-border-strong)] bg-[var(--studio-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium leading-none text-[var(--studio-accent)]">本地版</span>
                                    </span>
                                    <span className="text-[10px] font-medium leading-none text-[var(--studio-text-muted)]">让想法成为影像</span>
                                </span>
                            </Link>

                            <button
                                type="button"
                                className="ml-3 inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-transparent text-[var(--studio-text-secondary)] transition hover:border-[var(--studio-border-subtle)] hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)] md:hidden"
                                onClick={() => setMobileNavOpen(true)}
                                aria-label="打开导航菜单"
                                title="导航菜单"
                            >
                                <Menu className="size-5" />
                            </button>

                            <nav className="hide-scrollbar ml-7 hidden h-16 min-w-0 items-center gap-1 overflow-x-auto rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-1 md:flex">
                                {navigationTools.map((tool) => {
                                    const Icon = tool.icon;
                                    const active = tool.slug === activeToolSlug;
                                    return (
                                        <Link
                                            key={tool.slug}
                                            href={getToolHref(tool.slug)}
                                            className={cn(
                                                "relative flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-sm leading-6 transition",
                                                active
                                                    ? "border-[var(--studio-border-strong)] bg-[var(--studio-active-bg)] font-semibold text-[var(--studio-text-primary)] shadow-[inset_0_-2px_0_var(--studio-accent)]"
                                                    : "border-transparent text-[var(--studio-text-secondary)] hover:border-[var(--studio-border-subtle)] hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)]",
                                            )}
                                        >
                                            <Icon className={cn("size-4 transition", active ? "text-[var(--studio-accent)]" : "text-current")} />
                                            <span>{tool.label}</span>
                                        </Link>
                                    );
                                })}
                            </nav>
                        </div>

                        <div className="my-auto flex h-9 min-w-0 items-center justify-end gap-2 justify-self-end whitespace-nowrap">
                            {isReady && user ? (
                                <UserStatusActions />
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-transparent text-[var(--studio-text-secondary)] transition hover:border-[var(--studio-border-subtle)] hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)] [&_svg]:size-4"
                                        onClick={() => openConfigDialog(false)}
                                        aria-label="配置"
                                        title="配置"
                                    >
                                        <Settings2 className="size-4" />
                                    </button>
                                    <AnimatedThemeToggler
                                        theme={theme}
                                        onThemeChange={setTheme}
                                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-transparent text-[var(--studio-text-secondary)] transition hover:border-[var(--studio-border-subtle)] hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)] [&_svg]:size-4"
                                        aria-label={themeToggleLabel}
                                        title={themeToggleLabel}
                                    />
                                    <VersionReleaseModal />
                                    <Link href="/login" className="rounded-md px-2 py-1 text-sm font-medium text-[var(--studio-text-secondary)] underline-offset-4 transition hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)] hover:no-underline">
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

function buildOriginalWorkflowToolHref(pathname: string, searchParams: SearchParamReader) {
    if (pathname === "/original-workflow" || pathname.startsWith("/original-workflow/")) return withCurrentQuery("/original-workflow", searchParams);
    const returnTo = searchParams.get("returnTo") || "";
    if (returnTo.startsWith("/original-workflow")) return returnTo;
    const params = workflowScopedParams(searchParams);
    const query = params.toString();
    return query ? `/original-workflow?${query}` : "/original-workflow";
}

function withCurrentQuery(pathname: string, searchParams: SearchParamReader) {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
}

function workflowScopedParams(searchParams: SearchParamReader) {
    const params = new URLSearchParams();
    for (const key of ["episode", "projectSlug", "sourceProjectId", "sourceEpisodeId"]) {
        const value = searchParams.get(key);
        if (value) params.set(key, value);
    }
    return params;
}
