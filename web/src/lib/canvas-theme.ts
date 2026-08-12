export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

export const canvasThemes = {
    light: {
        accent: "#C94D34",
        surfaceRaised: "#EEEAE2",
        surfaceOverlay: "rgba(255,252,246,.88)",
        focusRing: "rgba(201,77,52,.38)",
        canvas: {
            background: "#F5F1E9",
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
            activeStroke: "#C94D34",
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
        accent: "#DF593B",
        surfaceRaised: "#24211B",
        surfaceOverlay: "rgba(42,38,31,.9)",
        focusRing: "rgba(223,89,59,.42)",
        canvas: {
            background: "#171512",
            dot: "rgba(225,215,198,.2)",
            line: "rgba(225,215,198,.075)",
            selectionStroke: "#DF593B",
            selectionFill: "rgba(223,89,59,.10)",
        },
        node: {
            label: "#B9B0A1",
            fill: "#24211B",
            panel: "#2A261F",
            stroke: "#403A30",
            activeStroke: "#DF593B",
            placeholder: "#81786B",
            text: "#F2ECE2",
            muted: "#B9B0A1",
            faint: "#81786B",
        },
        toolbar: {
            panel: "rgba(42,38,31,.94)",
            border: "#403A30",
            item: "#B9B0A1",
            itemHover: "#322E27",
            activeBg: "rgba(223,89,59,.12)",
            activeText: "#DF593B",
        },
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
