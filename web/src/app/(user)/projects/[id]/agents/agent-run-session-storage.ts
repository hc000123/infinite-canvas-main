import { createUserScopedLocalForage } from "@/lib/user-scoped-localforage";

export const agentRunSessionStorage = createUserScopedLocalForage("agent_run_sessions");
