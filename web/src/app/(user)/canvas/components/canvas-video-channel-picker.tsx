"use client";

import { Segmented } from "antd";
import { Cloud, Laptop } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AiConfig } from "@/stores/use-config-store";

type CanvasVideoChannelPickerProps = {
    value: AiConfig["channelMode"];
    onChange: (value: AiConfig["channelMode"]) => void;
    disabled?: boolean;
    className?: string;
};

export function CanvasVideoChannelPicker({ value, onChange, disabled, className }: CanvasVideoChannelPickerProps) {
    return (
        <Segmented
            size="small"
            className={cn("canvas-video-channel-picker !h-10 !rounded-full !p-1", className)}
            value={value}
            disabled={disabled}
            onChange={(next) => onChange(next as AiConfig["channelMode"])}
            options={[
                {
                    value: "local",
                    label: (
                        <span className="inline-flex h-7 items-center gap-1 px-1 text-xs">
                            <Laptop className="size-3.5" />
                            本地
                        </span>
                    ),
                },
                {
                    value: "remote",
                    label: (
                        <span className="inline-flex h-7 items-center gap-1 px-1 text-xs">
                            <Cloud className="size-3.5" />
                            云端
                        </span>
                    ),
                },
            ]}
        />
    );
}
