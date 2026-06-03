import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ELECTRON_BUILDER_VERSION = "26.8.1";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(scriptDir, "..");
const repoDir = path.resolve(webDir, "..");
const desktopBuildDir = path.join(webDir, "build", "desktop");
const desktopBinDir = path.join(desktopBuildDir, "bin");
const desktopWebDir = path.join(desktopBuildDir, "web");
const releaseDir = path.join(webDir, "release");
const desktopAppDir = path.join(webDir, "desktop", "app");

const args = new Set(process.argv.slice(2));
const isWin = args.has("--win");
const isMac = args.has("--mac");
const dirOnly = args.has("--dir");
const prepareOnly = args.has("--prepare-only");
const skipWebBuild = args.has("--skip-web-build");
const skipBackendBuild = args.has("--skip-backend-build");
const arch = args.has("--x64") ? "x64" : args.has("--arm64") ? "arm64" : process.arch === "arm64" ? "arm64" : "x64";
const goArch = arch === "x64" ? "amd64" : arch;

if (Number(isWin) + Number(isMac) !== 1) {
    throw new Error("请指定一个桌面封装目标：--win 或 --mac。");
}

if (isWin && arch !== "x64") {
    throw new Error("当前 Windows 安装包只封装 x64，请使用 --win --x64。");
}

function run(command, commandArgs, options = {}) {
    const result = spawnSync(command, commandArgs, {
        cwd: options.cwd || webDir,
        env: { ...process.env, ...options.env },
        stdio: "inherit",
        shell: process.platform === "win32",
    });

    if (result.status !== 0) {
        throw new Error(`${command} ${commandArgs.join(" ")} failed with exit code ${result.status}`);
    }
}

async function exists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function findStandaloneServer(standaloneDir) {
    const preferred = [path.join(standaloneDir, "server.js"), path.join(standaloneDir, "web", "server.js")];
    for (const filePath of preferred) {
        if (await exists(filePath)) return filePath;
    }

    const matches = [];
    async function walk(dir, depth) {
        if (depth > 3) return;
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === "node_modules") continue;
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await walk(fullPath, depth + 1);
            } else if (entry.isFile() && entry.name === "server.js") {
                matches.push(fullPath);
            }
        }
    }

    await walk(standaloneDir, 0);
    matches.sort((a, b) => a.length - b.length);
    if (matches[0]) return matches[0];

    throw new Error(`未找到 Next.js standalone server.js：${standaloneDir}`);
}

function toPosixPath(filePath) {
    return filePath.split(path.sep).join("/");
}

async function prepareDesktopResources() {
    const standaloneDir = path.join(webDir, ".next", "standalone");
    if (!(await exists(standaloneDir))) {
        throw new Error("缺少 .next/standalone，请先完成 Next.js build。");
    }

    await fs.rm(desktopBuildDir, { recursive: true, force: true });
    await fs.mkdir(desktopBinDir, { recursive: true });

    const serverName = isWin ? "server.exe" : "server";
    const serverOutput = path.join(desktopBinDir, serverName);
    if (!skipBackendBuild) {
        run("go", ["build", "-o", serverOutput, "."], {
            cwd: repoDir,
            env: {
                CGO_ENABLED: "0",
                GOOS: isWin ? "windows" : "darwin",
                GOARCH: goArch,
            },
        });
    }

    await fs.cp(standaloneDir, desktopWebDir, { recursive: true, dereference: true });

    const standaloneServer = await findStandaloneServer(standaloneDir);
    const standaloneServerRelative = path.relative(standaloneDir, standaloneServer);
    const standaloneServerDirRelative = path.dirname(standaloneServerRelative);
    const staticSource = path.join(webDir, ".next", "static");
    const staticTarget = path.join(desktopWebDir, standaloneServerDirRelative, ".next", "static");
    await fs.rm(staticTarget, { recursive: true, force: true });
    await fs.cp(staticSource, staticTarget, { recursive: true, dereference: true });

    const publicSource = path.join(webDir, "public");
    const publicTarget = path.join(desktopWebDir, standaloneServerDirRelative, "public");
    if (await exists(publicSource)) {
        await fs.rm(publicTarget, { recursive: true, force: true });
        await fs.cp(publicSource, publicTarget, { recursive: true, dereference: true });
    }

    const manifest = {
        webServer: toPosixPath(path.join("web", standaloneServerRelative)),
        backendServer: toPosixPath(path.join("bin", serverName)),
        frontendPort: 3130,
        backendPort: 8180,
    };
    await fs.writeFile(path.join(desktopBuildDir, "manifest.json"), `${JSON.stringify(manifest, null, 4)}\n`);
}

async function prepareElectronAppPackage() {
    await fs.mkdir(path.join(desktopAppDir, "node_modules"), { recursive: true });
}

async function cleanTargetRelease() {
    const productName = "眨眼之间工作台";
    const version = JSON.parse(await fs.readFile(path.join(desktopAppDir, "package.json"), "utf8")).version;
    await fs.mkdir(releaseDir, { recursive: true });
    await fs.rm(path.join(releaseDir, "builder-debug.yml"), { recursive: true, force: true });

    if (isWin) {
        await fs.rm(path.join(releaseDir, "win-unpacked"), { recursive: true, force: true });
        await fs.rm(path.join(releaseDir, `${productName}-${version}-Setup-x64.exe`), { recursive: true, force: true });
        await fs.rm(path.join(releaseDir, `${productName}-${version}-Setup-x64.exe.blockmap`), { recursive: true, force: true });
        return;
    }

    await fs.rm(path.join(releaseDir, "mac"), { recursive: true, force: true });
    await fs.rm(path.join(releaseDir, `mac-${arch}`), { recursive: true, force: true });
    await fs.rm(path.join(releaseDir, `${productName}-${version}-${arch}.dmg`), { recursive: true, force: true });
    await fs.rm(path.join(releaseDir, `${productName}-${version}-${arch}.dmg.blockmap`), { recursive: true, force: true });
}

async function createMacDmg() {
    const productName = "眨眼之间工作台";
    const version = JSON.parse(await fs.readFile(path.join(desktopAppDir, "package.json"), "utf8")).version;
    const appParentDir = path.join(releaseDir, `mac-${arch}`);
    const appPath = path.join(appParentDir, `${productName}.app`);
    const dmgPath = path.join(releaseDir, `${productName}-${version}-${arch}.dmg`);

    if (!(await exists(appPath))) {
        throw new Error(`缺少 macOS 应用目录：${appPath}`);
    }

    run("hdiutil", ["create", "-volname", productName, "-srcfolder", appParentDir, "-ov", "-format", "UDZO", dmgPath], { cwd: webDir });
}

async function main() {
    if (!skipWebBuild) {
        run("npm", ["run", "build"], { cwd: webDir });
    }

    await prepareDesktopResources();

    if (prepareOnly) {
        console.log(`桌面运行资源已生成：${path.relative(webDir, desktopBuildDir)}`);
        return;
    }

    await cleanTargetRelease();
    await prepareElectronAppPackage();
    const builderTarget = dirOnly || isMac ? "dir" : "nsis";
    const builderArgs = ["--yes", `electron-builder@${ELECTRON_BUILDER_VERSION}`, "--projectDir", "desktop/app", isWin ? "--win" : "--mac", builderTarget, `--${arch}`];
    run("npx", builderArgs, { cwd: webDir });

    if (isMac && !dirOnly) {
        await createMacDmg();
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
