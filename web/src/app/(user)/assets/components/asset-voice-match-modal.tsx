"use client";

import { useRef } from "react";
import { Button, Empty, Modal, Select } from "antd";
import { Upload } from "lucide-react";
import type { Asset, AssetSubject } from "@/stores/use-asset-store";

export function AssetVoiceMatchModal({ audios, open, subject, uploading, onCancel, onSelect, onUpload }: { audios: Array<Extract<Asset, { kind: "audio" }>>; open: boolean; subject: AssetSubject | null; uploading: boolean; onCancel: () => void; onSelect: (assetId: string) => void; onUpload: (file: File) => void }) {
    const inputRef = useRef<HTMLInputElement>(null);
    return <Modal open={open} title={`匹配声音 · ${subject?.name || "角色"}`} footer={null} onCancel={onCancel} destroyOnHidden>
        <p className="mb-3 text-sm leading-6 text-[var(--studio-text-secondary)]">选择或上传一段当前项目的角色声音。此操作只建立绑定，不会自动生成音频。</p>
        {audios.length ? <Select className="w-full" showSearch optionFilterProp="label" value={subject?.voiceAssetId} placeholder="选择已有音频" options={audios.map((asset) => ({ label: asset.title, value: asset.id }))} onChange={onSelect} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前项目还没有音频素材" />}
        <Button className="mt-3 w-full" icon={<Upload className="size-4" />} loading={uploading} onClick={() => inputRef.current?.click()}>上传角色声音</Button>
        <input ref={inputRef} hidden type="file" accept="audio/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = ""; }} />
    </Modal>;
}
