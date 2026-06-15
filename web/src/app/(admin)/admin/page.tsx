"use client";

import { Spin } from "antd";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AdminPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace("/admin/users");
    }, [router]);

    return (
        <main style={{ display: "grid", minHeight: "100%", placeItems: "center", padding: 24 }}>
            <Spin description="正在打开用户管理" />
        </main>
    );
}
