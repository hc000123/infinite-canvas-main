import { apiGet, apiPost, apiPostEmpty } from "@/services/api/request";
import { useUserStore } from "@/stores/use-user-store";

import { createInvocationClient } from "./invocations-contract";

export * from "./invocations-contract";

export const {
    createArtifact,
    listArtifacts,
    getArtifact,
    createInvocation,
    listInvocations,
    getInvocation,
    repreflightInvocation,
    confirmInvocation,
    cancelInvocation,
    retryInvocation,
    revalidateInvocation,
    reviewInvocation,
    applyInvocation,
    listInvocationEvents,
} = createInvocationClient({ apiGet, apiPost, apiPostEmpty, token: () => useUserStore.getState().token });
