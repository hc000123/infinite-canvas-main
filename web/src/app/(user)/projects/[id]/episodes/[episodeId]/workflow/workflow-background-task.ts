export function startBackgroundTask(task: () => Promise<unknown>, onError: (error: unknown) => void = () => undefined) {
    void task().catch(onError);
}
