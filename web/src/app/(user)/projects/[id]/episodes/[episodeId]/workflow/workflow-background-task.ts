export function startBackgroundTask(task: () => Promise<unknown>, onError: (error: unknown) => void = () => undefined) {
    void task().catch(onError);
}

export async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>) {
    const results = new Array<R>(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await mapper(items[index]);
        }
    });
    await Promise.all(workers);
    return results;
}
