import { createUserScopedLocalForage } from "@/lib/user-scoped-localforage";

export const workflowRunSessionStorage = createUserScopedLocalForage("workflow_run_sessions");
