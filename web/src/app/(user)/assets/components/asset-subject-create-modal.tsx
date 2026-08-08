"use client";

import { useEffect } from "react";
import { Form, Input, Modal, Select } from "antd";

import type { AssetCategory } from "@/stores/use-asset-store";
import { assetCategoryLabel } from "../asset-subjects";

type SubjectFormValues = { name: string; projectId: string; note?: string };

export function AssetSubjectCreateModal({ category, initialProjectId, open, projects, onCancel, onCreate }: { category: AssetCategory | null; initialProjectId: string; open: boolean; projects: Array<{ id: string; title: string }>; onCancel: () => void; onCreate: (values: SubjectFormValues) => void }) {
    const [form] = Form.useForm<SubjectFormValues>();

    useEffect(() => {
        if (!open) return;
        form.setFieldsValue({ name: "", projectId: initialProjectId, note: "" });
    }, [form, initialProjectId, open]);

    return (
        <Modal
            open={open}
            title={`新建${category ? assetCategoryLabel(category) : "资产主体"}`}
            okText="创建并进入工作台"
            cancelText="取消"
            onCancel={onCancel}
            onOk={() => void form.validateFields().then(onCreate)}
            destroyOnHidden
        >
            <Form form={form} layout="vertical" className="pt-3">
                <Form.Item label="名称" name="name" rules={[{ required: true, whitespace: true, message: "请输入主体名称" }]}>
                    <Input autoFocus maxLength={60} placeholder={category === "character" ? "例如：小也" : "输入资产主体名称"} />
                </Form.Item>
                <Form.Item label="所属项目" name="projectId" rules={[{ required: true, message: "请选择所属项目" }]}>
                    <Select showSearch optionFilterProp="label" options={projects.map((project) => ({ label: project.title || "未命名项目", value: project.id }))} placeholder="选择项目" />
                </Form.Item>
                <Form.Item label="备注" name="note">
                    <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} maxLength={500} placeholder="可选，记录角色身份、场景用途或设计约束" />
                </Form.Item>
            </Form>
        </Modal>
    );
}
