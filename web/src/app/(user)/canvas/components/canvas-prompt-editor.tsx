"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AudioLines, Image as ImageIcon, Maximize2, Video } from "lucide-react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { LexicalTypeaheadMenuPlugin, MenuOption } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import {
    $applyNodeReplacement,
    $createLineBreakNode,
    $createParagraphNode,
    $createTextNode,
    $getRoot,
    $insertNodes,
    $isElementNode,
    $isLineBreakNode,
    $isTextNode,
    DecoratorNode,
    type EditorConfig,
    type LexicalNode,
    type NodeKey,
    type SerializedLexicalNode,
    type Spread,
} from "lexical";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasPromptDocument, CanvasPromptReferenceBlock } from "../utils/canvas-prompt-document";
import { promptEditorContentClass } from "../utils/canvas-prompt-editor-layout";
import { filterReferenceMentions, matchCanvasReferenceMention, type CanvasReferenceMentionOption } from "../utils/canvas-reference-mentions";

type CanvasPromptEditorProps = {
    initialDocument: CanvasPromptDocument;
    options: CanvasReferenceMentionOption[];
    placeholder: string;
    onChange: (document: CanvasPromptDocument) => void;
    onPreviewReference?: (nodeId: string) => void;
    expanded?: boolean;
    onExpand?: () => void;
};

type SerializedCanvasPromptReferenceNode = Spread<
    { nodeId: string; kind: CanvasPromptReferenceBlock["kind"]; label: string },
    SerializedLexicalNode
>;

const ReferenceContext = createContext<{ options: Map<string, CanvasReferenceMentionOption>; onPreviewReference?: (nodeId: string) => void }>({ options: new Map() });

class CanvasPromptReferenceNode extends DecoratorNode<React.ReactNode> {
    __nodeId: string;
    __kind: CanvasPromptReferenceBlock["kind"];
    __label: string;

    static getType() {
        return "canvas-prompt-reference";
    }

    static clone(node: CanvasPromptReferenceNode) {
        return new CanvasPromptReferenceNode(node.__nodeId, node.__kind, node.__label, node.__key);
    }

    static importJSON(serialized: SerializedCanvasPromptReferenceNode) {
        return $createCanvasPromptReferenceNode(serialized.nodeId, serialized.kind, serialized.label);
    }

    constructor(nodeId: string, kind: CanvasPromptReferenceBlock["kind"], label: string, key?: NodeKey) {
        super(key);
        this.__nodeId = nodeId;
        this.__kind = kind;
        this.__label = label;
    }

    createDOM(_config: EditorConfig) {
        return document.createElement("span");
    }

    updateDOM() {
        return false;
    }

    exportJSON(): SerializedCanvasPromptReferenceNode {
        return { type: CanvasPromptReferenceNode.getType(), version: 1, nodeId: this.__nodeId, kind: this.__kind, label: this.__label };
    }

    getTextContent() {
        return this.__label;
    }

    isInline() {
        return true;
    }

    isKeyboardSelectable() {
        return true;
    }

    decorate() {
        return <CanvasPromptReferenceChip nodeId={this.__nodeId} kind={this.__kind} label={this.__label} />;
    }
}

function $createCanvasPromptReferenceNode(nodeId: string, kind: CanvasPromptReferenceBlock["kind"], label: string) {
    return $applyNodeReplacement(new CanvasPromptReferenceNode(nodeId, kind, label));
}

function $isCanvasPromptReferenceNode(node: LexicalNode | null | undefined): node is CanvasPromptReferenceNode {
    return node instanceof CanvasPromptReferenceNode;
}

class ReferenceMenuOption extends MenuOption {
    option: CanvasReferenceMentionOption;

    constructor(option: CanvasReferenceMentionOption) {
        super(option.id);
        this.option = option;
    }
}

export function CanvasPromptEditor({ initialDocument, options, placeholder, onChange, onPreviewReference, expanded = false, onExpand }: CanvasPromptEditorProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const optionMap = useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);
    const initialConfig = useMemo(
        () => ({
            namespace: "canvas-prompt-editor",
            nodes: [CanvasPromptReferenceNode],
            theme: { paragraph: "m-0" },
            onError(error: Error) {
                throw error;
            },
            editorState: () => $writePromptDocument(initialDocument),
        }),
        [initialDocument],
    );

    return (
        <ReferenceContext.Provider value={{ options: optionMap, onPreviewReference }}>
            <LexicalComposer initialConfig={initialConfig}>
                <div className="relative min-h-24 rounded-lg border" style={{ background: theme.node.fill, borderColor: theme.node.stroke }} data-canvas-no-zoom data-canvas-shortcut-scope="ignore">
                    <PlainTextPlugin
                        contentEditable={
                            <ContentEditable
                                className={`${promptEditorContentClass(expanded)} ${onExpand ? "pr-12" : "pr-3"}`}
                                style={{ color: theme.node.text }}
                                aria-placeholder={placeholder}
                                placeholder={<span className="pointer-events-none absolute left-3 top-2 text-sm leading-6" style={{ color: theme.node.placeholder }}>{placeholder}</span>}
                            />
                        }
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                    <HistoryPlugin />
                    <OnChangePlugin onChange={(editorState) => editorState.read(() => onChange($readPromptDocument()))} />
                    <ReferenceTypeaheadPlugin options={options} />
                    {onExpand ? (
                        <button
                            type="button"
                            className="absolute right-2 top-2 z-10 flex size-8 items-center justify-center rounded-md border backdrop-blur transition hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]"
                            style={{ background: `${theme.toolbar.panel}e6`, borderColor: theme.toolbar.border, color: theme.node.text }}
                            aria-label="展开编辑提示词"
                            title="展开编辑提示词"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={onExpand}
                        >
                            <Maximize2 className="size-4" />
                        </button>
                    ) : null}
                </div>
            </LexicalComposer>
        </ReferenceContext.Provider>
    );
}

function ReferenceTypeaheadPlugin({ options }: { options: CanvasReferenceMentionOption[] }) {
    const [editor] = useLexicalComposerContext();
    const [query, setQuery] = useState<string | null>(null);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const matches = useMemo(() => filterReferenceMentions(options, query || "").slice(0, 9).map((option) => new ReferenceMenuOption(option)), [options, query]);

    return (
        <LexicalTypeaheadMenuPlugin
            anchorClassName="z-[1000]"
            options={matches}
            triggerFn={matchCanvasReferenceMention}
            onQueryChange={setQuery}
            onSelectOption={(menuOption, textNodeContainingQuery, closeMenu) => {
                const option = menuOption.option;
                const referenceNode = $createCanvasPromptReferenceNode(option.id, option.previewType || "image", option.label);
                if (textNodeContainingQuery) textNodeContainingQuery.replace(referenceNode);
                else $insertNodes([referenceNode]);
                referenceNode.selectNext();
                closeMenu();
                editor.focus();
            }}
            menuRenderFn={(anchorElementRef, { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }) =>
                anchorElementRef.current
                    ? createPortal(
                          <div className="max-h-72 w-72 overflow-y-auto rounded-lg border p-1 shadow-[var(--studio-shadow)]" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }}>
                              {matches.map((menuOption, index) => (
                                  <button
                                      key={menuOption.key}
                                      ref={menuOption.setRefElement}
                                      type="button"
                                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]"
                                      style={{ background: selectedIndex === index ? theme.toolbar.activeBg : "transparent", color: theme.node.text }}
                                      onMouseEnter={() => setHighlightedIndex(index)}
                                      onMouseDown={(event) => event.preventDefault()}
                                      onClick={() => selectOptionAndCleanUp(menuOption)}
                                  >
                                      <ReferencePreview option={menuOption.option} />
                                      <span className="min-w-0 flex-1">
                                          <span className="block font-medium">{menuOption.option.label}</span>
                                          {menuOption.option.detail ? <span className="block truncate opacity-55">{menuOption.option.detail}</span> : null}
                                      </span>
                                  </button>
                              ))}
                          </div>,
                          anchorElementRef.current,
                      )
                    : null
            }
        />
    );
}

function CanvasPromptReferenceChip({ nodeId, kind, label }: { nodeId: string; kind: CanvasPromptReferenceBlock["kind"]; label: string }) {
    const { options, onPreviewReference } = useContext(ReferenceContext);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const option = options.get(nodeId);
    const missing = !option;
    const displayLabel = option?.label || label;
    return (
        <button
            type="button"
            contentEditable={false}
            className="mx-0.5 inline-flex h-7 max-w-40 translate-y-1 items-center gap-1.5 overflow-hidden rounded-md border pr-2 align-baseline text-xs font-medium"
            style={{ background: missing ? "var(--studio-danger-soft)" : theme.toolbar.activeBg, borderColor: missing ? "var(--studio-danger)" : theme.node.stroke, color: theme.node.text }}
            title={missing ? `${displayLabel}：源节点已不存在` : option.detail || displayLabel}
            onClick={() => (option ? onPreviewReference?.(nodeId) : undefined)}
        >
            <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden" style={{ background: theme.toolbar.panel }}>
                {option?.previewUrl && kind === "image" ? <img src={option.previewUrl} alt={displayLabel} className="h-full w-full object-cover" /> : kind === "video" ? <Video className="size-3.5" /> : kind === "audio" ? <AudioLines className="size-3.5" /> : <ImageIcon className="size-3.5" />}
            </span>
            <span className="truncate">{displayLabel}</span>
        </button>
    );
}

function ReferencePreview({ option }: { option: CanvasReferenceMentionOption }) {
    if (option.previewUrl && option.previewType === "image") return <span className="flex h-11 w-14 shrink-0 overflow-hidden rounded-md"><img src={option.previewUrl} alt={option.label} className="h-full w-full object-cover" /></span>;
    const Icon = option.previewType === "video" ? Video : option.previewType === "audio" ? AudioLines : ImageIcon;
    return <span className="flex h-11 w-14 shrink-0 items-center justify-center rounded-md bg-black/10"><Icon className="size-4 opacity-70" /></span>;
}

function $writePromptDocument(document: CanvasPromptDocument) {
    const root = $getRoot();
    root.clear();
    const paragraph = $createParagraphNode();
    for (const block of document.blocks) {
        if (block.type === "reference") {
            paragraph.append($createCanvasPromptReferenceNode(block.nodeId, block.kind, block.label));
            continue;
        }
        const parts = block.text.split("\n");
        parts.forEach((part, index) => {
            if (part) paragraph.append($createTextNode(part));
            if (index < parts.length - 1) paragraph.append($createLineBreakNode());
        });
    }
    root.append(paragraph);
}

function $readPromptDocument(): CanvasPromptDocument {
    const blocks: CanvasPromptDocument["blocks"] = [];
    const appendText = (text: string) => {
        if (!text) return;
        const previous = blocks.at(-1);
        if (previous?.type === "text") previous.text += text;
        else blocks.push({ type: "text", text });
    };
    const visit = (node: LexicalNode) => {
        if ($isCanvasPromptReferenceNode(node)) {
            blocks.push({ type: "reference", nodeId: node.__nodeId, kind: node.__kind, label: node.__label });
            return;
        }
        if ($isTextNode(node)) {
            appendText(node.getTextContent());
            return;
        }
        if ($isLineBreakNode(node)) {
            appendText("\n");
            return;
        }
        if ($isElementNode(node)) node.getChildren().forEach(visit);
    };
    const topLevel = $getRoot().getChildren();
    topLevel.forEach((node, index) => {
        visit(node);
        if (index < topLevel.length - 1) appendText("\n");
    });
    return { version: 1, blocks };
}
