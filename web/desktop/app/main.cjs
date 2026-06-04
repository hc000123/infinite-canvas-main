const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { app, BrowserWindow, Menu, dialog, shell } = require("electron");

const childProcesses = new Set();
let mainWindow = null;
let logFilePath = "";

function logLine(message) {
    if (!logFilePath) return;
    fs.appendFileSync(logFilePath, `[${new Date().toISOString()}] ${message}\n`);
}

function resourcePath(...segments) {
    const root = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, "..", "..", "build", "desktop");
    return path.join(root, ...segments);
}

function readManifest() {
    const manifestPath = resourcePath("manifest.json");
    if (!fs.existsSync(manifestPath)) {
        throw new Error(`缺少桌面运行资源，请先执行 npm run desktop:prepare:win。\n${manifestPath}`);
    }
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function readOrCreateSecret(filePath) {
    try {
        const existing = fs.readFileSync(filePath, "utf8").trim();
        if (existing) return existing;
    } catch {
        // The file is created on first desktop launch.
    }
    const secret = crypto.randomBytes(32).toString("base64url");
    fs.writeFileSync(filePath, secret, { mode: 0o600 });
    return secret;
}

function isPortFree(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once("error", () => resolve(false));
        server.once("listening", () => {
            server.close(() => resolve(true));
        });
        server.listen(port, "127.0.0.1");
    });
}

async function findFreePort(preferredPort) {
    for (let port = preferredPort; port < preferredPort + 50; port += 1) {
        if (await isPortFree(port)) return port;
    }
    throw new Error(`未找到可用端口：${preferredPort}-${preferredPort + 49}`);
}

function waitForUrl(url, timeoutMs) {
    const startedAt = Date.now();

    return new Promise((resolve, reject) => {
        const retry = () => {
            const request = http.get(url, (response) => {
                response.resume();
                if (response.statusCode && response.statusCode < 500) {
                    resolve();
                    return;
                }
                schedule();
            });

            request.once("error", schedule);
            request.setTimeout(1000, () => {
                request.destroy();
                schedule();
            });
        };

        const schedule = () => {
            if (Date.now() - startedAt > timeoutMs) {
                reject(new Error(`服务启动超时：${url}`));
                return;
            }
            setTimeout(retry, 300);
        };

        retry();
    });
}

function spawnManaged(command, args, options) {
    const child = spawn(command, args, {
        ...options,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
    });
    childProcesses.add(child);
    logLine(`spawn ${command} ${args.join(" ")}`);
    child.stdout.on("data", (chunk) => logLine(`${path.basename(command)} stdout: ${chunk.toString().trimEnd()}`));
    child.stderr.on("data", (chunk) => logLine(`${path.basename(command)} stderr: ${chunk.toString().trimEnd()}`));
    child.once("exit", (code, signal) => {
        logLine(`exit ${command} code=${code} signal=${signal}`);
        childProcesses.delete(child);
    });
    return child;
}

function killChild(child) {
    if (!child || child.killed) return;
    if (process.platform === "win32" && child.pid) {
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
        return;
    }
    child.kill();
}

function stopChildren() {
    for (const child of childProcesses) {
        killChild(child);
    }
    childProcesses.clear();
}

async function startServices() {
    const manifest = readManifest();
    const frontendPreferredPort = Number(process.env.INFINITE_CANVAS_FRONTEND_PORT || manifest.frontendPort || 3130);
    const backendPreferredPort = Number(process.env.INFINITE_CANVAS_BACKEND_PORT || manifest.backendPort || 8180);
    const frontendPort = await findFreePort(frontendPreferredPort);
    const backendPort = await findFreePort(backendPreferredPort);
    const frontendUrl = `http://127.0.0.1:${frontendPort}`;
    const backendUrl = `http://127.0.0.1:${backendPort}`;

    const userDataDir = app.getPath("userData");
    logFilePath = path.join(userDataDir, "desktop.log");
    fs.writeFileSync(logFilePath, `[${new Date().toISOString()}] blink-workbench desktop starting\n`);
    const dataDir = path.join(userDataDir, "data");
    const promptDir = path.join(dataDir, "prompts");
    const publicAssetDir = path.join(dataDir, "public-assets");
    ensureDir(promptDir);
    ensureDir(publicAssetDir);

    const backendPath = resourcePath(manifest.backendServer);
    const webServerPath = resourcePath(manifest.webServer);
    if (!fs.existsSync(backendPath)) throw new Error(`缺少后端可执行文件：${backendPath}`);
    if (!fs.existsSync(webServerPath)) throw new Error(`缺少 Next.js standalone server：${webServerPath}`);

    spawnManaged(backendPath, [], {
        cwd: userDataDir,
        env: {
            ...process.env,
            PORT: String(backendPort),
            DATABASE_DSN: path.join(dataDir, "blink-workbench.db"),
            PUBLIC_ASSET_DIR: publicAssetDir,
            PROMPT_DATA_DIR: promptDir,
            JWT_SECRET: process.env.JWT_SECRET || readOrCreateSecret(path.join(userDataDir, "jwt-secret")),
        },
    });

    spawnManaged(process.execPath, [webServerPath], {
        cwd: path.dirname(webServerPath),
        env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: "1",
            NODE_ENV: "production",
            HOSTNAME: "127.0.0.1",
            PORT: String(frontendPort),
            API_BASE_URL: backendUrl,
        },
    });

    try {
        await waitForUrl(`${backendUrl}/api/settings`, 30000);
        await waitForUrl(frontendUrl, 45000);
    } catch (error) {
        throw new Error(`${error instanceof Error ? error.message : String(error)}\n启动日志：${logFilePath}`);
    }

    return frontendUrl;
}

function createWindow(url) {
    Menu.setApplicationMenu(null);

    mainWindow = new BrowserWindow({
        width: 1440,
        height: 960,
        minWidth: 1100,
        minHeight: 720,
        title: "眨眼之间",
        backgroundColor: "#f6f7fb",
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
        shell.openExternal(targetUrl);
        return { action: "deny" };
    });

    mainWindow.loadURL(url);
}

app.whenReady().then(async () => {
    try {
        const frontendUrl = await startServices();
        createWindow(frontendUrl);
    } catch (error) {
        dialog.showErrorBox("眨眼之间启动失败", error instanceof Error ? error.message : String(error));
        app.quit();
    }
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && mainWindow) {
        mainWindow.show();
    }
});

app.on("before-quit", stopChildren);
app.on("window-all-closed", () => {
    app.quit();
});
