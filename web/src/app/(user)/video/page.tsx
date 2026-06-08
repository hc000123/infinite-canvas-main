"use client";

import { Bot, Check, ChevronRight, FlaskConical, Link2, Play, RotateCcw, SendToBack, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { App, Button, Input, Tabs, Tag } from "antd";

import { cn } from "@/lib/utils";

type PromptStatus = "待审核" | "已确认" | "需修改";
type AssetStatus = "完整" | "缺角色图" | "缺场景图";
type CanvasStatus = "未导入" | "已导入" | "已生成";
type FilterKey = "all" | "review" | "missing" | "ready" | "imported" | "generated";
type AssetKind = "角色图" | "场景图" | "道具图" | "上一镜尾帧";

type ProductionPackage = {
    id: string;
    segment: string;
    duration: string;
    promptStatus: PromptStatus;
    assetStatus: AssetStatus;
    canvasStatus: CanvasStatus;
    prompt: string;
    tags: Record<"运镜" | "主体动作" | "环境" | "光影" | "节奏", string>;
    assets: { kind: AssetKind; name: string; status: "已绑定" | "缺失" }[];
    config: { model: string; ratio: string; duration: string; resolution: string; motion: string; frames: string };
    risks: { level: "提示" | "注意" | "阻断"; text: string }[];
};

const initialPackages: ProductionPackage[] = [
    {
        id: "P01",
        segment: "雨夜天桥，女主发现遗落的加密芯片",
        duration: "8s",
        promptStatus: "已确认",
        assetStatus: "完整",
        canvasStatus: "已导入",
        prompt: "雨夜霓虹天桥，女主低头捡起一枚微弱发光的加密芯片，镜头从湿漉漉的地面低角度推近到她警觉的侧脸，远处警灯反射在玻璃幕墙上，节奏克制、悬疑。",
        tags: { 运镜: "低角度推近，结尾轻微上摇", 主体动作: "拾起芯片后迅速环顾四周", 环境: "雨夜天桥、霓虹反射、远处警灯", 光影: "青蓝主光，红色警灯扫过", 节奏: "前慢后紧，8 秒内完成发现动作" },
        assets: [
            { kind: "角色图", name: "林夏·雨衣造型", status: "已绑定" },
            { kind: "场景图", name: "天桥夜景", status: "已绑定" },
            { kind: "道具图", name: "加密芯片", status: "已绑定" },
            { kind: "上一镜尾帧", name: "P00 尾帧", status: "已绑定" },
        ],
        config: { model: "Seedance 2.0 Pro", ratio: "16:9", duration: "8s", resolution: "1080p", motion: "中", frames: "使用首尾帧" },
        risks: [{ level: "提示", text: "镜头动作清晰，可直接进入画布生成节点。" }],
    },
    {
        id: "P02",
        segment: "地下停车场，追踪者从柱后现身",
        duration: "12s",
        promptStatus: "待审核",
        assetStatus: "缺角色图",
        canvasStatus: "未导入",
        prompt: "地下停车场冷白灯闪烁，追踪者从水泥柱后缓慢现身，主角背对镜头察觉异常后停步，镜头横移穿过车辆缝隙，制造被窥视感，最后定格在追踪者手中的旧式通讯器。",
        tags: { 运镜: "横移穿车缝，末尾定格", 主体动作: "追踪者现身，主角停步回头", 环境: "地下停车场、车辆阴影、水泥柱", 光影: "冷白灯闪烁，局部暗区", 节奏: "中速推进，末尾悬停" },
        assets: [
            { kind: "角色图", name: "追踪者制服设定", status: "缺失" },
            { kind: "场景图", name: "地下停车场", status: "已绑定" },
            { kind: "道具图", name: "旧式通讯器", status: "已绑定" },
            { kind: "上一镜尾帧", name: "P01 尾帧", status: "已绑定" },
        ],
        config: { model: "Seedance 2.0 Pro", ratio: "16:9", duration: "12s", resolution: "1080p", motion: "中高", frames: "使用首尾帧" },
        risks: [
            { level: "注意", text: "缺少追踪者角色图，导入画布前建议绑定角色参考。" },
            { level: "提示", text: "12 秒内动作数量可控，但末尾定格需避免与下一包衔接断裂。" },
        ],
    },
    {
        id: "P03",
        segment: "监控室，屏幕显示关键证据被远程删除",
        duration: "15s",
        promptStatus: "需修改",
        assetStatus: "缺场景图",
        canvasStatus: "未导入",
        prompt: "监控室内多块屏幕同时闪烁，技术员快速切换窗口试图恢复证据，主角冲进画面质问，屏幕上的文件夹逐个变红并消失，镜头环绕两人和屏幕形成紧张压迫。",
        tags: { 运镜: "半环绕加快速切屏", 主体动作: "技术员操作、主角冲入、文件消失", 环境: "监控室、多屏幕、数据面板", 光影: "屏幕蓝绿光为主，红色警示闪烁", 节奏: "信息量偏高，需压缩动作" },
        assets: [
            { kind: "角色图", name: "技术员", status: "已绑定" },
            { kind: "场景图", name: "监控室", status: "缺失" },
            { kind: "道具图", name: "证据文件 UI", status: "已绑定" },
            { kind: "上一镜尾帧", name: "P02 尾帧", status: "缺失" },
        ],
        config: { model: "Seedance 2.0 Pro", ratio: "16:9", duration: "15s", resolution: "1080p", motion: "高", frames: "仅首帧" },
        risks: [
            { level: "阻断", text: "动作过多且 15 秒达到上限，建议拆成技术员恢复证据和主角冲入两个生产包。" },
            { level: "注意", text: "缺少监控室场景图和上一镜尾帧，镜头衔接不明确。" },
        ],
    },
    {
        id: "P04",
        segment: "街边便利店外，线人交出备份密钥",
        duration: "8s",
        promptStatus: "待审核",
        assetStatus: "完整",
        canvasStatus: "未导入",
        prompt: "便利店招牌的红绿灯光照在雨棚下，线人把备份密钥塞进主角掌心后迅速离开，镜头跟随手部特写再切到主角抬眼，背景车流形成拖影。",
        tags: { 运镜: "手部特写跟随，轻切抬眼", 主体动作: "线人交付密钥后离开", 环境: "便利店雨棚、街边车流", 光影: "红绿招牌光与湿地反射", 节奏: "短促直接，留出情绪停顿" },
        assets: [
            { kind: "角色图", name: "线人", status: "已绑定" },
            { kind: "场景图", name: "便利店街边", status: "已绑定" },
            { kind: "道具图", name: "备份密钥", status: "已绑定" },
            { kind: "上一镜尾帧", name: "P03 尾帧", status: "已绑定" },
        ],
        config: { model: "Seedance 2.0 Lite", ratio: "16:9", duration: "8s", resolution: "720p", motion: "中", frames: "使用首尾帧" },
        risks: [{ level: "提示", text: "提示词聚焦单一动作，适合确认后导入画布。" }],
    },
    {
        id: "P05",
        segment: "楼顶对峙，反派说出真相",
        duration: "12s",
        promptStatus: "已确认",
        assetStatus: "完整",
        canvasStatus: "已生成",
        prompt: "城市楼顶强风中，反派站在霓虹广告牌下说出真相，主角向前一步停住，镜头从两人之间的空隙缓慢推进，远处城市灯海压低，情绪冷峻。",
        tags: { 运镜: "双人间隙慢推", 主体动作: "反派陈述，主角克制逼近", 环境: "城市楼顶、霓虹广告牌", 光影: "背光轮廓，冷色城市灯海", 节奏: "慢速压迫，适合台词段" },
        assets: [
            { kind: "角色图", name: "反派楼顶造型", status: "已绑定" },
            { kind: "场景图", name: "城市楼顶", status: "已绑定" },
            { kind: "道具图", name: "广告牌", status: "已绑定" },
            { kind: "上一镜尾帧", name: "P04 尾帧", status: "已绑定" },
        ],
        config: { model: "Seedance 2.0 Pro", ratio: "16:9", duration: "12s", resolution: "1080p", motion: "低", frames: "使用首尾帧" },
        risks: [{ level: "提示", text: "已在画布生成视频版本，后续版本选择请到画布完成。" }],
    },
];

const filters: { key: FilterKey; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "review", label: "待审核" },
    { key: "missing", label: "缺参考" },
    { key: "ready", label: "可导入画布" },
    { key: "imported", label: "已导入画布" },
    { key: "generated", label: "已生成" },
];

export default function VideoPage() {
    const { message } = App.useApp();
    const [packages, setPackages] = useState(initialPackages);
    const [selectedId, setSelectedId] = useState(initialPackages[1].id);
    const [filter, setFilter] = useState<FilterKey>("all");
    const [detailTab, setDetailTab] = useState("prompt");

    const selected = packages.find((item) => item.id === selectedId) || packages[0];
    const visiblePackages = useMemo(() => packages.filter((item) => matchFilter(item, filter)), [packages, filter]);

    const updatePackage = (id: string, patch: Partial<ProductionPackage>) => setPackages((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    const confirmPackage = (item: ProductionPackage) => {
        updatePackage(item.id, { promptStatus: "已确认" });
        message.success(`${item.id} 已确认，可进入画布`);
    };
    const importPackage = (item: ProductionPackage) => {
        if (item.promptStatus !== "已确认") {
            message.warning("请先确认提示词，再导入画布");
            return;
        }
        updatePackage(item.id, { canvasStatus: "已导入" });
        message.success(`${item.id} 已导入画布节点`);
    };
    const importConfirmedPackages = () => {
        const readyCount = packages.filter((item) => item.promptStatus === "已确认" && item.canvasStatus === "未导入").length;
        if (!readyCount) {
            message.info("暂无可导入的已确认生产包");
            return;
        }
        setPackages((items) => items.map((item) => (item.promptStatus === "已确认" && item.canvasStatus === "未导入" ? { ...item, canvasStatus: "已导入" } : item)));
        message.success(`已导入 ${readyCount} 个已确认生产包到画布`);
    };

    return (
        <div className="min-h-full bg-[#090d0f] text-stone-100">
            <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[1500px] flex-col gap-4 px-4 py-4 sm:px-6">
                <section className="shrink-0 border-b border-white/10 pb-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-stone-400">
                                <span className="font-medium text-teal-200">AI · 画布</span>
                                <ChevronRight className="size-3.5" />
                                <span>霓虹之下 / 第 05 集 / 真相浮出</span>
                            </div>
                            <h1 className="text-2xl font-semibold tracking-normal text-white sm:text-3xl">视频提示词审核台</h1>
                            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-stone-300">
                                <span>当前阶段：视频提示词审核</span>
                                <span className="text-stone-500">|</span>
                                <span>已确认 8 个生产包，缺参考 3 个，待审核 4 个</span>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2 lg:justify-end">
                            <Button type="primary" icon={<Bot className="size-4" />} onClick={() => message.info("已请求视频提示词 Agent 重新检查生产包")}>
                                运行视频提示词 Agent
                            </Button>
                            <Button className="!border-teal-300/30 !bg-teal-300/10 !text-teal-100 hover:!border-teal-200 hover:!bg-teal-300/20" icon={<SendToBack className="size-4" />} onClick={importConfirmedPackages}>
                                导入已确认项到画布
                            </Button>
                        </div>
                    </div>
                </section>

                <section className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
                    <div className="min-h-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.035]">
                        <div className="border-b border-white/10 px-3 pt-2">
                            <Tabs
                                activeKey={filter}
                                onChange={(key) => setFilter(key as FilterKey)}
                                items={filters.map((item) => ({ key: item.key, label: item.label }))}
                                className="video-review-tabs"
                            />
                        </div>
                        <div className="thin-scrollbar min-h-0 overflow-x-auto">
                            <div className="min-w-[980px]">
                                <div className="grid grid-cols-[76px_minmax(240px,1fr)_72px_112px_120px_112px_210px] border-b border-white/10 px-3 py-2 text-xs font-medium text-stone-500">
                                    <span>编号</span>
                                    <span>对应剧情段落</span>
                                    <span>时长</span>
                                    <span>提示词状态</span>
                                    <span>参考资产</span>
                                    <span>画布状态</span>
                                    <span className="text-right">操作</span>
                                </div>
                                {visiblePackages.map((item) => (
                                    <div
                                        key={item.id}
                                        className={cn(
                                            "grid w-full cursor-pointer grid-cols-[76px_minmax(240px,1fr)_72px_112px_120px_112px_210px] items-center gap-0 border-b border-white/[0.07] px-3 py-2.5 text-left text-sm transition hover:bg-white/[0.055]",
                                            selected.id === item.id && "bg-teal-300/[0.08]",
                                        )}
                                        onClick={() => {
                                            setSelectedId(item.id);
                                            setDetailTab("prompt");
                                        }}
                                    >
                                        <span className="font-semibold text-teal-100">{item.id}</span>
                                        <span className="truncate pr-4 text-stone-100">{item.segment}</span>
                                        <span className="text-stone-300">{item.duration}</span>
                                        <span>
                                            <StatusTag label={item.promptStatus} />
                                        </span>
                                        <span>
                                            <StatusTag label={item.assetStatus} />
                                        </span>
                                        <span>
                                            <StatusTag label={item.canvasStatus} />
                                        </span>
                                        <span className="flex justify-end gap-1.5" onClick={(event) => event.stopPropagation()}>
                                            <Button size="small" type="text" className="!text-stone-200 hover:!bg-white/10" onClick={() => setSelectedId(item.id)}>
                                                查看
                                            </Button>
                                            <Button size="small" type="text" className="!text-emerald-200 hover:!bg-emerald-300/10" disabled={item.promptStatus === "已确认"} onClick={() => confirmPackage(item)}>
                                                确认
                                            </Button>
                                            <Button size="small" type="text" className="!text-teal-100 hover:!bg-teal-300/10" disabled={item.canvasStatus !== "未导入"} onClick={() => importPackage(item)}>
                                                导入画布
                                            </Button>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <aside className="min-h-[620px] overflow-hidden rounded-lg border border-white/10 bg-[#0d1316] xl:min-h-0">
                        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-lg font-semibold text-white">{selected.id}</span>
                                    <StatusTag label={selected.promptStatus} />
                                </div>
                                <div className="mt-1 line-clamp-2 text-sm text-stone-400">{selected.segment}</div>
                            </div>
                            <Button size="small" type="text" className="!text-stone-400 hover:!bg-white/10 hover:!text-stone-100" icon={<FlaskConical className="size-4" />}>
                                自由视频试验
                            </Button>
                        </div>
                        <Tabs
                            activeKey={detailTab}
                            onChange={setDetailTab}
                            className="video-review-tabs px-4"
                            items={[
                                { key: "prompt", label: "视频提示词", children: <PromptDetail item={selected} onChange={(prompt) => updatePackage(selected.id, { prompt })} /> },
                                { key: "assets", label: "参考资产", children: <AssetDetail item={selected} /> },
                                { key: "config", label: "生成配置", children: <ConfigDetail item={selected} /> },
                                { key: "risk", label: "风险与建议", children: <RiskDetail item={selected} /> },
                            ]}
                        />
                    </aside>
                </section>
            </main>
        </div>
    );
}

function PromptDetail({ item, onChange }: { item: ProductionPackage; onChange: (prompt: string) => void }) {
    return (
        <div className="thin-scrollbar max-h-[calc(100vh-250px)] space-y-4 overflow-y-auto pb-4">
            <Input.TextArea
                value={item.prompt}
                onChange={(event) => onChange(event.target.value)}
                autoSize={{ minRows: 8, maxRows: 12 }}
                className="!border-white/10 !bg-black/20 !text-stone-100 placeholder:!text-stone-600"
            />
            <div className="grid gap-2">
                {Object.entries(item.tags).map(([label, value]) => (
                    <div key={label} className="grid grid-cols-[76px_minmax(0,1fr)] gap-3 rounded-md border border-white/[0.07] bg-white/[0.035] px-3 py-2 text-sm">
                        <span className="text-stone-500">{label}</span>
                        <span className="text-stone-200">{value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function AssetDetail({ item }: { item: ProductionPackage }) {
    return (
        <div className="space-y-3 pb-4">
            {item.assets.map((asset) => (
                <div key={asset.kind} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 rounded-md border border-white/[0.07] bg-white/[0.035] px-3 py-2.5 text-sm">
                    <span className="text-stone-500">{asset.kind}</span>
                    <div className="min-w-0">
                        <div className="flex items-center justify-between gap-2">
                            <span className={cn("truncate", asset.status === "缺失" ? "text-amber-200" : "text-stone-100")}>{asset.name}</span>
                            <StatusTag label={asset.status === "缺失" ? "缺参考" : "完整"} />
                        </div>
                        {asset.status === "缺失" ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                                <Button size="small" icon={<Link2 className="size-3.5" />}>
                                    去资产库绑定
                                </Button>
                                <Button size="small" icon={<Play className="size-3.5" />}>
                                    生成参考图
                                </Button>
                            </div>
                        ) : null}
                    </div>
                </div>
            ))}
        </div>
    );
}

function ConfigDetail({ item }: { item: ProductionPackage }) {
    const entries = [
        ["模型", item.config.model],
        ["比例", item.config.ratio],
        ["时长", item.config.duration],
        ["清晰度", item.config.resolution],
        ["运动强度", item.config.motion],
        ["首尾帧", item.config.frames],
    ];

    return (
        <div className="space-y-3 pb-4">
            <div className="rounded-md border border-teal-300/15 bg-teal-300/[0.06] px-3 py-2 text-sm text-teal-100">这里只做审核和确认，不在这里生成正式视频。</div>
            <div className="grid grid-cols-2 gap-2">
                {entries.map(([label, value]) => (
                    <div key={label} className="rounded-md border border-white/[0.07] bg-white/[0.035] px-3 py-2">
                        <div className="text-xs text-stone-500">{label}</div>
                        <div className="mt-1 text-sm text-stone-100">{value}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function RiskDetail({ item }: { item: ProductionPackage }) {
    return (
        <div className="space-y-3 pb-4">
            {item.risks.map((risk) => (
                <div key={risk.text} className="flex gap-3 rounded-md border border-white/[0.07] bg-white/[0.035] px-3 py-2.5 text-sm">
                    {risk.level === "提示" ? <Check className="mt-0.5 size-4 shrink-0 text-emerald-300" /> : risk.level === "注意" ? <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-300" /> : <RotateCcw className="mt-0.5 size-4 shrink-0 text-amber-300" />}
                    <div>
                        <div className="text-xs text-stone-500">{risk.level}</div>
                        <div className="mt-1 text-stone-100">{risk.text}</div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function StatusTag({ label }: { label: PromptStatus | AssetStatus | CanvasStatus | "缺参考" | "完整" }) {
    const colorClass =
        label === "已确认" || label === "完整" || label === "已生成"
            ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200"
            : label === "待审核" || label === "已导入"
              ? "border-teal-300/25 bg-teal-300/10 text-teal-200"
              : label === "未导入"
                ? "border-stone-400/20 bg-stone-400/10 text-stone-300"
                : "border-amber-300/25 bg-amber-300/10 text-amber-200";

    return <Tag className={cn("m-0 rounded px-1.5 py-0 text-xs leading-5", colorClass)}>{label}</Tag>;
}

function matchFilter(item: ProductionPackage, filter: FilterKey) {
    if (filter === "review") return item.promptStatus === "待审核";
    if (filter === "missing") return item.assetStatus !== "完整";
    if (filter === "ready") return item.promptStatus === "已确认" && item.canvasStatus === "未导入";
    if (filter === "imported") return item.canvasStatus === "已导入";
    if (filter === "generated") return item.canvasStatus === "已生成";
    return true;
}
