"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown, CircleDot, FileText, Folder, HelpCircle, Home, ImagePlus, PanelLeftClose, PanelLeftOpen, Settings, Video } from "lucide-react";

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
                            <span className="shrink-0 whitespace-nowrap rounded-full border border-cyan-400/60 px-1.5 py-0.5 text-[10px] font-medium leading-none text-cyan-300">专业版</span>
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

            <div className="mt-auto grid gap-5">
                <section>
                    <div className="flex items-center gap-2 text-sm text-slate-200">
                        <span className="grid size-7 place-items-center rounded-full bg-cyan-400/90 text-[#071018]">专</span>
                        <div>
                            <div>专业版</div>
                            <div className="text-xs text-slate-500">有效期至 2026-08-31</div>
                        </div>
                    </div>
                    <div className="mt-4 text-xs text-slate-400">
                        存储空间 <span className="ml-3 text-slate-200">128.4GB / 512GB</span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-slate-800">
                        <div className="h-full w-1/4 rounded-full bg-cyan-400" />
                    </div>
                </section>

                <div className="flex items-center justify-between border-y border-slate-800 py-4 text-slate-400">
                    <button type="button" aria-label="设置" className="transition hover:text-white">
                        <Settings className="size-5" />
                    </button>
                    <button type="button" aria-label="帮助" className="transition hover:text-white">
                        <HelpCircle className="size-5" />
                    </button>
                    <button type="button" aria-label="通知" className="transition hover:text-white">
                        <Bell className="size-5" />
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-full bg-[linear-gradient(135deg,#f9a8d4,#38bdf8)] text-sm font-semibold text-white">导</div>
                    <div className="min-w-0 flex-1">
                        <div className="text-sm text-white">导演你好</div>
                    </div>
                    <ChevronDown className="size-4 text-slate-500" />
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
