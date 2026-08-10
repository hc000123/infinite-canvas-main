"use client";

import { useEffect } from "react";
import { Checkbox, Form, Input, Modal, Segmented, Select } from "antd";

import type { Asset, AssetCategory, AssetSubject, AssetVariant } from "@/stores/use-asset-store";
import { assetCategoryLabel } from "../asset-subjects";

export type AssetOrganizeValues =
    | { mode: "existing"; subjectId: string; variantId: string; setCurrent: boolean }
    | { mode: "new"; category: AssetCategory; name: string };

type FormValues = { mode: "existing" | "new"; subjectId?: string; variantId?: string; setCurrent?: boolean; category?: AssetCategory; name?: string };

export function AssetOrganizeModal({ asset, projectId, subjects, variants, open, onCancel, onSubmit }: { asset: Asset | null; projectId: string; subjects: AssetSubject[]; variants: AssetVariant[]; open: boolean; onCancel: () => void; onSubmit: (values: AssetOrganizeValues) => void }) {
    const [form] = Form.useForm<FormValues>();
    const mode = Form.useWatch("mode", form) || "existing";
    const subjectId = Form.useWatch("subjectId", form);
    const projectSubjects = subjects.filter((subject) => subject.projectId === projectId);
    const subjectVariants = variants.filter((variant) => variant.subjectId === subjectId).sort((left, right) => left.createdAt.localeCompare(right.createdAt));

    useEffect(() => {
        if (!open) return;
        const firstSubject = projectSubjects[0];
        const firstVariant = variants.filter((variant) => variant.subjectId === firstSubject?.id).sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
        form.setFieldsValue({ mode: projectSubjects.length ? "existing" : "new", subjectId: firstSubject?.id, variantId: firstVariant?.id, setCurrent: asset?.kind === "image", category: "character", name: asset?.title || "" });
    }, [asset, form, open, projectSubjects.length, variants]);

    const changeSubject = (nextSubjectId: string) => {
        const firstVariant = variants.filter((variant) => variant.subjectId === nextSubjectId).sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
        form.setFieldsValue({ subjectId: nextSubjectId, variantId: firstVariant?.id });
    };
    const submit = async () => {
        const values = await form.validateFields();
        if (values.mode === "new") onSubmit({ mode: "new", category: values.category!, name: values.name!.trim() });
        else onSubmit({ mode: "existing", subjectId: values.subjectId!, variantId: values.variantId!, setCurrent: asset?.kind === "image" && values.setCurrent !== false });
    };

    return (
        <Modal rootClassName="studio-modal" title={`整理「${asset?.title || "未命名素材"}」`} open={open} okText="完成整理" cancelText="取消" destroyOnHidden onCancel={onCancel} onOk={() => void submit()}>
            <Form form={form} layout="vertical" initialValues={{ mode: "existing", setCurrent: true, category: "character" }}>
                <Form.Item name="mode"><Segmented block options={[{ label: "归入已有主体", value: "existing" }, { label: "新建主体", value: "new" }]} /></Form.Item>
                {mode === "existing" ? (
                    <>
                        <Form.Item name="subjectId" label="资产主体" rules={[{ required: true, message: "请选择资产主体" }]}>
                            <Select placeholder="选择主体" options={projectSubjects.map((subject) => ({ value: subject.id, label: `${subject.name} · ${assetCategoryLabel(subject.category)}` }))} onChange={changeSubject} />
                        </Form.Item>
                        <Form.Item name="variantId" label="形态" rules={[{ required: true, message: "请选择形态" }]}>
                            <Select placeholder="选择形态" options={subjectVariants.map((variant) => ({ value: variant.id, label: variant.name }))} />
                        </Form.Item>
                        {asset?.kind === "image" ? <Form.Item name="setCurrent" valuePropName="checked"><Checkbox>同时设为这个形态的当前版本</Checkbox></Form.Item> : <p className="text-sm text-[var(--studio-text-muted)]">该素材会作为关联资料归入主体，不会替换当前图片版本。</p>}
                    </>
                ) : (
                    <>
                        <Form.Item name="category" label="主体类型" rules={[{ required: true }]}><Select options={(["character", "scene", "prop", "blocking", "other"] as AssetCategory[]).map((category) => ({ value: category, label: assetCategoryLabel(category) }))} /></Form.Item>
                        <Form.Item name="name" label="主体名称" rules={[{ required: true, whitespace: true, message: "请输入主体名称" }]}><Input maxLength={60} placeholder="例如：林默、旧仓库、铜钥匙" /></Form.Item>
                        <p className="text-sm text-[var(--studio-text-muted)]">将创建主体和基础形态，并把当前素材归入其中。</p>
                    </>
                )}
            </Form>
        </Modal>
    );
}
