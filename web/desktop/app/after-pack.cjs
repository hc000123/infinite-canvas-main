const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
    const projectDir = context.packager.projectDir;
    const source = path.resolve(projectDir, "../../build/desktop/web/node_modules");
    if (!fs.existsSync(source)) return;

    const productName = context.packager.appInfo.productFilename;
    const resourcesDir = context.electronPlatformName === "darwin" ? path.join(context.appOutDir, `${productName}.app`, "Contents", "Resources") : path.join(context.appOutDir, "resources");
    const target = path.join(resourcesDir, "web", "node_modules");

    fs.rmSync(target, { recursive: true, force: true });
    fs.cpSync(source, target, { recursive: true, dereference: true });
};
