import { useEffect, useMemo, useState } from "react";

import type { CanvasConnection, CanvasNodeData } from "../types";
import { buildCanvasCapacitySnapshot, type CanvasStorageEstimate } from "../utils/canvas-capacity";

export function useCanvasCapacity(nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const [estimate, setEstimate] = useState<CanvasStorageEstimate>({});

    useEffect(() => {
        if (!navigator.storage?.estimate) return;
        let active = true;
        const timer = window.setTimeout(() => {
            void navigator.storage
                .estimate()
                .then((value) => {
                    if (active) setEstimate({ usage: value.usage, quota: value.quota });
                })
                .catch(() => undefined);
        }, 500);
        return () => {
            active = false;
            window.clearTimeout(timer);
        };
    }, [connections, nodes]);

    return useMemo(() => buildCanvasCapacitySnapshot(nodes, connections, estimate), [connections, estimate, nodes]);
}
