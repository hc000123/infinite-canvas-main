import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import ts from "typescript";

test("project cache queue store is valid TypeScript", async () => {
    const source = await readFile(new URL("./use-project-cache-queue-store.ts", import.meta.url), "utf8");
    const result = ts.transpileModule(source, {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
        reportDiagnostics: true,
    });

    assert.deepEqual(
        result.diagnostics?.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")),
        [],
    );
});
