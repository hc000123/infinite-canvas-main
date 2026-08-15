"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, Button, Modal, Radio, Segmented, Select, Switch } from "antd";
import { CloudUpload, Sparkles } from "lucide-react";

import type { VideoFrameInterpolationMode, VideoInterpolationProcessingMode, VideoUpscaleCapabilities, VideoUpscaleProviderID, VideoUpscaleQualityMode, VideoUpscaleSubmitOptions, VideoUpscaleTarget } from "@/services/api/video-upscale";
import type { CanvasNodeData } from "../types";
import { estimateVideoInterpolationCost, estimateVideoUpscaleCost, formatVideoUpscaleCost } from "../utils/video-upscale-cost";

const qualityOptions: Array<{ label: string; value: VideoUpscaleQualityMode }> = [
    { label: "兼容", value: "compatible" },
    { label: "均衡", value: "balanced" },
    { label: "母版", value: "master" },
];

const interpolationOptions: Array<{ label: string; value: VideoInterpolationProcessingMode }> = [
    { label: "极速", value: "ultra-fast" },
    { label: "快速", value: "fast" },
    { label: "高质量", value: "medium" },
];

const providerOptions: Array<{ label: string; value: VideoUpscaleProviderID }> = [
    { label: "火山 LAS", value: "volcengine-las" },
    { label: "腾讯 MPS", value: "tencent-mps" },
];

export function CanvasVideoUpscaleModal({ node, capabilities, loading, onClose, onSubmit }: { node: CanvasNodeData | null; capabilities: VideoUpscaleCapabilities | null; loading: boolean; onClose: () => void; onSubmit: (node: CanvasNodeData, options: VideoUpscaleSubmitOptions) => void }) {
    const width = Math.round(node?.metadata?.naturalWidth || node?.width || 0);
    const height = Math.round(node?.metadata?.naturalHeight || node?.height || 0);
    const shortEdge = Math.min(width, height);
    const [provider, setProvider] = useState<VideoUpscaleProviderID>("volcengine-las");
    const [tencentTemplateId, setTencentTemplateId] = useState(0);
    const providerCapability = capabilities?.providers.find((item) => item.id === provider);
    const availableTargets = useMemo<VideoUpscaleTarget[]>(() => {
        const targets = providerCapability?.targets || [];
        if (!shortEdge) return targets;
        if (shortEdge < 1080) return targets.includes("1080p") ? ["1080p"] : [];
        if (shortEdge < 1440) return targets.includes("2k") ? ["2k"] : [];
        return [];
    }, [providerCapability?.targets, shortEdge]);
    const availableTencentTemplates = useMemo(
        () => (providerCapability?.templates || []).filter((item) => targetAllowedForShortEdge(item.target, shortEdge)),
        [providerCapability?.templates, shortEdge],
    );
    const selectedTencentTemplate = availableTencentTemplates.find((item) => item.definition === tencentTemplateId) || availableTencentTemplates[0];
    const [target, setTarget] = useState<VideoUpscaleTarget>("1080p");
    const [outputQualityMode, setOutputQualityMode] = useState<VideoUpscaleQualityMode>("compatible");
    const [preserveAudio, setPreserveAudio] = useState(true);
    const [frameInterpolationMode, setFrameInterpolationMode] = useState<VideoFrameInterpolationMode>("keep");
    const [interpolationMode, setInterpolationMode] = useState<VideoInterpolationProcessingMode>("fast");
    useEffect(() => {
        if (capabilities?.providers.length === 1) setProvider(capabilities.providers[0].id);
        else if (capabilities?.providers.some((item) => item.id === capabilities.provider)) setProvider(capabilities.provider);
    }, [node?.id, capabilities]);
    useEffect(() => {
        setTarget(availableTargets[0] || "1080p");
        setTencentTemplateId(availableTencentTemplates[0]?.definition || 0);
        setOutputQualityMode(capabilities?.defaultOutputQualityMode || capabilities?.outputQualityModes?.[0] || "compatible");
        setPreserveAudio(true);
        setFrameInterpolationMode("keep");
        setInterpolationMode(capabilities?.frameInterpolation.defaultProcessingMode || "fast");
    }, [node?.id, provider, availableTargets, availableTencentTemplates, capabilities?.defaultOutputQualityMode, capabilities?.outputQualityModes, capabilities?.frameInterpolation.defaultProcessingMode]);
    const isTencent = provider === "tencent-mps";
    const effectiveTarget = isTencent ? selectedTencentTemplate?.target || "1080p" : target;
    const output = outputSize(width, height, effectiveTarget);
    const duration = node?.metadata?.videoUpscale?.inputDurationSeconds || Number(node?.metadata?.duration || node?.metadata?.seconds || 0);
    const frameRate = node?.metadata?.videoUpscale?.inputFrameRate || 0;
    const upscaleEstimate = !isTencent && output && capabilities?.pricing ? estimateVideoUpscaleCost({ durationSeconds: duration, frameRate, outputWidth: output.width, outputHeight: output.height, pricing: capabilities.pricing }) : null;
    const targetFrameRate = interpolationTargetFrameRate(frameRate, frameInterpolationMode);
    const interpolationEstimate = output && frameInterpolationMode !== "keep" && capabilities?.frameInterpolation.pricing
        ? estimateVideoInterpolationCost({ durationSeconds: duration, sourceFrameRate: frameRate, targetFrameRate, outputWidth: output.width, outputHeight: output.height, processingMode: interpolationMode, maxTargetFrameRate: capabilities.frameInterpolation.maxTargetFrameRate, maxSourceMultiplier: capabilities.frameInterpolation.maxSourceMultiplier, pricing: capabilities.frameInterpolation.pricing })
        : null;
    const totalCost = upscaleEstimate && (frameInterpolationMode === "keep" || interpolationEstimate) ? upscaleEstimate.costCny + (interpolationEstimate?.costCny || 0) : null;
    const enabled = capabilities?.enabled === true;
    const interpolationAvailable = providerCapability?.interpolation === true && capabilities?.frameInterpolation.status === "available";
    const validInterpolationTarget = (value: number) => interpolationAvailable && (!frameRate || (value > frameRate && value <= (capabilities?.frameInterpolation.maxTargetFrameRate || 480) && value <= frameRate * (capabilities?.frameInterpolation.maxSourceMultiplier || 6)));
    const canSubmit = enabled && Boolean(providerCapability) && (isTencent ? Boolean(selectedTencentTemplate) : availableTargets.includes(target));
    const submitOptions: VideoUpscaleSubmitOptions = { provider, enhancementScene: selectedTencentTemplate?.scene, tencentTemplateId: selectedTencentTemplate?.definition, target: effectiveTarget, outputQualityMode, preserveAudio, frameInterpolationMode, interpolationMode };

    return (
        <Modal title="视频超分" open={Boolean(node)} onCancel={onClose} footer={null} width={560} centered destroyOnHidden>
            {node ? (
                <div className="space-y-4">
                    <Alert showIcon icon={<CloudUpload className="size-4" />} type="info" title="视频将上传到云端付费服务处理" description={`将使用${isTencent ? "腾讯 MPS" : "火山 LAS"}完成增强。原视频节点不会被替换，结果会作为右侧新节点加入画布并归档到资产。`} />
                    <div className="grid grid-cols-4 gap-2 rounded-lg bg-[var(--studio-panel-muted-bg)] p-3 text-sm">
                        <Spec label="源规格" value={width && height ? `${width} × ${height}` : "待识别"} />
                        <Spec label="目标规格" value={output ? `${output.width} × ${output.height}` : effectiveTarget === "2k" ? "2K" : "1080p"} />
                        <Spec label="时长" value={duration ? `${formatNumber(duration)} 秒` : "待识别"} />
                        <Spec label="源帧率" value={frameRate ? `${formatNumber(frameRate)} fps` : "待识别"} />
                    </div>
                    {(capabilities?.providers.length || 0) > 1 ? <OptionRow label="增强渠道"><Segmented aria-label="增强渠道" value={provider} options={providerOptions.filter((item) => capabilities?.providers.some((providerItem) => providerItem.id === item.value))} onChange={(value) => setProvider(value as VideoUpscaleProviderID)} /></OptionRow> : null}
                    {isTencent ? <OptionRow label="腾讯增强方案"><Select className="w-72" value={selectedTencentTemplate?.definition} options={availableTencentTemplates.map((item) => ({ value: item.definition, label: `${item.displayName} · ${item.target === "2k" ? "2K" : "1080p"}` }))} onChange={setTencentTemplateId} placeholder="暂无可用模板" /></OptionRow> : null}
                    {!isTencent && availableTargets.length ? <OptionRow label="目标清晰度"><Segmented value={target} options={availableTargets.map((value) => ({ label: value === "2k" ? "2K" : "1080p", value }))} onChange={(value) => setTarget(value as VideoUpscaleTarget)} /></OptionRow> : null}
                    {!isTencent ? <OptionRow label="输出质量"><Segmented aria-label="输出质量" value={outputQualityMode} options={qualityOptions.filter((item) => capabilities?.outputQualityModes?.includes(item.value) !== false)} onChange={(value) => setOutputQualityMode(value as VideoUpscaleQualityMode)} /></OptionRow> : null}
                    {!isTencent ? <OptionRow label="音频"><span className="flex items-center gap-2 text-sm"><Switch aria-label="保留原音频" size="small" checked={preserveAudio} disabled={!capabilities?.preserveAudioSupported} onChange={setPreserveAudio} />保留原音频</span></OptionRow> : null}
                    {!isTencent ? <div>
                        <div className="mb-2 text-sm font-medium">帧率</div>
                        <Radio.Group aria-label="帧率" value={frameInterpolationMode} onChange={(event) => setFrameInterpolationMode(event.target.value as VideoFrameInterpolationMode)} className="grid w-full gap-2">
                            <Radio value="keep">保持原帧率</Radio>
                            <Radio value="to25" disabled={!validInterpolationTarget(25)}>智能插帧至 25fps</Radio>
                            <Radio value="to30" disabled={!validInterpolationTarget(30)}>智能插帧至 30fps</Radio>
                            <Radio value="double" disabled={!interpolationAvailable || (frameRate > 0 && frameRate * 2 > (capabilities?.frameInterpolation.maxTargetFrameRate || 480))}>智能插帧 2×</Radio>
                            <Radio value="to60" disabled={!validInterpolationTarget(60)}>智能插帧至 60fps</Radio>
                        </Radio.Group>
                    </div> : null}
                    {!isTencent && frameInterpolationMode !== "keep" ? <OptionRow label="插帧模式"><Segmented aria-label="插帧模式" value={interpolationMode} options={interpolationOptions.filter((item) => capabilities?.frameInterpolation.processingModes?.includes(item.value) !== false)} onChange={(value) => setInterpolationMode(value as VideoInterpolationProcessingMode)} /></OptionRow> : null}
                    {!isTencent && frameInterpolationMode !== "keep" && !frameRate ? <Alert type="warning" showIcon title="等待服务端识别源帧率" description="识别成功前不会提交付费任务；若目标帧率不符合限制，任务会在云端处理前停止。" /> : null}
                    {!isTencent ? <CostCard upscaleEstimate={upscaleEstimate} interpolationEstimate={interpolationEstimate} totalCost={totalCost} interpolationMode={interpolationMode} interpolationRequested={frameInterpolationMode !== "keep"} outputLabel={effectiveTarget === "2k" ? "2K（1440P 档）" : "1080P 档"} duration={duration} frameRate={frameRate} /> : null}
                    {isTencent && providerCapability?.costNotice ? <Alert type="warning" showIcon title="腾讯云计费提示" description={providerCapability.costNotice} /> : null}
                    {shortEdge >= 1440 ? <Alert type="success" showIcon title="当前视频已达到 2K" description="无需继续超分，因此不会提交云端任务。" /> : null}
                    {!enabled ? <Alert type="warning" showIcon title={capabilities ? "服务端尚未启用视频超分" : "暂时无法确认视频超分配置"} description="请让管理员在后台设置中启用并完成至少一个视频增强渠道的配置。" /> : null}
                    <Button type="primary" block size="large" icon={<Sparkles className="size-4" />} loading={loading} disabled={!canSubmit} onClick={() => onSubmit(node, submitOptions)}>
                        {isTencent ? "开始腾讯 MPS 增强" : totalCost !== null ? `预计 ${formatVideoUpscaleCost(totalCost)} · 开始视频超分` : "暂无法预估 · 开始视频超分"}
                    </Button>
                </div>
            ) : null}
        </Modal>
    );
}

function CostCard({ upscaleEstimate, interpolationEstimate, totalCost, interpolationMode, interpolationRequested, outputLabel, duration, frameRate }: { upscaleEstimate: ReturnType<typeof estimateVideoUpscaleCost>; interpolationEstimate: ReturnType<typeof estimateVideoInterpolationCost>; totalCost: number | null; interpolationMode: VideoInterpolationProcessingMode; interpolationRequested: boolean; outputLabel: string; duration: number; frameRate: number }) {
    return (
        <div className="rounded-lg border border-[var(--studio-border-subtle)] p-3">
            <div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium">费用预估</span><span className="text-xs text-[var(--studio-text-tertiary)]">{interpolationRequested ? "LAS 超分 → 智能插帧" : "LAS 超分"}</span></div>
            {upscaleEstimate ? (
                <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-sm">
                    <CostRow label="源时长 / 帧率" value={`${formatNumber(duration)} 秒 / ${formatNumber(frameRate)} fps`} />
                    <CostRow label="输出分辨率" value={outputLabel} />
                    <CostRow label="分辨率系数" value={`× ${upscaleEstimate.resolutionFactor}`} />
                    <CostRow label="帧率系数" value={`× ${upscaleEstimate.frameRateFactor}`} />
                    <CostRow label="折算计费时长" value={`${formatNumber(upscaleEstimate.billableMinutes)} 分钟`} />
                    <CostRow label="LAS 超分费用" value={formatVideoUpscaleCost(upscaleEstimate.costCny)} strong />
                    {interpolationEstimate ? <>
                        <CostRow label="插帧目标" value={`${formatNumber(interpolationEstimate.targetFrameRate)} fps`} />
                        <CostRow label="插帧输入分辨率" value={outputLabel} />
                        <CostRow label="差值帧率" value={`+ ${formatNumber(interpolationEstimate.deltaFrameRate)} fps`} />
                        <CostRow label="插帧模式" value={interpolationMode === "medium" ? "高质量" : interpolationMode === "ultra-fast" ? "极速" : "快速"} />
                        <CostRow label="插帧基础系数" value={`× ${interpolationEstimate.resolutionBaseFactor}`} />
                        <CostRow label="插帧折算时长" value={`${formatNumber(interpolationEstimate.billableMinutes)} 分钟`} />
                        <CostRow label="插帧预计费用" value={formatVideoUpscaleCost(interpolationEstimate.costCny)} strong />
                    </> : null}
                    <CostRow label="预计总费用" value={totalCost === null ? "待识别" : formatVideoUpscaleCost(totalCost)} strong />
                </div>
            ) : <div className="py-2 text-sm text-[var(--studio-text-secondary)]">暂无法预估：提交后由服务端识别视频时长与帧率，确认合法后才会创建付费任务。</div>}
            <div className="mt-3 text-xs text-[var(--studio-text-tertiary)]">预估金额，实际费用以火山引擎账单为准。</div>
        </div>
    );
}

function OptionRow({ label, children }: { label: string; children: ReactNode }) {
    return <div className="flex items-center justify-between gap-4"><span className="text-sm font-medium">{label}</span>{children}</div>;
}

function Spec({ label, value }: { label: string; value: string }) {
    return <div><div className="text-xs text-[var(--studio-text-tertiary)]">{label}</div><div className="mt-1 font-medium text-[var(--studio-text-primary)]">{value}</div></div>;
}

function CostRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
    return <div className="flex justify-between gap-3"><span className="text-[var(--studio-text-tertiary)]">{label}</span><span className={strong ? "font-semibold text-[var(--studio-text-primary)]" : "text-[var(--studio-text-secondary)]"}>{value}</span></div>;
}

function outputSize(width: number, height: number, target: VideoUpscaleTarget) {
    if (!width || !height) return null;
    const scale = (target === "2k" ? 1440 : 1080) / Math.min(width, height);
    return { width: evenDimension(width * scale), height: evenDimension(height * scale) };
}

function targetAllowedForShortEdge(target: VideoUpscaleTarget, shortEdge: number) {
    if (!shortEdge) return true;
    if (shortEdge < 1080) return target === "1080p";
    if (shortEdge < 1440) return target === "2k";
    return false;
}

function evenDimension(value: number) {
    const rounded = Math.round(value);
    return rounded % 2 ? rounded + 1 : rounded;
}

function formatNumber(value: number) {
    return Number(value.toFixed(3)).toString();
}

function interpolationTargetFrameRate(sourceFrameRate: number, mode: VideoFrameInterpolationMode) {
    if (mode === "to25") return 25;
    if (mode === "to30") return 30;
    if (mode === "to60") return 60;
    return mode === "double" ? sourceFrameRate * 2 : sourceFrameRate;
}
