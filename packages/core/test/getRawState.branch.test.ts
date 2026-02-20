import { vi } from 'vitest';
import { Computed } from '../src/computed';
import { getRawState } from '../src/getRawState';

type ClientStoreContext = {
  internal: any;
  store: any;
  trigger: () => void;
};

const createClientStoreContext = (
  emitImpl: (...args: any[]) => Promise<[any, number]>
): ClientStoreContext => {
  const subscriptions = new Set<() => void>();
  const internal = {
    sequence: 0,
    listeners: new Set(),
    isBatching: false
  } as any;
  const store = {
    share: 'client',
    transport: {
      emit: vi.fn(emitImpl)
    },
    trace: vi.fn(),
    subscribe: vi.fn((listener: () => void) => {
      subscriptions.add(listener);
      return () => subscriptions.delete(listener);
    }),
    getState: () => internal.module
  } as any;
  getRawState(
    store,
    internal,
    {
      increment(step: number) {
        return step + 1;
      }
    },
    {}
  );
  return {
    internal,
    store,
    trigger: () => {
      subscriptions.forEach((listener) => listener());
    }
  };
};

test('client action trace reports transport $$Error results', async () => {
  const { store, internal } = createClientStoreContext(async () => [
    {
      $$Error: 'boom'
    },
    0
  ]);
  internal.sequence = 0;
  await expect(store.getState().increment(1)).rejects.toThrow('boom');
  expect(store.trace).toHaveBeenCalledTimes(2);
  expect(store.transport.emit).toHaveBeenCalledWith(
    'execute',
    ['increment'],
    [1]
  );
});

test('client action waits for sequence catch-up and warns in development', async () => {
  const { store, internal, trigger } = createClientStoreContext(async () => [
    'ok',
    2
  ]);
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    const pending = store.getState().increment(1);
    await Promise.resolve();
    internal.sequence = 2;
    trigger();
    await expect(pending).resolves.toBe('ok');
    expect(store.subscribe).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      'The sequence of the action is not consistent.',
      2,
      0
    );
  } finally {
    process.env.NODE_ENV = prev;
    warnSpy.mockRestore();
  }
});

test('client action mismatch path works without development warning', async () => {
  const { store, internal, trigger } = createClientStoreContext(async () => [
    'ok',
    2
  ]);
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  try {
    const pending = store.getState().increment(1);
    await Promise.resolve();
    trigger();
    internal.sequence = 2;
    trigger();
    await expect(pending).resolves.toBe('ok');
    expect(warnSpy).not.toHaveBeenCalled();
  } finally {
    process.env.NODE_ENV = prev;
    warnSpy.mockRestore();
  }
});

const createMutableSliceContext = ({
  enablePatches,
  actMutable
}: {
  enablePatches?: boolean;
  actMutable?: (updater: () => any) => any;
}) => {
  const sourceCounter = {
    count: 0,
    increment(step = 1) {
      this.count += step;
      return this.count;
    }
  };
  const mutableCounter = {
    count: 0
  };
  const internal = {
    toMutableRaw: (state: object) =>
      state === sourceCounter ? mutableCounter : undefined,
    actMutable,
    sequence: 0,
    listeners: new Set(),
    isBatching: false
  } as any;
  const store = {
    share: false,
    isSliceStore: true,
    getState: () => internal.module,
    apply: vi.fn((state: any) => {
      internal.rootState = state;
    })
  } as any;
  const rawState = getRawState(
    store,
    internal,
    {
      counter: sourceCounter
    },
    {
      enablePatches
    } as any
  );
  internal.rootState = rawState;
  return {
    internal,
    store
  };
};

test('mutable slice action uses sliceKey branch in patch-enabled flow', () => {
  const { store } = createMutableSliceContext({
    enablePatches: true
  });
  const result = store.getState().counter.increment(2);
  expect(result).toBe(2);
  expect(store.apply).toHaveBeenCalled();
});

test('mutable slice action uses sliceKey branch in actMutable flow', () => {
  const { store } = createMutableSliceContext({
    enablePatches: false,
    actMutable: (updater) => updater()
  });
  const result = store.getState().counter.increment(3);
  expect(result).toBe(3);
});

test('throws when computed is used with mutable instance', () => {
  const internal = {
    toMutableRaw: () => ({})
  } as any;
  const store = {
    share: false,
    getState: () => ({})
  } as any;
  expect(() => {
    getRawState(
      store,
      internal,
      {
        value: new Computed(
          () => [],
          () => 1
        )
      },
      {}
    );
  }).toThrow('Computed is not supported with mutable instance');
});
