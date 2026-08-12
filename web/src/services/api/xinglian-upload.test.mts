import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const moduleURL = new URL("./xinglian-upload.ts", import.meta.url);

test("uploads a local Xinglian reference through sign, PUT and complete", async () => {
    assert.equal(existsSync(fileURLToPath(moduleURL)), true, "missing Xinglian direct-upload client");
    const { uploadXinglianBlob } = await import(moduleURL.href);
    const calls: Array<{ step: string; value: unknown }> = [];
    const blob = new Blob(["image-bytes"], { type: "image/png" });

    const url = await uploadXinglianBlob(
        { model: "sd2.5-720p-ax2", filename: "人物.png", type: "image", blob },
        {
            sign: async (input: unknown) => {
                calls.push({ step: "sign", value: input });
                return { method: "PUT", uploadUrl: "https://bucket.example.com/signed", publicUrl: "https://files.example.com/image.png", key: "users/1/image.png", headers: { "Content-Type": "image/png" } };
            },
            put: async (uploadUrl: string, init: RequestInit) => {
                calls.push({ step: "put", value: { uploadUrl, init } });
                return { ok: true, status: 200 };
            },
            complete: async (input: unknown) => {
                calls.push({ step: "complete", value: input });
                return { recorded: true, key: "users/1/image.png", url: "https://files.example.com/image.png" };
            },
        },
    );

    assert.equal(url, "https://files.example.com/image.png");
    assert.deepEqual(calls.map((item) => item.step), ["sign", "put", "complete"]);
    assert.deepEqual(calls[0]?.value, { model: "sd2.5-720p-ax2", filename: "人物.png", contentType: "image/png", size: 11, type: "image" });
    const put = calls[1]?.value as { uploadUrl: string; init: RequestInit };
    assert.equal(put.uploadUrl, "https://bucket.example.com/signed");
    assert.equal(put.init.method, "PUT");
    assert.equal(put.init.body, blob);
    assert.deepEqual(calls[2]?.value, { model: "sd2.5-720p-ax2", key: "users/1/image.png", filename: "人物.png", type: "image" });
});

test("does not register a Xinglian upload when OSS PUT fails", async () => {
    assert.equal(existsSync(fileURLToPath(moduleURL)), true, "missing Xinglian direct-upload client");
    const { uploadXinglianBlob } = await import(moduleURL.href);
    let completed = false;
    await assert.rejects(
        uploadXinglianBlob(
            { model: "sd2.5-720p-ax2", filename: "人物.png", type: "image", blob: new Blob(["x"], { type: "image/png" }) },
            {
                sign: async () => ({ method: "PUT", uploadUrl: "https://bucket.example.com/signed", publicUrl: "https://files.example.com/image.png", key: "users/1/image.png", headers: {} }),
                put: async () => ({ ok: false, status: 403 }),
                complete: async () => {
                    completed = true;
                    return { recorded: true, key: "", url: "" };
                },
            },
        ),
        /OSS 上传失败：HTTP 403/,
    );
    assert.equal(completed, false);
});
