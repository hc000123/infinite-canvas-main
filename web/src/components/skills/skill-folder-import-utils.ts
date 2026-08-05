import { load } from "js-yaml";

import { skillFolderLayout } from "../../services/api/skill-folder-form.ts";
import type { SkillSourceFile } from "@/services/api/admin-skills";

export type SkillFolderMetadata = { name: string; summary: string; version: string };
export type SkillFolderDiff = Record<"added" | "modified" | "deleted" | "unchanged", string[]>;
export type SkillFolderSubmitState = {
    fileCount: number;
    hasSkill: boolean;
    updating: boolean;
    stageKey: string;
    name: string;
    preparing: boolean;
    hasPreviousVersion: boolean;
    previousFilesLoading: boolean;
    hasComparableBaseline: boolean;
    diffing: boolean;
    diffReady: boolean;
    baselineUnavailable: boolean;
    diffUnavailable: boolean;
};

type DropEntry = DropFileEntry | DropDirectoryEntry;
type DropFileEntry = { isFile: true; isDirectory: false; name: string; file: (success: (file: File) => void, error?: (error: DOMException) => void) => void };
type DropDirectoryEntry = { isFile: false; isDirectory: true; name: string; createReader: () => { readEntries: (success: (entries: DropEntry[]) => void, error?: (error: DOMException) => void) => void } };
type DropItem = { webkitGetAsEntry: () => unknown };

export function parseSkillFolderMetadata(content: string, folderName: string, defaultVersion = "1.0.0"): SkillFolderMetadata {
    content = content.replace(/^\uFEFF/, "");
    const match = content.match(/^---[\t ]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[\t ]*(?:\r?\n|$)/);
    if (!match) return { name: folderName, summary: "", version: defaultVersion };
    try {
        const value = load(match[1]);
        const metadata = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
        return {
            name: scalar(metadata.name) || folderName,
            summary: rawScalar(metadata.description),
            version: scalar(metadata.version) || defaultVersion,
        };
    } catch {
        throw new Error("SKILL.md frontmatter YAML 格式无效");
    }
}

export function canSubmitSkillFolderImport(state: SkillFolderSubmitState) {
    if (state.preparing || state.fileCount < 1 || !state.hasSkill || (!state.updating && !(state.stageKey && state.name.trim()))) return false;
    if (state.updating && state.hasPreviousVersion && state.previousFilesLoading) return false;
    if (state.updating && state.hasComparableBaseline && !state.baselineUnavailable && !state.diffUnavailable && (state.diffing || !state.diffReady)) return false;
    return true;
}

export function createLatestRequestGuard() {
    let latest = 0;
    const begin = () => {
        const request = ++latest;
        return { isCurrent: () => request === latest };
    };
    return {
        begin,
        invalidate: () => { latest += 1; },
        run: async <T>(work: Promise<T>, apply: (value: T) => void) => {
            const request = begin();
            const value = await work;
            if (!request.isCurrent()) return false;
            apply(value);
            return true;
        },
    };
}

export async function readSkillFolderMetadata(files: File[], defaultVersion = "1.0.0") {
    const layout = skillFolderLayout(files);
    const index = layout.relativePaths.indexOf("SKILL.md");
    if (index < 0) throw new Error("文件夹根目录必须包含 SKILL.md");
    return parseSkillFolderMetadata(await files[index].text(), layout.folderName || "Skill", defaultVersion);
}

export async function diffSkillFolderFiles(files: File[], previous: Array<Pick<SkillSourceFile, "path" | "hash">>): Promise<SkillFolderDiff> {
    const { relativePaths } = skillFolderLayout(files);
    const current = files.map((file, index) => ({ file, path: relativePaths[index] })).filter((item) => !skillFolderTrashPath(item.path));
    const before = new Map(previous.filter((file) => !skillFolderTrashPath(file.path)).map((file) => [file.path, file.hash.toLowerCase()]));
    const diff: SkillFolderDiff = { added: [], modified: [], deleted: [], unchanged: [] };
    for (const { file, path } of current) {
        const oldHash = before.get(path);
        if (!oldHash) diff.added.push(path);
        else {
            const hash = await sha256(file);
            diff[hash === oldHash ? "unchanged" : "modified"].push(path);
            before.delete(path);
        }
    }
    diff.deleted.push(...before.keys());
    for (const values of Object.values(diff)) values.sort();
    return diff;
}

function skillFolderTrashPath(path: string) {
    const name = path.replaceAll("\\", "/").split("/").at(-1) || "";
    return name === ".DS_Store" || name.toLowerCase() === "thumbs.db";
}

export async function readDroppedSkillFolder(items: Iterable<DropItem>) {
    const entries = Array.from(items, (item) => item.webkitGetAsEntry() as DropEntry | null).filter((entry): entry is DropEntry => Boolean(entry));
    if (entries.length !== 1 || !entries[0].isDirectory) throw new Error("请拖入一个完整文件夹，不要拖入单个文件");
    const root = entries[0];
    safeSegment(root.name);
    const files = await readDirectory(root, root.name);
    if (!skillFolderLayout(files).relativePaths.includes("SKILL.md")) throw new Error("拖入的文件夹根目录缺少 SKILL.md");
    return files;
}

function scalar(value: unknown) {
    return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function rawScalar(value: unknown) {
    return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

async function sha256(file: File) {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function readDirectory(directory: DropDirectoryEntry, path: string): Promise<File[]> {
    const reader = directory.createReader();
    const files: File[] = [];
    while (true) {
        const entries = await new Promise<DropEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (!entries.length) break;
        for (const entry of entries) {
            safeSegment(entry.name);
            const entryPath = `${path}/${entry.name}`;
            if (entry.isDirectory) files.push(...await readDirectory(entry, entryPath));
            else files.push(withRelativePath(await new Promise<File>((resolve, reject) => entry.file(resolve, reject)), entryPath));
        }
    }
    return files;
}

function safeSegment(value: string) {
    if (!value || value === "." || value === ".." || /[\\/]/.test(value)) throw new Error("文件夹包含无效路径");
}

function withRelativePath(file: File, path: string) {
    Object.defineProperty(file, "webkitRelativePath", { configurable: true, value: path });
    return file;
}
