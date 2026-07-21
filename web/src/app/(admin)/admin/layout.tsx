"use client";

import { ApartmentOutlined, ArrowLeftOutlined, FileTextOutlined, HomeOutlined, LogoutOutlined, MenuOutlined, PictureOutlined, RobotOutlined, SettingOutlined, TransactionOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Drawer, Flex, Grid, Layout, Menu, Spin, Typography, theme } from "antd";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState, useTransition } from "react";

import { UserStatusActions } from "@/components/layout/user-status-actions";
import { adminLayoutStyle } from "@/lib/app-theme";
import { useUserStore } from "@/stores/use-user-store";

const adminMenus = [
    { key: "/admin/users", icon: <UserOutlined />, label: "用户管理" },
    { key: "/admin/credit-logs", icon: <TransactionOutlined />, label: "算力点日志" },
    { key: "/admin/ai-tasks", icon: <RobotOutlined />, label: "AI 任务日志" },
    { key: "/admin/prompts", icon: <FileTextOutlined />, label: "提示词管理" },
    { key: "/admin/assets", icon: <PictureOutlined />, label: "素材管理" },
    { key: "/admin/workflow-skills", icon: <ApartmentOutlined />, label: "工作流 Skill" },
    { key: "/admin/settings", icon: <SettingOutlined />, label: "系统设置" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
    const { token: antToken } = theme.useToken();
    const router = useRouter();
    const pathname = usePathname();
    const token = useUserStore((state) => state.token);
    const user = useUserStore((state) => state.user);
    const isReady = useUserStore((state) => state.isReady);
    const logout = useUserStore((state) => state.clearSession);
    const [pendingMenuKey, setPendingMenuKey] = useState("");
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [authWaitExpired, setAuthWaitExpired] = useState(false);
    const [, startTransition] = useTransition();
    const screens = Grid.useBreakpoint();
    const isCompact = screens.md === false;
    const activeKey = pathname.startsWith("/admin/workflow-skills")
        ? "/admin/workflow-skills"
        : pathname.startsWith("/admin/settings")
          ? "/admin/settings"
          : pathname.startsWith("/admin/assets")
            ? "/admin/assets"
            : pathname.startsWith("/admin/prompts")
              ? "/admin/prompts"
              : pathname.startsWith("/admin/ai-tasks")
                ? "/admin/ai-tasks"
                : pathname.startsWith("/admin/credit-logs")
                  ? "/admin/credit-logs"
                  : pathname.startsWith("/admin/users")
                    ? "/admin/users"
                    : "";
    const pageTitle = pathname.startsWith("/admin/workflow-skills")
        ? "工作流 Skill"
        : pathname.startsWith("/admin/settings")
          ? "系统设置"
          : pathname.startsWith("/admin/assets")
            ? "素材管理"
            : pathname.startsWith("/admin/prompts")
              ? "提示词管理"
              : pathname.startsWith("/admin/ai-tasks")
                ? "AI 任务日志"
                : pathname.startsWith("/admin/credit-logs")
                  ? "算力点日志"
                  : "用户管理";

    useEffect(() => {
        if (!isReady) return;
        if (!token) {
            router.replace("/login?redirect=/admin");
            return;
        }
        if (user?.role !== "admin") {
            router.replace("/");
        }
    }, [isReady, router, token, user?.role]);

    useEffect(() => {
        adminMenus.forEach((item) => router.prefetch(item.key));
    }, [router]);

    useEffect(() => {
        setPendingMenuKey("");
        setMobileMenuOpen(false);
    }, [pathname]);

    useEffect(() => {
        if (isReady) {
            setAuthWaitExpired(false);
            return;
        }
        const timer = window.setTimeout(() => setAuthWaitExpired(true), 6000);
        return () => window.clearTimeout(timer);
    }, [isReady]);

    const goBack = () => {
        if (window.history.length > 1) {
            router.back();
            return;
        }
        router.push("/projects");
    };

    if (!isReady || !token || user?.role !== "admin") {
        const fallbackTitle = !isReady ? (authWaitExpired ? "登录状态确认较慢" : "正在进入管理后台") : !token ? "请先登录管理员账号" : "当前账号没有管理后台权限";
        const fallbackDescription = !isReady ? (authWaitExpired ? "你可以重新登录，或先回到项目中心。" : "正在确认登录状态，请稍候。") : !token ? "登录后会自动回到管理后台。" : "你可以返回项目中心继续使用。";

        return (
            <div className="studio-workspace studio-shell flex min-h-screen items-center justify-center p-6" style={{ background: antToken.colorBgLayout }}>
                <div className="studio-panel w-full max-w-[420px] p-5">
                    <Flex vertical align="center" gap={16} style={{ textAlign: "center" }}>
                        <span aria-hidden className="grid size-12 place-items-center rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)]">
                            <span style={{ display: "inline-block", width: 28, height: 28, background: antToken.colorText, WebkitMask: "url(/logo.svg) center / contain no-repeat", mask: "url(/logo.svg) center / contain no-repeat" }} />
                        </span>
                        <div>
                            <Typography.Text className="text-xs font-semibold tracking-[0.16em] text-[var(--studio-accent)]">管理后台</Typography.Text>
                            <Typography.Title level={4} style={{ margin: "8px 0 0" }}>
                                {fallbackTitle}
                            </Typography.Title>
                        </div>
                        {!isReady ? <Spin /> : null}
                        <Typography.Text type="secondary">{fallbackDescription}</Typography.Text>
                        <Flex gap={10} wrap justify="center">
                            {(isReady && !token) || authWaitExpired ? (
                                <Button type="primary" href="/login?redirect=/admin">
                                    去登录
                                </Button>
                            ) : null}
                            {(isReady && token && user?.role !== "admin") || authWaitExpired ? <Button href="/projects">前往项目</Button> : null}
                        </Flex>
                    </Flex>
                </div>
            </div>
        );
    }

    const menuItems = adminMenus.map((item) => ({
        ...item,
        label: item.label,
        style: adminLayoutStyle.menuItem,
    }));
    const adminMenu = (
        <Menu
            mode="inline"
            selectedKeys={[pendingMenuKey || activeKey]}
            onClick={({ key }) => {
                if (key === activeKey) return;
                setPendingMenuKey(key);
                startTransition(() => router.push(key));
            }}
            style={adminLayoutStyle.menu}
            items={menuItems}
        />
    );
    const sideActions = (
        <Flex vertical gap={8}>
            <Button block icon={<ArrowLeftOutlined />} onClick={goBack}>
                返回上一页
            </Button>
            <Button block icon={<HomeOutlined />} href="/projects">
                前往项目
            </Button>
            <Button block icon={<LogoutOutlined />} onClick={logout}>
                退出登录
            </Button>
        </Flex>
    );
    const brand = (
        <Flex align="center" gap={12} style={{ height: adminLayoutStyle.brandHeight, padding: "0 20px", borderBottom: "1px solid var(--studio-border-subtle)", background: "var(--studio-panel-muted-bg)" }}>
            <span aria-hidden className="grid size-8 place-items-center rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)]">
                <span style={{ display: "inline-block", width: 20, height: 20, background: antToken.colorText, WebkitMask: "url(/logo.svg) center / contain no-repeat", mask: "url(/logo.svg) center / contain no-repeat" }} />
            </span>
            <div style={{ minWidth: 0 }}>
                <Typography.Text strong style={{ display: "block", fontSize: 18, letterSpacing: 0, lineHeight: 1.2 }}>
                    眨眼之间
                </Typography.Text>
                <Typography.Text type="secondary" style={{ display: "block", fontSize: 12, lineHeight: 1.3 }}>
                    管理后台
                </Typography.Text>
            </div>
        </Flex>
    );
    const drawerTitle = (
        <Flex align="center" gap={10}>
            <span aria-hidden style={{ display: "inline-block", width: 24, height: 24, background: antToken.colorText, WebkitMask: "url(/logo.svg) center / contain no-repeat", mask: "url(/logo.svg) center / contain no-repeat" }} />
            <Typography.Text strong style={{ fontSize: 16, letterSpacing: 0 }}>
                眨眼之间
            </Typography.Text>
        </Flex>
    );

    return (
        <Layout className="studio-workspace" hasSider={!isCompact} style={{ height: "100dvh", overflow: "hidden", background: antToken.colorBgLayout }}>
            {!isCompact ? (
                <Layout.Sider width={adminLayoutStyle.siderWidth} style={{ height: "100dvh", overflow: "hidden", background: "var(--studio-panel-bg)", borderRight: "1px solid var(--studio-border-subtle)" }}>
                    {brand}
                    {adminMenu}
                    <div style={{ position: "absolute", bottom: 0, insetInline: 0, padding: 12, borderTop: "1px solid var(--studio-border-subtle)", background: "var(--studio-panel-muted-bg)" }}>{sideActions}</div>
                </Layout.Sider>
            ) : (
                <Drawer
                    rootClassName="studio-modal"
                    title={drawerTitle}
                    placement="left"
                    size={280}
                    open={mobileMenuOpen}
                    onClose={() => setMobileMenuOpen(false)}
                    footer={sideActions}
                    styles={{ body: { padding: 0 }, footer: { borderTop: `1px solid ${antToken.colorBorder}` } }}
                >
                    {adminMenu}
                </Drawer>
            )}
            <Layout style={{ background: antToken.colorBgLayout }}>
                <Layout.Header
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        height: adminLayoutStyle.headerHeight,
                        padding: isCompact ? "0 12px" : "0 24px",
                        background: "var(--studio-panel-bg)",
                        borderBottom: "1px solid var(--studio-border-subtle)",
                        backdropFilter: "blur(16px)",
                    }}
                >
                    <Flex align="center" gap={8} style={{ minWidth: 0 }}>
                        {isCompact ? <Button aria-label="打开后台菜单" icon={<MenuOutlined />} onClick={() => setMobileMenuOpen(true)} /> : null}
                        <Typography.Title level={5} style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {pageTitle}
                        </Typography.Title>
                    </Flex>
                    <Flex align="center" gap={4}>
                        <UserStatusActions showConfig={false} />
                    </Flex>
                </Layout.Header>
                <Layout.Content style={{ minHeight: 0, overflow: "auto" }}>{children}</Layout.Content>
            </Layout>
        </Layout>
    );
}
