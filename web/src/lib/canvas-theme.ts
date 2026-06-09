export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

export const canvasThemes = {
    light: {
        canvas: {
            background: "#f4f2ed",
            dot: "rgba(68,64,60,.28)",
            line: "rgba(68,64,60,.12)",
            selectionStroke: "#1c1917",
            selectionFill: "rgba(28,25,23,.06)",
        },
        node: {
            label: "#57534e",
            fill: "#e7e5df",
            panel: "#fbfaf7",
            stroke: "#d6d3ca",
            activeStroke: "#1c1917",
            placeholder: "#8a8479",
            text: "#292524",
            muted: "#78716c",
            faint: "#a8a29e",
        },
        toolbar: {
            panel: "rgba(251,250,247,.96)",
            border: "#d6d3ca",
            item: "#57534e",
            itemHover: "#e7e5df",
            activeBg: "#e7e5df",
            activeText: "#292524",
        },
    },
    dark: {
        canvas: {
            background: "#101217",
            dot: "rgba(174,182,198,.22)",
            line: "rgba(174,182,198,.075)",
            selectionStroke: "#6fa8ff",
            selectionFill: "rgba(111,168,255,.10)",
        },
        node: {
            label: "#aeb6c6",
            fill: "#171a21",
            panel: "#151821",
            stroke: "#2b303b",
            activeStroke: "#6fa8ff",
            placeholder: "#768092",
            text: "#f2f4f8",
            muted: "#aeb6c6",
            faint: "#768092",
        },
        toolbar: {
            panel: "rgba(21,24,33,.92)",
            border: "#2a2f3a",
            item: "#aeb6c6",
            itemHover: "#1f2633",
            activeBg: "#243045",
            activeText: "#8fb9ff",
        },
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
