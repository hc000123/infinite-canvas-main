import Link from "next/link";
import { ArrowUpRight, BookOpenText, Database } from "lucide-react";

export default function ResourcesPage() {
    return (
        <main className="studio-shell h-full min-h-0 overflow-y-auto px-4 py-5 md:px-6 xl:px-7">
            <div className="mx-auto max-w-5xl">
                <header className="border-b border-[var(--studio-border-subtle)] pb-4">
                    <h1 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--studio-text-primary)]">资源库</h1>
                </header>

                <section className="divide-y divide-[var(--studio-border-subtle)] border-b border-[var(--studio-border-subtle)]">
                    <Link href="/prompts" className="group -mx-3 flex items-center gap-4 px-3 py-5 text-left transition-colors duration-100 hover:bg-[var(--studio-hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]">
                        <BookOpenText className="size-5 shrink-0 text-[var(--studio-accent)]" />
                        <div className="min-w-0 flex-1">
                            <h2 className="font-medium text-[var(--studio-text-primary)]">提示词库</h2>
                            <p className="mt-1 text-sm text-[var(--studio-text-secondary)]">管理创作提示词、模板和业务分类。</p>
                        </div>
                        <ArrowUpRight className="size-4 shrink-0 text-[var(--studio-text-muted)] transition-colors group-hover:text-[var(--studio-text-primary)]" />
                    </Link>
                    <Link href="/cache" className="group -mx-3 flex items-center gap-4 px-3 py-5 text-left transition-colors duration-100 hover:bg-[var(--studio-hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]">
                        <Database className="size-5 shrink-0 text-[var(--studio-accent)]" />
                        <div className="min-w-0 flex-1">
                            <h2 className="font-medium text-[var(--studio-text-primary)]">缓存管理</h2>
                            <p className="mt-1 text-sm text-[var(--studio-text-secondary)]">查看项目文件、占用空间和待处理缓存。</p>
                        </div>
                        <ArrowUpRight className="size-4 shrink-0 text-[var(--studio-text-muted)] transition-colors group-hover:text-[var(--studio-text-primary)]" />
                    </Link>
                </section>
            </div>
        </main>
    );
}
