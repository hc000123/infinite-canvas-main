import { Checkbox, Empty } from "antd";
import { Eye, Images } from "lucide-react";
import Image from "next/image";

import type { WorkflowReferenceImage } from "../workflow-reference-images";

const KIND_LABEL = { character: "角色", scene: "场景", prop: "道具" };

export function WorkflowReferenceImagePanel(props: { images: WorkflowReferenceImage[]; selectedIds: string[]; onChange: (ids: string[]) => void }) {
    const selected = new Set(props.selectedIds);
    const toggle = (id: string, checked: boolean) => props.onChange(checked ? [...props.selectedIds, id].slice(0, 9) : props.selectedIds.filter((item) => item !== id));
    return (
        <section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4 shadow-[var(--studio-shadow)]">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 text-sm font-semibold">
                        <Images className="size-4 text-[var(--studio-accent)]" />
                        提示词参考图
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[var(--studio-text-muted)]">执行器会先观察人物外观、场景空间、光线与道具，再结合剧本生成分镜提示词。</p>
                </div>
                <span className="shrink-0 text-xs text-[var(--studio-text-secondary)]">已选 {props.selectedIds.length}/9</span>
            </div>
            {props.images.length ? (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {props.images.map((item) => (
                        <label key={item.id} className={`group relative cursor-pointer overflow-hidden rounded-md border ${selected.has(item.id) ? "border-[var(--studio-accent)]" : "border-[var(--studio-border-subtle)]"}`}>
                            <span className="relative block aspect-[3/4] w-full bg-[var(--studio-panel-muted-bg)]">
                                <Image alt={item.label} fill sizes="120px" src={item.asset.data.dataUrl || item.asset.coverUrl} unoptimized className="object-cover" />
                            </span>
                            <span className="absolute inset-x-0 bottom-0 bg-black/65 px-1.5 py-1 text-[10px] text-white">
                                <span className="block truncate">{item.label}</span>
                                <span className="opacity-70">{KIND_LABEL[item.kind]}</span>
                            </span>
                            <Checkbox className="absolute left-1.5 top-1.5" checked={selected.has(item.id)} onChange={(event) => toggle(item.id, event.target.checked)} />
                        </label>
                    ))}
                </div>
            ) : (
                <Empty className="my-4" image={Empty.PRESENTED_IMAGE_SIMPLE} description="本集还没有可用的角色、场景或道具图片" />
            )}
            <div className="mt-3 flex items-center gap-2 rounded-md bg-[var(--studio-panel-muted-bg)] px-3 py-2 text-[11px] text-[var(--studio-text-secondary)]">
                <Eye className="size-3.5 shrink-0 text-[var(--studio-accent)]" />
                参考图只在本次任务中临时上传并冻结；资产图未准备齐时保持阻断，避免纯文本提示词丢失角色与场景一致性。
            </div>
        </section>
    );
}
