import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./workflow-registry.ts", import.meta.url), "utf8");
const editorSource = await readFile(new URL("../../app/(user)/projects/[id]/workflows/components/workflow-version-editor.tsx", import.meta.url), "utf8");

test("workflow registry client uses exact authenticated routes and zero-byte lifecycle calls", () => {
    for (const route of [
        '"/api/v1/workflows"',
        '`/api/v1/workflows/${id(workflowId)}`',
        '`/api/v1/workflow-versions/${id(versionId)}`',
        '`/api/v1/workflow-versions/${id(versionId)}/validate`',
        '`/api/v1/workflow-versions/${id(versionId)}/preview`',
        '`/api/v1/workflow-versions/${id(versionId)}/publish`',
        '"/api/v1/workflow-executions/preflight"',
        '`/api/v1/workflow-executions/${id(executionId)}/confirm`',
        '`/api/v1/workflow-executions/${id(executionId)}/continue`',
        '`/api/v1/workflow-executions/${id(executionId)}/cancel`',
    ]) assert.ok(source.includes(route), `missing route ${route}`);
    assert.match(source, /apiPostEmpty<WorkflowValidationResult>/);
    assert.match(source, /apiPostEmpty<WorkflowVersionDetail>/);
    assert.match(source, /apiPostEmpty<WorkflowExecutionResponse>/);
    assert.match(source, /useUserStore\.getState\(\)\.token/);
});

test("workflow DTOs expose safe runtime coordinates without persistence snapshots", () => {
    for (const typeName of ["WorkflowPackage", "WorkflowRegistryItem", "WorkflowRoutePreview", "WorkflowExecutionResponse", "WorkflowNodeExecution"]) {
        assert.match(source, new RegExp(`export type ${typeName}\\b`));
    }
    for (const field of ["packageJSON", "routePreviewJSON", "inputArtifactRefsJSON", "manualSelectionsJSON", "parametersJSON", "outputArtifactRefsJSON", "requestHash"]) {
        assert.doesNotMatch(source, new RegExp(`\\b${field}\\??:`));
    }
});

test("workflow editor renders adapter nodes as locked system conversion rules", () => {
    assert.match(editorSource, /node\.executorType === "adapter"/);
    assert.match(editorSource, /系统转换规则/);
    assert.match(editorSource, /固定步骤，不可替换或删除/);
});
