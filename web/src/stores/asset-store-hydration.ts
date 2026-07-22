export function createAssetStoreHydrationGate() {
    let released = false;
    let release: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
        release = () => {
            if (released) return;
            released = true;
            resolve();
        };
    });

    return { wait: () => ready, release };
}

export function mergeHydratedAssetCollections<TAsset extends { id: string }, TFolder extends { id: string }>(persisted: { assets?: TAsset[]; folders?: TFolder[] } | undefined, current: { assets: TAsset[]; folders: TFolder[] }) {
    return {
        assets: mergeById(current.assets, persisted?.assets || []),
        folders: mergeById(current.folders, persisted?.folders || []),
    };
}

function mergeById<T extends { id: string }>(current: T[], persisted: T[]) {
    const currentIds = new Set(current.map((item) => item.id));
    return [...current, ...persisted.filter((item) => !currentIds.has(item.id))];
}
