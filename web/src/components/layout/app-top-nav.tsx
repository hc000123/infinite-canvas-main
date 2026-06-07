"use client";

import { Menu, Settings2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const user = useUserStore((state) => state.user);
    const isReady = useUserStore((state) => state.isReady);
    const hideHeader = /^\/canvas\/[^/]+/.test(pathname) || pathname === "/projects" || pathname.startsWith("/projects/") || pathname.startsWith("/login");
    const slug = pathname.split("/").filter(Boolean)[0];
    const activeToolSlug = navigationTools.some((tool) => tool.slug === slug) ? (slug as NavigationToolSlug) : undefined;

    return (
        <>
            {!hideHeader ? (
                <header className="sticky top-0 z-20 h-16 shrink-0 border-b border-stone-950/10 bg-[#fffefa]/84 backdrop-blur-xl dark:border-white/10 dark:bg-[#101313]/86">
                    <div className="mx-auto flex h-full max-w-7xl items-stretch justify-between gap-5 px-5 sm:px-6">
                        <div className="flex min-w-0 items-center">
                            <Link href="/" className="flex h-full shrink-0 items-center gap-3 text-sm font-semibold leading-none tracking-tight text-stone-950 transition hover:text-teal-700 dark:text-stone-100 dark:hover:text-teal-200">
                                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-teal-700/20 bg-teal-700/10 text-teal-700 dark:border-teal-200/25 dark:bg-teal-200/10 dark:text-teal-200">
                                    <span
                                        className="size-5 bg-current"
                                        style={{
                                            mask: "url(/logo.svg) center / contain no-repeat",
                                            WebkitMask: "url(/logo.svg) center / contain no-repeat",
                                        }}
                                    />
                                </span>
                                <span className="grid gap-1">
                                    <span className="text-base font-semibold">眨眼之间</span>
                                    <span className="text-[10px] font-medium leading-none tracking-[0.18em] text-stone-400 dark:text-stone-500">创作中枢</span>
                                </span>
                            </Link>

                            <button
                                type="button"
                                className="ml-3 inline-flex size-8 shrink-0 items-center justify-center text-stone-600 transition hover:text-stone-950 md:hidden dark:text-stone-300 dark:hover:text-white"
                                onClick={() => setMobileNavOpen(true)}
                                aria-label="打开导航菜单"
                                title="导航菜单"
                            >
                                <Menu className="size-5" />
                            </button>

                            <nav className="hide-scrollbar ml-7 hidden h-16 min-w-0 items-center gap-1 overflow-x-auto rounded-lg border border-stone-950/10 bg-white/55 p-1 md:flex dark:border-white/10 dark:bg-white/[0.04]">
                                {navigationTools.map((tool) => {
                                    const Icon = tool.icon;
                                    const active = tool.slug === activeToolSlug;
                                    return (
                                        <Link
                                            key={tool.slug}
                                            href={`/${tool.slug}`}
                                            className={cn(
                                                "relative flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm leading-6 transition",
                                                active
                                                    ? "bg-stone-950 font-medium text-white shadow-sm dark:bg-white dark:text-stone-950"
                                                    : "text-stone-500 hover:bg-stone-950/5 hover:text-stone-950 dark:text-stone-400 dark:hover:bg-white/10 dark:hover:text-stone-100",
                                            )}
                                        >
                                            <Icon className="size-4" />
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
                                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-transparent text-stone-600 transition hover:border-stone-950/10 hover:bg-stone-950/5 hover:text-stone-950 dark:text-stone-300 dark:hover:border-white/10 dark:hover:bg-white/10 dark:hover:text-white [&_svg]:size-4"
                                        onClick={() => openConfigDialog(false)}
                                        aria-label="配置"
                                        title="配置"
                                    >
                                        <Settings2 className="size-4" />
                                    </button>
                                    <AnimatedThemeToggler
                                        theme={theme}
                                        onThemeChange={setTheme}
                                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-transparent text-stone-600 transition hover:border-stone-950/10 hover:bg-stone-950/5 hover:text-stone-950 dark:text-stone-300 dark:hover:border-white/10 dark:hover:bg-white/10 dark:hover:text-white [&_svg]:size-4"
                                        aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
                                        title={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
                                    />
                                    <VersionReleaseModal />
                                    <Link href="/login" className="text-sm font-medium text-stone-600 underline-offset-4 transition hover:text-stone-950 hover:underline dark:text-stone-300 dark:hover:text-stone-100">
                                        登录
                                    </Link>
                                </>
                            )}
                        </div>
                    </div>
                </header>
            ) : null}

            <MobileNavDrawer open={mobileNavOpen} activeToolSlug={activeToolSlug} onClose={() => setMobileNavOpen(false)} />
            <AppConfigModal />
        </>
    );
}
