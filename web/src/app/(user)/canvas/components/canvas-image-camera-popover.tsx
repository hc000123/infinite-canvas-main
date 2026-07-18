"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Aperture, Camera, ChevronDown, Focus } from "lucide-react";
import { Button } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasNodeMetadata } from "../types";

type CameraPatch = Pick<CanvasNodeMetadata, "imageCameraName" | "imageLensName" | "imageFocalLength" | "imageAperture">;

type CanvasImageCameraPopoverProps = {
    value?: CameraPatch;
    buttonClassName?: string;
    onChange: (patch: CameraPatch) => void;
};

const cameraOptions = ["Panavision DXL2", "ARRI Alexa Mini LF", "Sony Venice 2"];
const lensOptions = ["Arri Signature Prime", "Cooke S4/i", "Zeiss Supreme Prime"];
const focalOptions = ["24", "35", "50", "85"];
const apertureOptions = ["f/2.8", "f/4", "f/5.6", "f/8"];

export function CanvasImageCameraPopover({ value, buttonClassName, onChange }: CanvasImageCameraPopoverProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const buttonRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
    const summary = value?.imageFocalLength ? `${value.imageFocalLength}mm` : value?.imageCameraName ? "摄像机" : "摄像机";

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => setButtonRect(buttonRef.current?.getBoundingClientRect() || null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            setOpen(false);
        };

        syncPosition();
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        return () => {
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
            window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
        };
    }, [open]);

    return (
        <>
            <span ref={buttonRef} className="inline-flex min-w-0">
                <Button
                    size="small"
                    type="text"
                    className={buttonClassName || "!h-8 !max-w-[170px] !justify-start !rounded-full !px-2.5"}
                    style={{ background: theme.node.fill, color: theme.node.text }}
                    icon={<Camera className="size-3.5" />}
                    onClick={() => setOpen((currentOpen) => !currentOpen)}
                >
                    <span className="truncate">{summary}</span>
                    <ChevronDown className="ml-1 size-3.5 shrink-0 opacity-60" />
                </Button>
            </span>
            {open && buttonRect ? <CameraPortal buttonRect={buttonRect} panelRef={panelRef} value={value} theme={theme} onChange={onChange} /> : null}
        </>
    );
}

function CameraPortal({
    buttonRect,
    panelRef,
    value,
    theme,
    onChange,
}: {
    buttonRect: DOMRect;
    panelRef: RefObject<HTMLDivElement | null>;
    value?: CameraPatch;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onChange: (patch: CameraPatch) => void;
}) {
    const width = Math.min(700, Math.max(360, window.innerWidth - 24));
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, buttonRect.left - 220));
    const update = (patch: CameraPatch) => onChange({ ...value, ...patch });
    const style = {
        position: "fixed",
        zIndex: 1200,
        width,
        left,
        bottom: window.innerHeight - buttonRect.top + 8,
        maxHeight: Math.max(280, buttonRect.top - 24),
        background: theme.toolbar.panel,
        border: `1px solid ${theme.toolbar.border}`,
        borderRadius: 8,
        boxShadow: "var(--studio-shadow)",
        padding: 18,
        overflowY: "auto",
        color: theme.node.text,
    } as const;

    return createPortal(
        <div ref={panelRef} style={style} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <CameraColumn icon={<Camera className="size-4" />} title="相机" options={cameraOptions} value={value?.imageCameraName} theme={theme} onSelect={(imageCameraName) => update({ imageCameraName })} />
                <CameraColumn icon={<Camera className="size-4" />} title="镜头" options={lensOptions} value={value?.imageLensName} theme={theme} onSelect={(imageLensName) => update({ imageLensName })} />
                <CameraColumn icon={<Focus className="size-4" />} title="焦距" options={focalOptions} value={value?.imageFocalLength} suffix="mm" theme={theme} onSelect={(imageFocalLength) => update({ imageFocalLength })} />
                <CameraColumn icon={<Aperture className="size-4" />} title="光圈" options={apertureOptions} value={value?.imageAperture} theme={theme} onSelect={(imageAperture) => update({ imageAperture })} />
            </div>
        </div>,
        document.body,
    );
}

function CameraColumn({
    icon,
    title,
    options,
    value,
    suffix = "",
    theme,
    onSelect,
}: {
    icon: ReactNode;
    title: string;
    options: string[];
    value?: string;
    suffix?: string;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onSelect: (value: string) => void;
}) {
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-center gap-1.5 text-sm font-medium" style={{ color: theme.node.muted }}>
                {icon}
                {title}
            </div>
            <div className="rounded-lg border p-1.5" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                {options.map((option) => {
                    const selected = option === value;
                    return (
                        <button
                            key={option}
                            type="button"
                            className="block h-10 w-full rounded-md px-2 text-center text-sm transition hover:bg-[var(--studio-hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]"
                            style={{ background: selected ? theme.toolbar.activeBg : "transparent", color: selected ? theme.toolbar.activeText : theme.node.text }}
                            onClick={() => onSelect(option)}
                        >
                            {option}
                            {suffix && !option.endsWith(suffix) ? suffix : ""}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
