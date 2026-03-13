export type WorkerCounterState = {
  count: number;
  add: (step?: number) => number;
  addAsync: (step?: number) => Promise<number>;
  fail: (message?: string) => never;
};

const wait = (ms = 0) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export const workerCounter = (set: any): WorkerCounterState => ({
  count: 0,
  add(step = 1) {
    set((draft: WorkerCounterState) => {
      draft.count += step;
    });
    return this.count;
  },
  async addAsync(step = 1) {
    set((draft: WorkerCounterState) => {
      draft.count += step;
    });
    await wait(20);
    set((draft: WorkerCounterState) => {
      draft.count += step;
    });
    return this.count;
  },
  fail(message = 'worker exploded') {
    throw new Error(message);
  }
});
