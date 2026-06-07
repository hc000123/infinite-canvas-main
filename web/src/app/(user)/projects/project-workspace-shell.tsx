"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleDot, Database, FileText, Folder, Home, ImagePlus, PanelLeftClose, PanelLeftOpen, Settings2, UserRound, Video } from "lucide-react";

import { useConfigStore } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

export function ProjectWorkspaceShell({ children }: { children: ReactNode }) {
    const [sidebarOpen, setSidebarOpen] = useState(true);

    return (
        <div className="h-full overflow-hidden bg-[#080d14] text-slate-100">
            <div className={`relative h-full min-h-0 transition-[padding] duration-200 ${sidebarOpen ? "pl-[248px]" : "pl-0"}`}>
                <ProjectWorkspaceSidebar open={sidebarOpen} onToggle={() => setSidebarOpen(false)} />
                {!sidebarOpen ? (
                    <button
                        type="button"
                        className="fixed left-4 top-4 z-40 grid size-10 place-items-center rounded-lg border border-cyan-400/35 bg-[#0b1520]/95 text-cyan-200 shadow-[0_16px_38px_rgba(0,0,0,0.32)] backdrop-blur transition hover:border-cyan-300 hover:bg-[#102033]"
                        onClick={() => setSidebarOpen(true)}
                        aria-label="展开左侧栏"
                        title="展开左侧栏"
                    >
                        <PanelLeftOpen className="size-5" />
                    </button>
                ) : null}
                <div className={`h-full min-h-0 overflow-hidden pr-8 transition-[padding] duration-200 ${sidebarOpen ? "pl-8" : "pl-20"}`}>{children}</div>
            </div>
        </div>
    );
}

function ProjectWorkspaceSidebar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const user = useUserStore((state) => state.user);
    const userName = user?.displayName || user?.username || "本地创作者";
    const userInitial = userName.trim().slice(0, 1) || "创";
    const roleLabel = user?.role === "admin" ? "管理员" : user ? "已登录" : "未登录";

    return (
        <aside className={`fixed inset-y-0 left-0 z-30 flex w-[248px] min-h-0 flex-col border-r border-slate-800 bg-[#08111a]/95 px-5 py-6 shadow-[18px_0_44px_rgba(0,0,0,0.28)] transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full"}`}>
            <div className="relative pr-8">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-cyan-500/90 text-[#071018]">
                        <CircleDot className="size-5 fill-current" />
                    </span>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <div className="whitespace-nowrap text-xl font-semibold tracking-normal text-white">AI · 画布</div>
                            <span className="shrink-0 whitespace-nowrap rounded-full border border-cyan-400/60 px-1.5 py-0.5 text-[10px] font-medium leading-none text-cyan-300">本地版</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">让想法成为影像</p>
                    </div>
                </div>
                <button type="button" className="absolute right-0 top-0 grid size-8 place-items-center rounded-md text-slate-400 transition hover:bg-slate-800 hover:text-cyan-200" onClick={onToggle} aria-label="收起左侧栏" title="收起左侧栏">
                    <PanelLeftClose className="size-4" />
                </button>
            </div>

            <nav className="mt-8 border-t border-slate-800 pt-5">
                <ProjectWorkspaceLink icon={<Home className="size-5" />} label="项目工作台" href="/projects" />
                <ProjectWorkspaceLink icon={<ImagePlus className="size-5" />} label="生图工作台" href="/image" />
                <ProjectWorkspaceLink icon={<Video className="size-5" />} label="视频创作台" href="/video" />
                <ProjectWorkspaceLink icon={<FileText className="size-5" />} label="提示词库" href="/prompts" />
                <ProjectWorkspaceLink icon={<Folder className="size-5" />} label="我的素材" href="/assets" />
            </nav>

            <div className="mt-auto grid gap-4">
                <section className="rounded-xl border border-slate-800 bg-slate-950/35 p-3">
                    <div className="flex items-start gap-3">
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-cyan-400/30 bg-cyan-400/10 text-cyan-200">
                            <Database className="size-4" />
                        </span>
                        <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-100">本地工作区</div>
                            <p className="mt-1 break-words text-xs leading-5 text-slate-500">项目、画布和素材主要保存在本机浏览器。</p>
                        </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        <span className="rounded-md border border-slate-800 bg-black/20 px-2 py-1 text-[11px] font-medium text-slate-400">浏览器本地</span>
                        <span className="rounded-md border border-slate-800 bg-black/20 px-2 py-1 text-[11px] font-medium text-slate-400">未启用云同步</span>
                    </div>
                </section>

                <button
                    type="button"
                    className="flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-800 bg-slate-900/35 text-sm font-medium text-slate-300 transition hover:border-cyan-400/45 hover:bg-cyan-400/10 hover:text-cyan-100"
                    onClick={() => openConfigDialog(false)}
                >
                    <Settings2 className="size-4" />
                    <span>AI 配置</span>
                </button>

                <div className="border-t border-slate-800 pt-4">
                    <div className="flex items-center gap-3">
                        <div className="grid size-10 shrink-0 place-items-center rounded-full border border-cyan-400/30 bg-cyan-400/10 text-sm font-semibold text-cyan-100">
                            {userInitial}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="break-words text-sm font-medium text-white">{userName}</div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                                <UserRound className="size-3.5" />
                                <span>{roleLabel} · 本地数据优先</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </aside>
    );
}

function ProjectWorkspaceLink({ icon, label, href }: { icon: ReactNode; label: string; href: string }) {
    const pathname = usePathname();
    const active = href === "/projects" ? pathname === "/projects" || pathname.startsWith("/projects/") : pathname === href || pathname.startsWith(`${href}/`);

    return (
        <Link href={href} className={`mb-3 flex h-12 w-full items-center gap-2 rounded-lg px-4 text-base transition ${active ? "bg-slate-800/90 text-cyan-300 hover:bg-slate-800 hover:text-cyan-200" : "text-slate-300 hover:bg-slate-800/60 hover:text-white"}`}>
            {icon}
            <span>{label}</span>
        </Link>
    );
}
