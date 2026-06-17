"use client";

import { Drawer } from "antd";
import Link from "next/link";

import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { cn } from "@/lib/utils";

type MobileNavDrawerProps = {
    open: boolean;
    activeToolSlug?: NavigationToolSlug;
    getHref?: (slug: NavigationToolSlug) => string;
    onClose: () => void;
};

export function MobileNavDrawer({ open, activeToolSlug, getHref, onClose }: MobileNavDrawerProps) {
    return (
        <Drawer rootClassName="studio-modal" title="眨眼之间" placement="left" size={280} open={open} onClose={onClose} className="md:hidden">
            <div className="space-y-1">
                {navigationTools.map((tool) => {
                    const Icon = tool.icon;
                    const active = tool.slug === activeToolSlug;
                    return (
                        <Link
                            key={tool.slug}
                            href={getHref ? getHref(tool.slug) : `/${tool.slug}`}
                            onClick={onClose}
                            className={cn(
                                "flex items-center gap-3 rounded-md border px-3 py-3 text-base transition",
                                active
                                    ? "border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] font-semibold !text-[var(--studio-text-primary)] shadow-[inset_0_-2px_0_var(--studio-text-primary)]"
                                    : "border-transparent !text-[var(--studio-text-secondary)] hover:border-[var(--studio-border-subtle)] hover:bg-[var(--studio-hover-bg)] hover:!text-[var(--studio-text-primary)]",
                            )}
                        >
                            <Icon className="size-5 text-current" />
                            <span>{tool.label}</span>
                        </Link>
                    );
                })}
            </div>
        </Drawer>
    );
}
