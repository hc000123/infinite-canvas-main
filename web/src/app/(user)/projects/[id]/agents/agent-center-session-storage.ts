import { createUserScopedLocalForage } from "@/lib/user-scoped-localforage";

export const agentCenterSessionStorage = createUserScopedLocalForage("agent_center_sessions");
