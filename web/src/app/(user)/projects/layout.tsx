import type { ReactNode } from "react";

import { ProjectWorkspaceShell } from "./project-workspace-shell";

export default function ProjectsLayout({ children }: { children: ReactNode }) {
    return <ProjectWorkspaceShell>{children}</ProjectWorkspaceShell>;
}
