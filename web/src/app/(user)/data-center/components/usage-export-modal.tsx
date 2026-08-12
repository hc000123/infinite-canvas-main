"use client";

import { Alert, DatePicker, Form, Input, Modal } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect } from "react";

import type { AIUsageExportQuery } from "@/services/api/usage";
import { dataCenterExportRange } from "../data-center-view";

type ExportForm = { range: [Dayjs, Dayjs]; user: string; model: string };

type Props = {
    open: boolean;
    loading: boolean;
    initialUser: string;
    initialModel: string;
    onCancel: () => void;
    onSubmit: (query: AIUsageExportQuery) => Promise<unknown>;
};

export function UsageExportModal({ open, loading, initialUser, initialModel, onCancel, onSubmit }: Props) {
    const [form] = Form.useForm<ExportForm>();
    useEffect(() => {
        if (!open) return;
        const range = dataCenterExportRange();
        form.setFieldsValue({ range: [dayjs(range.startAt.slice(0, 10)), dayjs(range.endAt.slice(0, 10)).subtract(1, "day")], user: initialUser, model: initialModel });
    }, [form, initialModel, initialUser, open]);

    const submit = async () => {
        const values = await form.validateFields();
        const [start, end] = values.range;
        if (end.add(1, "day").isAfter(start.add(1, "year"), "day")) {
            form.setFields([{ name: "range", errors: ["单次导出范围不能超过一年"] }]);
            return;
        }
        try {
            await onSubmit({
                startAt: `${start.format("YYYY-MM-DD")}T00:00:00+08:00`,
                endAt: `${end.add(1, "day").format("YYYY-MM-DD")}T00:00:00+08:00`,
                user: values.user?.trim() || undefined,
                model: values.model?.trim() || undefined,
            });
        } catch {
            // 下载错误由页面 hook 统一提示，弹窗保持打开便于调整条件。
        }
    };

    return (
        <Modal title="导出用量报表" open={open} confirmLoading={loading} okText="导出 XLSX" cancelText="取消" onCancel={onCancel} onOk={() => void submit()} destroyOnHidden>
            <Alert className="mb-4" type="info" showIcon message="实际采用秒数在下载后的 Excel 中填写，不会回写平台。" />
            <Form form={form} layout="vertical" requiredMark={false}>
                <Form.Item name="range" label="统计日期" rules={[{ required: true, message: "请选择统计日期" }]}>
                    <DatePicker.RangePicker allowClear={false} style={{ width: "100%" }} />
                </Form.Item>
                <Form.Item name="user" label="成员">
                    <Input allowClear placeholder="全部成员，或填写用户名、昵称、用户 ID" />
                </Form.Item>
                <Form.Item name="model" label="模型">
                    <Input allowClear placeholder="全部模型" />
                </Form.Item>
            </Form>
        </Modal>
    );
}
