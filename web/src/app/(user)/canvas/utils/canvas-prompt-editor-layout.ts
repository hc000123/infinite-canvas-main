const PROMPT_EDITOR_CONTENT_BASE = "thin-scrollbar overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 text-sm leading-6 outline-none select-text";

export function promptEditorContentClass(expanded: boolean) {
    return `${PROMPT_EDITOR_CONTENT_BASE} ${expanded ? "min-h-[62dvh] max-h-[72dvh]" : "min-h-24 max-h-44"}`;
}
