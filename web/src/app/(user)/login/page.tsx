"use client";

import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { App, Button, Form, Input, Segmented } from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { fetchCurrentUser } from "@/services/api/auth";
import { useConfigStore } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

type LoginFormValues = {
    username: string;
    password: string;
    confirmPassword?: string;
};

export default function LoginPage() {
    return (
        <Suspense fallback={null}>
            <LoginContent />
        </Suspense>
    );
}

function LoginContent() {
    const { message } = App.useApp();
    const router = useRouter();
    const searchParams = useSearchParams();
    const login = useUserStore((state) => state.login);
    const register = useUserStore((state) => state.register);
    const setSession = useUserStore((state) => state.setSession);
    const hydrateUser = useUserStore((state) => state.hydrateUser);
    const user = useUserStore((state) => state.user);
    const isReady = useUserStore((state) => state.isReady);
    const isLoading = useUserStore((state) => state.isLoading);
    const allowRegister = useConfigStore((state) => state.publicSettings?.auth?.allowRegister !== false);
    const [mode, setMode] = useState<"login" | "register">("login");
    const redirect = searchParams.get("redirect") || "/projects";
    const isAdminRedirect = redirect.startsWith("/admin");

    useEffect(() => {
        const token = searchParams.get("token");
        const error = searchParams.get("error");
        if (error) message.error(error);
        if (!token) return;
        void fetchCurrentUser(token).then((user) => {
            setSession(token, user);
            message.success("登录成功");
            router.replace(redirect.startsWith("/") ? redirect : "/");
        });
    }, [message, redirect, router, searchParams, setSession]);

    useEffect(() => {
        if (searchParams.get("token") || searchParams.get("error")) return;
        if (isAdminRedirect) return;
        if (process.env.NODE_ENV !== "development" || process.env.NEXT_PUBLIC_DEV_AUTO_LOGIN === "false") return;
        void hydrateUser();
    }, [hydrateUser, isAdminRedirect, searchParams]);

    useEffect(() => {
        if (!isReady || !user) return;
        if (isAdminRedirect && user.role !== "admin") return;
        router.replace(redirect.startsWith("/") ? redirect : "/");
    }, [isAdminRedirect, isReady, redirect, router, user]);

    useEffect(() => {
        if (!allowRegister && mode === "register") setMode("login");
    }, [allowRegister, mode]);

    const submit = async (values: LoginFormValues) => {
        try {
            if (mode === "register" && !allowRegister) {
                message.error("当前未开放注册");
                return;
            }
            if (mode === "register" && values.password !== values.confirmPassword) {
                message.error("两次输入的密码不一致");
                return;
            }
            const action = mode === "register" ? register : login;
            const user = await action({ username: values.username, password: values.password });
            message.success(mode === "register" ? "注册成功" : "登录成功");
            router.replace(redirect.startsWith("/") ? redirect : "/");
            if (user.role !== "admin") router.replace("/projects");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "登录失败");
        }
    };

    return (
        <main className="studio-workspace studio-shell flex h-full min-h-0 items-center justify-center overflow-y-auto px-4 py-6 md:px-6">
            <section className="grid w-full max-w-5xl gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
                <div className="studio-panel hidden min-h-[520px] flex-col justify-between p-6 lg:flex">
                    <div>
                        <span
                            className="block size-12 bg-[var(--studio-text-primary)]"
                            style={{
                                mask: "url(/logo.svg) center / contain no-repeat",
                                WebkitMask: "url(/logo.svg) center / contain no-repeat",
                            }}
                            aria-label="眨眼之间"
                        />
                        <p className="mt-8 text-xs font-semibold tracking-[0.16em] text-[var(--studio-accent)]">工作台登录</p>
                        <h1 className="mt-2 max-w-md text-3xl font-semibold leading-tight tracking-normal text-[var(--studio-text-primary)]">进入你的 AI 影视工作台</h1>
                        <p className="mt-3 max-w-md text-sm leading-6 text-[var(--studio-text-secondary)]">项目、素材、提示词和生成记录都在同一套本地工作流里继续。</p>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        {[
                            ["Projects", "项目"],
                            ["Assets", "素材"],
                            ["Prompts", "提示词"],
                        ].map(([label, value]) => (
                            <div key={label} className="rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3">
                                <div className="text-xs font-semibold uppercase text-[var(--studio-accent)]">{label}</div>
                                <div className="mt-2 text-sm text-[var(--studio-text-primary)]">{value}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="studio-panel p-5 md:p-6">
                    <div className="mb-7">
                        <span
                            className="mb-4 block size-10 bg-[var(--studio-text-primary)] lg:hidden"
                            style={{
                                mask: "url(/logo.svg) center / contain no-repeat",
                                WebkitMask: "url(/logo.svg) center / contain no-repeat",
                            }}
                            aria-label="眨眼之间"
                        />
                        <p className="text-xs font-semibold tracking-[0.16em] text-[var(--studio-accent)]">账号登录</p>
                        <h2 className="mt-2 text-3xl font-semibold tracking-normal text-[var(--studio-text-primary)]">账号登录</h2>
                        <p className="mt-3 text-sm leading-6 text-[var(--studio-text-secondary)]">使用账号密码登录工作台。</p>
                    </div>

                    <Form<LoginFormValues> layout="vertical" size="large" requiredMark={false} onFinish={submit}>
                        <Form.Item>
                            <Segmented
                                block
                                value={mode}
                                onChange={(value) => setMode(value as "login" | "register")}
                                options={
                                    allowRegister
                                        ? [
                                              { label: "登录", value: "login" },
                                              { label: "注册", value: "register" },
                                          ]
                                        : [{ label: "登录", value: "login" }]
                                }
                            />
                        </Form.Item>
                        <Form.Item name="username" label={<span className="font-medium text-[var(--studio-text-primary)]">用户名</span>} rules={[{ required: true, message: "请输入用户名" }]}>
                            <Input prefix={<UserOutlined />} autoComplete="username" />
                        </Form.Item>
                        <Form.Item name="password" label={<span className="font-medium text-[var(--studio-text-primary)]">密码</span>} rules={[{ required: true, message: "请输入密码" }]}>
                            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
                        </Form.Item>
                        {mode === "register" ? (
                            <Form.Item name="confirmPassword" label={<span className="font-medium text-[var(--studio-text-primary)]">确认密码</span>} rules={[{ required: true, message: "请再次输入密码" }]}>
                                <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
                            </Form.Item>
                        ) : null}
                        <Button block type="primary" htmlType="submit" loading={isLoading}>
                            {mode === "register" ? "注册" : "登录"}
                        </Button>
                    </Form>
                </div>
            </section>
        </main>
    );
}
