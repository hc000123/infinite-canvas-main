"use client";

import { useState } from "react";
import { Button, Dropdown, Input, Modal, type MenuProps } from "antd";
import { Check, Copy, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AssetVariant } from "@/stores/use-asset-store";
import { validateVariantName } from "../../asset-workbench";

export function AssetVariantNav({ activeId, compact = false, variants, onCreate, onDelete, onDuplicate, onRename, onSelect }: { activeId: string; compact?: boolean; variants: AssetVariant[]; onCreate: (name: string) => void; onDelete: (id: string) => void; onDuplicate: (id: string) => void; onRename: (id: string, name: string) => void; onSelect: (id: string) => void }) {
    const [dialog, setDialog] = useState<{ mode: "create" | "rename"; id?: string } | null>(null);
    const [name, setName] = useState("");
    const error = dialog ? validateVariantName(name, variants, dialog.id) : "";
    const openCreate = () => {
        setName("");
        setDialog({ mode: "create" });
    };
    const openRename = (variant: AssetVariant) => {
        setName(variant.name);
        setDialog({ mode: "rename", id: variant.id });
    };
    const submit = () => {
        if (error || !dialog) return;
        if (dialog.mode === "create") onCreate(name.trim());
        else if (dialog.id) onRename(dialog.id, name.trim());
        setDialog(null);
    };

    return (
        <section>
            <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--studio-text-muted)]">形态</h2>
                <Button type="text" size="small" icon={<Plus className="size-3.5" />} onClick={openCreate}>新增</Button>
            </div>
            {compact ? <div className="flex items-center justify-between rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-3 py-2"><div><div className="text-[11px] text-[var(--studio-text-muted)]">基础形态</div><div className="mt-0.5 text-sm font-medium">{variants[0]?.name}</div></div><Button type="text" size="small" icon={<Plus className="size-3.5" />} onClick={openCreate}>添加形态</Button></div> : <div className="grid gap-1.5">
                {variants.map((variant) => {
                    const active = variant.id === activeId;
                    const menu: MenuProps = {
                        items: [
                            { key: "rename", icon: <Pencil className="size-3.5" />, label: "重命名" },
                            { key: "duplicate", icon: <Copy className="size-3.5" />, label: "复制配置" },
                            { type: "divider" },
                            { key: "delete", danger: true, disabled: variants.length <= 1, icon: <Trash2 className="size-3.5" />, label: "删除形态" },
                        ],
                        onClick: ({ key, domEvent }) => {
                            domEvent.stopPropagation();
                            if (key === "rename") openRename(variant);
                            if (key === "duplicate") onDuplicate(variant.id);
                            if (key === "delete") onDelete(variant.id);
                        },
                    };
                    return (
                        <button key={variant.id} type="button" className={cn("group flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition", active ? "border-[var(--studio-accent)] bg-[var(--studio-active-bg)]" : "border-transparent hover:bg-[var(--studio-hover-bg)]")} onClick={() => onSelect(variant.id)}>
                            <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", active ? "border-[var(--studio-accent)] text-[var(--studio-accent)]" : "border-[var(--studio-border-subtle)] text-transparent")}><Check className="size-3" /></span>
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--studio-text-primary)]">{variant.name}</span>
                            <Dropdown menu={menu} trigger={["click"]}>
                                <span role="button" tabIndex={0} className="flex size-7 items-center justify-center rounded-md text-[var(--studio-text-muted)] opacity-0 transition hover:bg-[var(--studio-hover-bg)] group-hover:opacity-100" onClick={(event) => event.stopPropagation()}><MoreHorizontal className="size-4" /></span>
                            </Dropdown>
                        </button>
                    );
                })}
            </div>}
            <Modal open={Boolean(dialog)} title={dialog?.mode === "create" ? "新建形态" : "重命名形态"} okText="保存" cancelText="取消" okButtonProps={{ disabled: Boolean(error) }} onCancel={() => setDialog(null)} onOk={submit} destroyOnHidden>
                <Input className="mt-3" autoFocus value={name} maxLength={40} placeholder="例如：少年形态、战损形态" status={error ? "error" : undefined} onChange={(event) => setName(event.target.value)} onPressEnter={submit} />
                <div className="mt-1 min-h-5 text-xs text-[var(--studio-danger)]">{error}</div>
            </Modal>
        </section>
    );
}
