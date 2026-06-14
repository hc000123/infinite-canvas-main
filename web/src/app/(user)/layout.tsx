import { Suspense, type ReactNode } from "react";

import { UserLayoutClient } from "./user-layout-client";

export default function UserLayout({ children }: { children: ReactNode }) {
    return (
        <Suspense fallback={null}>
            <UserLayoutClient>{children}</UserLayoutClient>
        </Suspense>
    );
}
