import { create } from '../../../packages/core/src/index';
import { logger } from '../../../packages/coaction-logger/src/index';
import { history } from '../../../packages/coaction-history/src/index';
import {
  createJSONStorage,
  persist
} from '../../../packages/coaction-persist/src/index';
import {
  applyUpdate,
  bindYjs,
  Doc
} from '../../../packages/coaction-yjs/src/index';

type CounterState = {
  count: number;
  increment: () => void;
};

type LoggerLike = {
  log: (...args: unknown[]) => void;
  group: (...args: unknown[]) => void;
  groupCollapsed: (...args: unknown[]) => void;
  trace: (...args: unknown[]) => void;
  groupEnd: () => void;
};

type HistoryApi = {
  undo: () => boolean;
  redo: () => boolean;
  canUndo: () => boolean;
  canRedo: () => boolean;
};

type LoggerResult = {
  count: number;
  eventCount: number;
  methods: string[];
};

type HistoryResult = {
  afterIncrement: number;
  afterUndo: number;
  afterRedo: number;
  undone: boolean;
  redone: boolean;
  canUndo: boolean;
  canRedo: boolean;
};

type PersistResult = {
  count: number;
  persistedCount: number | null;
};

type PersistHydrateResult = {
  count: number;
};

type YjsResult = {
  peerACount: number;
  peerBCount: number;
};

type MiddlewareHarness = {
  runLoggerScenario: () => LoggerResult;
  runHistoryScenario: () => HistoryResult;
  runPersistScenario: (name?: string) => Promise<PersistResult>;
  runPersistHydrateScenario: (
    name?: string,
    expectedCount?: number
  ) => Promise<PersistHydrateResult>;
  runYjsScenario: () => Promise<YjsResult>;
  clearPersistState: (name?: string) => void;
};

declare global {
  interface Window {
    __middlewareHarness: MiddlewareHarness;
  }
}

const wait = (ms = 0) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const nextTick = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const waitFor = async (
  predicate: () => boolean,
  timeoutMs = 1000,
  intervalMs = 10
) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }
    await wait(intervalMs);
  }
  throw new Error('Timed out waiting for scenario condition.');
};

const runLoggerScenario = (): LoggerResult => {
  const events: Array<{ method: string }> = [];
  const sink: LoggerLike = {
    log: (...args) => {
      void args;
      events.push({ method: 'log' });
    },
    group: (...args) => {
      void args;
      events.push({ method: 'group' });
    },
    groupCollapsed: (...args) => {
      void args;
      events.push({ method: 'groupCollapsed' });
    },
    trace: (...args) => {
      void args;
      events.push({ method: 'trace' });
    },
    groupEnd: () => {
      events.push({ method: 'groupEnd' });
    }
  };

  const store = create<CounterState>(
    (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      }
    }),
    {
      middlewares: [
        logger({
          logger: sink,
          collapsed: true,
          stackTrace: false
        })
      ]
    }
  );

  store.getState().increment();
  const methods = Array.from(new Set(events.map((event) => event.method)));
  const result: LoggerResult = {
    count: store.getState().count,
    eventCount: events.length,
    methods
  };

  store.destroy();
  return result;
};

const runHistoryScenario = (): HistoryResult => {
  const store = create<CounterState>(
    (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      }
    }),
    {
      middlewares: [history()]
    }
  );

  const api = (store as unknown as { history: HistoryApi }).history;
  store.getState().increment();
  store.getState().increment();

  const result: HistoryResult = {
    afterIncrement: store.getState().count,
    undone: api.undo(),
    afterUndo: store.getState().count,
    redone: api.redo(),
    afterRedo: store.getState().count,
    canUndo: api.canUndo(),
    canRedo: api.canRedo()
  };

  store.destroy();
  return result;
};

const clearPersistState = (name = 'pw-persist') => {
  localStorage.removeItem(name);
};

const runPersistScenario = async (
  name = 'pw-persist'
): Promise<PersistResult> => {
  clearPersistState(name);
  const storage = createJSONStorage(() => localStorage);

  const store = create(
    (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      }
    }),
    {
      middlewares: [
        persist({
          name,
          storage
        })
      ]
    }
  );

  store.getState().increment();
  await nextTick();
  await wait(0);

  const raw = localStorage.getItem(name);
  const persistedCount = raw
    ? (JSON.parse(raw) as { state: { count: number } }).state.count
    : null;

  const result: PersistResult = {
    count: store.getState().count,
    persistedCount
  };

  store.destroy();
  return result;
};

const runPersistHydrateScenario = async (
  name = 'pw-persist',
  expectedCount = 1
): Promise<PersistHydrateResult> => {
  const storage = createJSONStorage(() => localStorage);
  const store = create(
    () => ({
      count: 0
    }),
    {
      middlewares: [
        persist({
          name,
          storage
        })
      ]
    }
  );

  await waitFor(() => store.getState().count === expectedCount, 1500, 15);
  const result: PersistHydrateResult = {
    count: store.getState().count
  };

  store.destroy();
  return result;
};

const runYjsScenario = async (): Promise<YjsResult> => {
  const docA = new Doc();
  const docB = new Doc();
  const fromPeerA = 'network:peer-a';
  const fromPeerB = 'network:peer-b';

  const onA = (update: Uint8Array, origin: unknown) => {
    if (origin === fromPeerB) {
      return;
    }
    setTimeout(() => {
      applyUpdate(docB, update, fromPeerA);
    }, 0);
  };

  const onB = (update: Uint8Array, origin: unknown) => {
    if (origin === fromPeerA) {
      return;
    }
    setTimeout(() => {
      applyUpdate(docA, update, fromPeerB);
    }, 0);
  };

  docA.on('update', onA);
  docB.on('update', onB);

  const storeA = create<CounterState>((set) => ({
    count: 0,
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }));

  const storeB = create<CounterState>((set) => ({
    count: 0,
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }));

  const bindingA = bindYjs(storeA, {
    doc: docA,
    key: 'counter'
  });

  const bindingB = bindYjs(storeB, {
    doc: docB,
    key: 'counter'
  });

  await waitFor(
    () => storeA.getState().count === 0 && storeB.getState().count === 0
  );

  storeA.getState().increment();
  await waitFor(() => storeB.getState().count === 1);

  storeB.getState().increment();
  await waitFor(() => storeA.getState().count === 2);

  const result: YjsResult = {
    peerACount: storeA.getState().count,
    peerBCount: storeB.getState().count
  };

  bindingA.destroy();
  bindingB.destroy();
  storeA.destroy();
  storeB.destroy();
  docA.off('update', onA);
  docB.off('update', onB);
  docA.destroy();
  docB.destroy();

  return result;
};

window.__middlewareHarness = {
  runLoggerScenario,
  runHistoryScenario,
  runPersistScenario,
  runPersistHydrateScenario,
  runYjsScenario,
  clearPersistState
};

const statusNode = document.querySelector<HTMLParagraphElement>('#status');
if (statusNode) {
  statusNode.textContent = 'ready';
}
