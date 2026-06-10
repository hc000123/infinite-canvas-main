"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, AudioLines, Edit3 } from "lucide-react";
import { Button, Empty, Input, Modal, Segmented } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { seedanceReferenceLabel } from "@/services/api/video-reference";
import type { ReferenceImageRole } from "@/types/image";
import type { CanvasGenerationMode } from "../types";
import type { NodeGenerationInput } from "./canvas-node-generation";

export function CanvasConfigNodePreview({
    audioInputs,
    editingText,
    editingTextId,
    hasPreviewContent,
    imageInputs,
    imageReferenceRole,
    mediaInputs,
    mode,
    onChangeImageReferenceRole,
    onClose,
    onEditingTextChange,
    onMoveInput,
    onSaveTextEdit,
    onStartTextEdit,
    onStopTextEdit,
    open,
    ownPrompt,
    promptCount,
    textInputs,
    theme,
    videoInputs,
}: {
    audioInputs: NodeGenerationInput[];
    editingText: string;
    editingTextId: string | null;
    hasPreviewContent: boolean;
    imageInputs: NodeGenerationInput[];
    imageReferenceRole: (input: NodeGenerationInput, index: number) => ReferenceImageRole;
    mediaInputs: NodeGenerationInput[];
    mode: CanvasGenerationMode;
    onChangeImageReferenceRole: (input: NodeGenerationInput, index: number, role: ReferenceImageRole) => void;
    onClose: () => void;
    onEditingTextChange: (value: string) => void;
    onMoveInput: (input: NodeGenerationInput, offset: number, scopedInputs?: NodeGenerationInput[]) => void;
    onSaveTextEdit: () => void;
    onStartTextEdit: (input: NodeGenerationInput) => void;
    onStopTextEdit: () => void;
    open: boolean;
    ownPrompt: string;
    promptCount: number;
    textInputs: NodeGenerationInput[];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    videoInputs: NodeGenerationInput[];
}) {
    return (
        <Modal
            title="输入预览"
            open={open}
            onCancel={onClose}
            footer={null}
            centered
            width={1040}
            mask={{ closable: true }}
            keyboard
            destroyOnHidden
            modalRender={(modal) => (
                <div onClick={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                    {modal}
                </div>
            )}
        >
            <div onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} onWheelCapture={(event) => event.stopPropagation()}>
                {hasPreviewContent ? (
                    <div className="flex h-[min(72vh,700px)] flex-col gap-3 overflow-hidden">
                        <div className="shrink-0 space-y-3">
                            {mode === "video" ? (
                                <PreviewSection title="多模态参考" count={mediaInputs.length} empty="暂无参考素材">
                                    <div className="thin-scrollbar flex gap-1.5 overflow-x-auto pb-1">
                                        {mediaInputs.map((input, index) => {
                                            const imageIndex = imageInputs.findIndex((item) => item.nodeId === input.nodeId);
                                            const videoIndex = videoInputs.findIndex((item) => item.nodeId === input.nodeId);
                                            const audioIndex = audioInputs.findIndex((item) => item.nodeId === input.nodeId);
                                            return (
                                                <MediaSortCard
                                                    key={input.nodeId}
                                                    input={input}
                                                    imageIndex={imageIndex}
                                                    videoIndex={videoIndex}
                                                    audioIndex={audioIndex}
                                                    mediaIndex={index}
                                                    mediaTotal={mediaInputs.length}
                                                    theme={theme}
                                                    seedanceRole={imageIndex >= 0 ? imageReferenceRole(input, imageIndex) : undefined}
                                                    onRoleChange={imageIndex >= 0 ? (role) => onChangeImageReferenceRole(input, imageIndex, role) : undefined}
                                                    onMove={(target, offset) => onMoveInput(target, offset, mediaInputs)}
                                                />
                                            );
                                        })}
                                    </div>
                                </PreviewSection>
                            ) : (
                                <PreviewSection title="图片参考" count={imageInputs.length} empty="暂无图片参考">
                                    <div className="thin-scrollbar flex gap-1.5 overflow-x-auto pb-1">
                                        {imageInputs.map((input, index) => (
                                            <ImageSortCard key={input.nodeId} input={input} imageIndex={index} imageTotal={imageInputs.length} theme={theme} onMove={onMoveInput} />
                                        ))}
                                    </div>
                                </PreviewSection>
                            )}
                        </div>
                        <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-hidden">
                            <div className="thin-scrollbar min-h-0 overflow-y-auto pr-1.5">
                                <PreviewSection title="文本提示词" count={promptCount} empty="暂无文本提示词">
                                    <div className="space-y-1.5">
                                        {ownPrompt ? <OwnPromptPreviewCard prompt={ownPrompt} theme={theme} /> : null}
                                        {textInputs.map((input, index) => (
                                            <TextSortCard key={input.nodeId} input={input} textIndex={index} textTotal={textInputs.length} theme={theme} onMove={onMoveInput} onEdit={onStartTextEdit} />
                                        ))}
                                    </div>
                                </PreviewSection>
                            </div>
                            <div className="flex min-h-0 flex-col rounded-xl border p-2.5" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
                                {editingTextId ? (
                                    <>
                                        <div className="mb-2 flex items-center justify-between">
                                            <div className="text-sm font-semibold">编辑文本提示词</div>
                                            <Button size="small" type="text" onClick={onStopTextEdit}>
                                                收起
                                            </Button>
                                        </div>
                                        <Input.TextArea className="thin-scrollbar !flex-1 !resize-none !text-xs !leading-5" value={editingText} onChange={(event) => onEditingTextChange(event.target.value)} />
                                        <div className="mt-2 flex justify-end gap-2">
                                            <Button size="small" onClick={onStopTextEdit}>
                                                取消
                                            </Button>
                                            <Button size="small" type="primary" onClick={onSaveTextEdit}>
                                                保存
                                            </Button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex h-full flex-col justify-center rounded-xl border border-dashed px-4 text-center text-xs leading-5 opacity-45" style={{ borderColor: theme.node.stroke }}>
                                        <Edit3 className="mx-auto mb-2 size-5" />
                                        选择一条文本后在这里编辑
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无提示词或参考素材" className="py-8" />
                )}
            </div>
        </Modal>
    );
}

function PreviewSection({ title, count, empty, children }: { title: string; count: number; empty: string; children: ReactNode }) {
    return (
        <section>
            <div className="sticky top-0 z-10 mb-1 flex items-center justify-between px-0.5 py-0.5 backdrop-blur-sm">
                <div className="text-xs font-semibold">{title}</div>
                <div className="text-[11px] opacity-50">{count} 个</div>
            </div>
            {count ? children : <div className="rounded-xl border border-dashed px-3 py-5 text-center text-xs opacity-45">{empty}</div>}
        </section>
    );
}

function OwnPromptPreviewCard({ prompt, theme }: { prompt: string; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return (
        <div className="rounded-md border px-2 py-1.5" style={{ background: `${theme.node.fill}99`, borderColor: theme.node.stroke }}>
            <div className="mb-0.5 text-[10px] font-medium opacity-50">节点提示词</div>
            <div className="line-clamp-3 whitespace-pre-wrap break-words text-[11px] leading-4 opacity-80">{prompt}</div>
        </div>
    );
}

function TextSortCard({
    input,
    textIndex,
    textTotal,
    theme,
    onMove,
    onEdit,
}: {
    input: NodeGenerationInput;
    textIndex: number;
    textTotal: number;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onMove: (input: NodeGenerationInput, offset: number) => void;
    onEdit: (input: NodeGenerationInput) => void;
}) {
    return (
        <div className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-1.5 rounded-md border px-2 py-1" style={{ background: `${theme.node.fill}99`, borderColor: theme.node.stroke }}>
            <div className="min-w-0">
                <div className="truncate text-[10px] font-medium opacity-50">文本 {textIndex + 1}</div>
                <div className="line-clamp-1 whitespace-pre-wrap break-words text-[11px] leading-4 opacity-80">{input.text}</div>
            </div>
            <div className="flex justify-end gap-1">
                <Button size="small" className="!h-6 !w-6 !min-w-6 !p-0" icon={<Edit3 className="size-3" />} onClick={() => onEdit(input)} />
                <VerticalOrderButtons index={textIndex} total={textTotal} onMove={(offset) => onMove(input, offset)} />
            </div>
        </div>
    );
}

function MediaSortCard({
    input,
    imageIndex,
    videoIndex,
    audioIndex,
    mediaIndex,
    mediaTotal,
    theme,
    seedanceRole,
    onRoleChange,
    onMove,
}: {
    input: NodeGenerationInput;
    imageIndex: number;
    videoIndex: number;
    audioIndex: number;
    mediaIndex: number;
    mediaTotal: number;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    seedanceRole?: ReferenceImageRole;
    onRoleChange?: (role: ReferenceImageRole) => void;
    onMove: (input: NodeGenerationInput, offset: number) => void;
}) {
    if (input.type === "image") return <ImageSortCard input={input} imageIndex={imageIndex} imageTotal={mediaTotal} orderIndex={mediaIndex} orderTotal={mediaTotal} theme={theme} seedanceRole={seedanceRole} onRoleChange={onRoleChange} onMove={onMove} />;
    if (input.type === "video") return <VideoSortCard input={input} videoIndex={videoIndex} videoTotal={mediaTotal} orderIndex={mediaIndex} orderTotal={mediaTotal} theme={theme} onMove={onMove} />;
    if (input.type === "audio") return <AudioSortCard input={input} audioIndex={audioIndex} audioTotal={mediaTotal} orderIndex={mediaIndex} orderTotal={mediaTotal} theme={theme} onMove={onMove} />;
    return null;
}

function ImageSortCard({
    input,
    imageIndex,
    imageTotal,
    orderIndex,
    orderTotal,
    theme,
    seedanceRole,
    onRoleChange,
    onMove,
}: {
    input: NodeGenerationInput;
    imageIndex: number;
    imageTotal: number;
    orderIndex?: number;
    orderTotal?: number;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    seedanceRole?: ReferenceImageRole;
    onRoleChange?: (role: ReferenceImageRole) => void;
    onMove: (input: NodeGenerationInput, offset: number) => void;
}) {
    if (!input.image) return null;
    return (
        <div className={`${seedanceRole ? "w-48" : "w-36"} shrink-0 overflow-hidden rounded-lg border`} style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
            <div className="relative">
                <img src={input.image.dataUrl} alt={input.title} className="aspect-[4/3] w-full bg-black/30 object-contain" />
                <span className="absolute left-1 top-1 rounded bg-black/50 px-1 py-0.5 text-[9px] font-medium text-white">{seedanceReferenceLabel("image", imageIndex + 1)}</span>
                <HorizontalOrderButtons index={orderIndex ?? imageIndex} total={orderTotal ?? imageTotal} onMove={(offset) => onMove(input, offset)} />
            </div>
            {seedanceRole ? (
                <div className="px-1.5 py-1" onMouseDown={(event) => event.stopPropagation()}>
                    <Segmented
                        block
                        size="small"
                        value={seedanceRole}
                        onChange={(value) => onRoleChange?.(value as ReferenceImageRole)}
                        options={[
                            { label: "参考", value: "reference_image" },
                            { label: "首帧", value: "first_frame" },
                            { label: "尾帧", value: "last_frame" },
                        ]}
                    />
                </div>
            ) : null}
        </div>
    );
}

function VideoSortCard({
    input,
    videoIndex,
    videoTotal,
    orderIndex,
    orderTotal,
    theme,
    onMove,
}: {
    input: NodeGenerationInput;
    videoIndex: number;
    videoTotal: number;
    orderIndex?: number;
    orderTotal?: number;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onMove: (input: NodeGenerationInput, offset: number) => void;
}) {
    if (!input.video) return null;
    return (
        <div className="w-48 shrink-0 overflow-hidden rounded-lg border" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
            <div className="relative">
                <video src={input.video.url} className="aspect-video w-full bg-black object-cover" muted playsInline />
                <span className="absolute left-1 top-1 rounded bg-black/50 px-1 py-0.5 text-[9px] font-medium text-white">{seedanceReferenceLabel("video", videoIndex + 1)}</span>
                <HorizontalOrderButtons index={orderIndex ?? videoIndex} total={orderTotal ?? videoTotal} onMove={(offset) => onMove(input, offset)} />
            </div>
            <div className="truncate px-2 py-1 text-[10px] opacity-60">{input.title}</div>
        </div>
    );
}

function AudioSortCard({
    input,
    audioIndex,
    audioTotal,
    orderIndex,
    orderTotal,
    theme,
    onMove,
}: {
    input: NodeGenerationInput;
    audioIndex: number;
    audioTotal: number;
    orderIndex?: number;
    orderTotal?: number;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onMove: (input: NodeGenerationInput, offset: number) => void;
}) {
    if (!input.audio) return null;
    return (
        <div className="w-48 shrink-0 overflow-hidden rounded-lg border" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
            <div className="relative flex aspect-video w-full flex-col items-center justify-center gap-1.5 px-2" style={{ background: `${theme.node.stroke}33` }}>
                <AudioLines className="size-6 opacity-60" />
                <span className="max-w-full truncate text-[10px] opacity-65">{input.title}</span>
                <span className="absolute left-1 top-1 rounded bg-black/50 px-1 py-0.5 text-[9px] font-medium text-white">{seedanceReferenceLabel("audio", audioIndex + 1)}</span>
                <HorizontalOrderButtons index={orderIndex ?? audioIndex} total={orderTotal ?? audioTotal} onMove={(offset) => onMove(input, offset)} />
            </div>
            <audio src={input.audio.url} controls className="block h-8 w-full" onMouseDown={(event) => event.stopPropagation()} />
        </div>
    );
}

function VerticalOrderButtons({ index, total, onMove }: { index: number; total: number; onMove: (offset: number) => void }) {
    return (
        <>
            <Button size="small" className="!h-6 !w-6 !min-w-6 !p-0" icon={<ArrowUp className="size-3" />} disabled={index <= 0} onClick={() => onMove(-1)} />
            <Button size="small" className="!h-6 !w-6 !min-w-6 !p-0" icon={<ArrowDown className="size-3" />} disabled={index >= total - 1} onClick={() => onMove(1)} />
        </>
    );
}

function HorizontalOrderButtons({ index, total, onMove }: { index: number; total: number; onMove: (offset: number) => void }) {
    return (
        <div className="absolute inset-x-1 bottom-1 flex justify-between">
            <Button size="small" className="!h-6 !w-6 !min-w-6 !rounded-full !bg-white/85 !p-0 !shadow-sm" icon={<ArrowLeft className="size-3" />} disabled={index <= 0} onClick={() => onMove(-1)} />
            <Button size="small" className="!h-6 !w-6 !min-w-6 !rounded-full !bg-white/85 !p-0 !shadow-sm" icon={<ArrowRight className="size-3" />} disabled={index >= total - 1} onClick={() => onMove(1)} />
        </div>
    );
}
