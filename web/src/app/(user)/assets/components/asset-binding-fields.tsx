"use client";

import { Form, Input, Radio, Segmented, Select } from "antd";

import type { AssetCategory, AssetSubject } from "@/stores/use-asset-store";
import { episodeProductionName, type ScriptEpisode } from "../../canvas/utils/script-management";
import type { CreativeProject } from "../../projects/creative-projects";
import { assetCategoryLabel, defaultAssetVariantName } from "../asset-subjects";

export const NEW_ASSET_SUBJECT = "__new_asset_subject__";

export function AssetBindingFields({ episodes, projects, subjects, lockedProjectId, lockedEpisodeId }: { episodes: ScriptEpisode[]; projects: CreativeProject[]; subjects: AssetSubject[]; lockedProjectId?: string; lockedEpisodeId?: string }) {
    const form = Form.useFormInstance();
    const projectId = Form.useWatch("projectId", form) || "";
    const category = Form.useWatch("category", form) as AssetCategory | undefined;
    const subjectId = Form.useWatch("subjectId", form) || "";
    const allEpisodes = Form.useWatch("allEpisodes", form) !== false;
    const projectEpisodes = episodes.filter((episode) => episode.projectId === projectId).sort((a, b) => a.order - b.order);
    const projectSubjects = subjects.filter((subject) => subject.projectId === projectId && subject.category === category);

    return (
        <section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-4">
            <div className="mb-4 text-sm font-semibold text-[var(--studio-text-primary)]">资产归属</div>
            <Form.Item name="category" label="资产分类" rules={[{ required: true, message: "请选择资产分类" }]}>
                <Segmented
                    block
                    options={(["character", "scene", "prop", "other"] as AssetCategory[]).map((value) => ({ label: assetCategoryLabel(value), value }))}
                    onChange={(value) => form.setFieldsValue({ category: value as AssetCategory, subjectId: undefined, subjectName: "", variantName: defaultAssetVariantName(value as AssetCategory) })}
                />
            </Form.Item>
            <div className="grid gap-4 sm:grid-cols-2">
                <Form.Item name="projectId" label="所属项目" rules={[{ required: true, message: "请选择所属项目" }]}>
                    <Select
                        disabled={Boolean(lockedProjectId)}
                        showSearch
                        optionFilterProp="label"
                        placeholder="选择项目"
                        options={projects.map((project) => ({ label: project.title, value: project.id }))}
                        onChange={() => form.setFieldsValue({ category: undefined, subjectId: undefined, subjectName: "", episodeIds: [] })}
                    />
                </Form.Item>
                <Form.Item name="subjectId" label="绑定资产主体" rules={[{ required: true, message: "请选择或新建资产主体" }]}>
                    <Select
                        disabled={!projectId || !category}
                        placeholder="选择已有主体"
                        options={[...projectSubjects.map((subject) => ({ label: `${subject.code} · ${subject.name}`, value: subject.id })), { label: "+ 新建资产主体", value: NEW_ASSET_SUBJECT }]}
                    />
                </Form.Item>
                {subjectId === NEW_ASSET_SUBJECT ? (
                    <Form.Item name="subjectName" label="新主体名称" rules={[{ required: true, message: "请输入主体名称" }]}>
                        <Input placeholder={category === "character" ? "例如：林默" : category === "scene" ? "例如：旧教学楼" : "例如：红色纸飞机"} />
                    </Form.Item>
                ) : null}
                <Form.Item name="variantName" label="图片形态 / 马甲" rules={[{ required: true, message: "请输入图片形态名称" }]}>
                    <Input placeholder={category === "character" ? "基础形象 / 校服 / 受伤状态" : "基础状态 / 夜景 / 损坏状态"} />
                </Form.Item>
                <Form.Item name="allEpisodes" label="适用范围">
                    <Radio.Group
                        block
                        optionType="button"
                        buttonStyle="solid"
                        options={[{ label: "全剧通用", value: true }, { label: "指定集数", value: false }]}
                        onChange={(event) => (event.target.value ? form.setFieldValue("episodeIds", []) : lockedEpisodeId ? form.setFieldValue("episodeIds", [lockedEpisodeId]) : undefined)}
                    />
                </Form.Item>
            </div>
            {!allEpisodes ? (
                <Form.Item name="episodeIds" label="适用集数" rules={[{ required: true, type: "array", min: 1, message: "请选择至少一个适用集数" }]}>
                    <Select
                        mode="multiple"
                        showSearch
                        optionFilterProp="label"
                        placeholder="选择一个或多个已有分集"
                        options={projectEpisodes.map((episode) => ({ disabled: episode.id === lockedEpisodeId, label: episodeProductionName(episode.code || `EP${String(episode.order).padStart(2, "0")}`, episode.title), value: episode.id }))}
                    />
                </Form.Item>
            ) : null}
        </section>
    );
}
