"use client";

import { Box, Clapperboard, Image as ImageIcon, UserRound } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

export type CanvasPromptPresetKind = "character" | "scene" | "prop" | "storyboard";

const presets: Array<{ kind: CanvasPromptPresetKind; title: string; description: string; icon: typeof UserRound; prompt: string }> = [
    {
        kind: "character",
        title: "角色",
        description: "人物设定、造型、表演状态",
        icon: UserRound,
        prompt: "角色设定：年轻女性主角，清晰五官，现代短剧质感，半身像，服装、发型、表情和身份特征明确，干净背景，适合作为后续视频角色参考图。",
    },
    {
        kind: "scene",
        title: "场景",
        description: "空间、光线、气氛、时代感",
        icon: ImageIcon,
        prompt: "场景设定：现代短剧室内主场景，空间层次清晰，真实光源，电影感构图，环境道具可参与叙事，画面干净自然，适合作为视频场景参考图。",
    },
    {
        kind: "prop",
        title: "道具",
        description: "关键物件、互动道具、细节特写",
        icon: Box,
        prompt: "道具设定：关键互动道具特写，材质、磨损、尺寸和使用痕迹清楚，真实摄影质感，背景简洁，方便后续抠图、加白和作为视频参考。",
    },
    {
        kind: "storyboard",
        title: "宫格分镜",
        description: "九宫格画面探索和镜头节奏",
        icon: Clapperboard,
        prompt: "九宫格分镜：同一段短剧情绪动作的 3x3 画面探索，每格构图清晰，景别有变化，人物动作连续，场景和光线保持一致，适合后续单格裁切和高清重绘。",
    },
];

export function CanvasPromptStartPanel({ onSelect }: { onSelect: (preset: { kind: CanvasPromptPresetKind; title: string; prompt: string }) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-6">
            <div className="pointer-events-auto w-full max-w-3xl rounded-2xl border p-4 shadow-xl backdrop-blur" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}>
                <div className="px-2 pb-3">
                    <div className="text-lg font-semibold">从文生图开始</div>
                    <div className="mt-1 text-sm" style={{ color: theme.node.muted }}>
                        选择一个项目内创作预设，先生成角色、场景、道具或宫格分镜。
                    </div>
                </div>
                <div className="grid gap-2 md:grid-cols-4">
                    {presets.map((preset) => {
                        const Icon = preset.icon;
                        return (
                            <button
                                key={preset.kind}
                                type="button"
                                className="min-h-32 rounded-xl border p-3 text-left transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                                style={{ borderColor: theme.toolbar.border, background: theme.toolbar.itemHover }}
                                onClick={() => onSelect(preset)}
                            >
                                <Icon className="size-5" />
                                <div className="mt-3 text-base font-semibold">{preset.title}</div>
                                <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                                    {preset.description}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
