import { spawn } from "node:child_process";

let stopping = false;
const children = [];

function start(command, args, options = {}) {
    const child = spawn(command, args, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        stdio: "inherit",
    });
    children.push(child);
    child.on("exit", (code, signal) => {
        if (stopping) return;
        const exitCode = typeof code === "number" ? code : signal ? 1 : 0;
        stop(exitCode);
    });
}

function stop(exitCode = 0) {
    if (stopping) return;
    stopping = true;
    for (const child of children) {
        if (!child.killed) child.kill("SIGTERM");
    }
    setTimeout(() => {
        for (const child of children) {
            if (!child.killed) child.kill("SIGKILL");
        }
        process.exit(exitCode);
    }, 2500).unref();
}

process.on("SIGINT", () => stop(130));
process.on("SIGTERM", () => stop(143));

start("/app/server", [], { env: { PORT: "8080" } });
start("npm", ["run", "start"], { cwd: "/app/web", env: { HOSTNAME: "0.0.0.0", PORT: "3000" } });
