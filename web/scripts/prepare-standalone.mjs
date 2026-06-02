import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneDir = path.join(webDir, ".next", "standalone");

async function exists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function copyDir(source, target) {
    if (!(await exists(source))) return;
    await fs.rm(target, { recursive: true, force: true });
    await fs.cp(source, target, { recursive: true, dereference: true });
}

if (!(await exists(standaloneDir))) {
    throw new Error("缺少 .next/standalone，请先运行 npm run build。");
}

await copyDir(path.join(webDir, ".next", "static"), path.join(standaloneDir, ".next", "static"));
await copyDir(path.join(webDir, "public"), path.join(standaloneDir, "public"));
