import { Home, LogIn } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
    return (
        <div className="studio-workspace flex h-dvh flex-col overflow-hidden bg-background text-foreground">
            <main className="studio-shell flex h-full min-h-0 items-center justify-center overflow-y-auto px-6 py-10">
                <section className="w-full max-w-md text-center">
                    <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] text-2xl font-semibold text-[var(--studio-text-primary)] shadow-[var(--studio-shadow-card)]">404</div>
                    <h1 className="text-3xl font-semibold tracking-normal text-[var(--studio-text-primary)]">页面不存在</h1>
                    <p className="mt-3 text-sm leading-6 text-[var(--studio-text-secondary)]">这个地址没有对应的页面，可能已经移动或被合并到其他入口。</p>
                    <div className="mt-8 flex flex-wrap justify-center gap-3">
                        <Link href="/" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--studio-accent)] px-4 text-sm font-medium text-[var(--primary-foreground)] transition hover:bg-[var(--studio-accent-hover)]">
                            <Home className="size-4" />
                            返回首页
                        </Link>
                        <Link
                            href="/login"
                            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] px-4 text-sm font-medium text-[var(--studio-text-primary)] transition hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-hover-bg)]"
                        >
                            <LogIn className="size-4" />
                            去登录
                        </Link>
                    </div>
                </section>
            </main>
        </div>
    );
}
