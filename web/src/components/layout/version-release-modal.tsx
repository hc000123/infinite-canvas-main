"use client";

import type { CSSProperties } from "react";
import { Modal, Tag, Timeline } from "antd";
import { useVersionCheck } from "@/hooks/use-version-check";
import { APP_VERSION } from "@/constant/env";

function getTagToneClass(type: string) {
    if (type === "新增") return "studio-semantic-success";
    if (type === "修复") return "studio-semantic-danger";
    if (type === "调整") return "studio-semantic-info";
    if (type === "文档") return "studio-semantic-neutral";
    return "studio-semantic-neutral";
}

function getReleaseTitle(version: string) {
    return version === "Unreleased" ? "未发布" : version;
}

type VersionReleaseModalProps = {
    className?: string;
    style?: CSSProperties;
};

export function VersionReleaseModal({ className, style }: VersionReleaseModalProps) {
    const { open, setOpen, openReleaseModal, latestVersion, releases, checking, hasNewVersion, checkLatestRelease } = useVersionCheck();

    return (
        <>
            <button
                type="button"
                className={
                    className ||
                    "inline-flex h-8 min-w-[52px] shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent px-1.5 text-center text-xs font-medium leading-none text-[var(--studio-text-muted)] transition hover:border-[var(--studio-border-subtle)] hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)]"
                }
                style={style}
                onClick={openReleaseModal}
                title="查看版本更新"
            >
                <span className="relative inline-flex max-w-full items-center whitespace-nowrap">
                    {APP_VERSION}
                    {hasNewVersion ? <span className="absolute -right-1.5 -top-1 size-1.5 rounded-full bg-[var(--studio-success)] ring-2 ring-[var(--studio-elevated-bg)]" /> : null}
                </span>
            </button>
            <Modal rootClassName="studio-modal" title="版本更新" open={open} width={680} centered footer={null} onCancel={() => setOpen(false)}>
                <div className="mb-5 grid grid-cols-2 gap-3">
                    <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3">
                        <div className="text-xs text-[var(--studio-text-muted)]">当前版本</div>
                        <div className="mt-1 text-base font-semibold text-[var(--studio-text-primary)]">{APP_VERSION}</div>
                    </div>
                    <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3">
                        <div className="flex items-center justify-between gap-3">
                            <div className="text-xs text-[var(--studio-text-muted)]">最新版本</div>
                            <button
                                type="button"
                                className="cursor-pointer rounded-md bg-transparent px-1 py-0.5 text-[11px] font-normal text-[var(--studio-text-muted)] underline-offset-2 transition hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)] hover:no-underline"
                                onClick={() => void checkLatestRelease(true)}
                            >
                                {checking ? "检查中..." : "检查更新"}
                            </button>
                        </div>
                        <div className="mt-1 text-base font-semibold text-[var(--studio-text-primary)]">{latestVersion}</div>
                    </div>
                </div>
                <div className="max-h-[56vh] overflow-y-auto pr-2">
                    <Timeline
                        items={releases.map((release) => ({
                            content: (
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-semibold text-[var(--studio-text-primary)]">{getReleaseTitle(release.version)}</span>
                                        <span className="text-xs text-[var(--studio-text-muted)]">{release.date}</span>
                                        <div className="flex min-w-0 items-center gap-1.5">
                                            {release.version === latestVersion ? <Tag className="m-0 studio-semantic-success studio-semantic-tag">最新</Tag> : null}
                                            {release.version === APP_VERSION ? <Tag className="m-0">当前</Tag> : null}
                                        </div>
                                    </div>
                                    <div className="mt-2 space-y-1.5">
                                        {release.items.map((item, index) => (
                                            <div key={`${release.version}-${index}`} className="flex items-start gap-2 text-sm leading-6 text-[var(--studio-text-secondary)]">
                                                <Tag className={`m-0 mt-0.5 shrink-0 whitespace-nowrap studio-semantic-tag ${getTagToneClass(item.type)}`}>
                                                    {item.type}
                                                </Tag>
                                                <span className="min-w-0 flex-1">{item.content}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ),
                        }))}
                    />
                </div>
            </Modal>
        </>
    );
}
