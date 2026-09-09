import { vi } from 'vitest';
import { Computed } from '../src/computed';
import { getRawState } from '../src/getRawState';
import { createClientAction } from '../src/getRawStateClientAction';
import {
  decodeExecuteRequest,
  encodeExecuteResponse
} from '../src/transportProtocol';

type ClientStoreContext = {
  internal: any;
  store: any;
  trigger: () => void;
};

const createClientStoreContext = (
  emitImpl: (...args: any[]) => Promise<any>,
  options: Record<string, unknown> = {}
): ClientStoreContext => {
  const subscriptions = new Set<() => void>();
  const internal = {
    sequence: 0,
    transportEpoch: 'epoch-1',
    listeners: new Set(),
    isBatching: false,
    syncClientState: vi.fn(async () => undefined)
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
    apply: vi.fn((nextState: unknown) => {
      internal.rootState = nextState;
      subscriptions.forEach((listener) => listener());
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
    options,
    createClientAction
  );
  return {
    internal,
    store,
    trigger: () => {
      subscriptions.forEach((listener) => listener());
    }
  };
};

test('client action sends a JSON request and reports tagged transport errors', async () => {
  const { store } = createClientStoreContext(async () =>
    encodeExecuteResponse({
      epoch: 'epoch-1',
      error: 'boom',
      ok: false,
      sequence: 0
    })
  );

  await expect(store.getState().increment(1)).rejects.toThrow('boom');
  expect(store.trace).toHaveBeenCalledTimes(2);
  expect(store.transport.emit).toHaveBeenCalledWith(
    'execute',
    expect.any(String)
  );
  expect(decodeExecuteRequest(store.transport.emit.mock.calls[0][1])).toEqual({
    action: ['increment'],
    args: [1]
  });
});

test('client action returns error-shaped JSON objects as normal data', async () => {
  const value = {
    $$Error: 'domain-value',
    __coactionTransportError__: true,
    value: 42
  };
  const { store } = createClientStoreContext(async () =>
    encodeExecuteResponse({
      epoch: 'epoch-1',
      ok: true,
      sequence: 0,
      value
    })
  );

  await expect(store.getState().increment(1)).resolves.toEqual(value);
});

test('client action waits for a same-epoch update to catch up', async () => {
  const { store, internal, trigger } = createClientStoreContext(async () =>
    encodeExecuteResponse({
      epoch: 'epoch-1',
      ok: true,
      sequence: 2,
      value: 'ok'
    })
  );

  const pending = store.getState().increment(1);
  await Promise.resolve();
  internal.sequence = 2;
  trigger();

  await expect(pending).resolves.toBe('ok');
  expect(store.subscribe).toHaveBeenCalledTimes(1);
  expect(internal.syncClientState).not.toHaveBeenCalled();
});

test('client action requests full sync when the authority epoch changes', async () => {
  const { store, internal } = createClientStoreContext(async () =>
    encodeExecuteResponse({
      epoch: 'epoch-2',
      ok: true,
      sequence: 3,
      value: 'ok'
    })
  );

  await expect(store.getState().increment(1)).resolves.toBe('ok');
  expect(internal.syncClientState).toHaveBeenCalledWith('epoch-2', 3);
});

test('client action rejects a response from a superseded authority', async () => {
  let resolveResponse!: (value: string) => void;
  const { store, internal } = createClientStoreContext(
    () =>
      new Promise<string>((resolve) => {
        resolveResponse = resolve;
      })
  );
  const pending = store.getState().increment(1);
  internal.transportEpoch = 'epoch-2';
  resolveResponse(
    encodeExecuteResponse({
      epoch: 'epoch-1',
      ok: true,
      sequence: 2,
      value: 'old result'
    })
  );

  await expect(pending).rejects.toMatchObject({
    code: 'COACTION_ACTION_AUTHORITY_CHANGED',
    name: 'ActionAuthorityChangedError',
    outcome: 'unknown'
  });
  await expect(pending).rejects.toThrow(
    'The action may have completed on the previous authority; retry only if it is idempotent.'
  );
  expect(internal.syncClientState).not.toHaveBeenCalled();
});

test('client action falls back to full sync after the catch-up timeout', async () => {
  vi.useFakeTimers();
  try {
    const { store, internal } = createClientStoreContext(async () =>
      encodeExecuteResponse({
        epoch: 'epoch-1',
        ok: true,
        sequence: 2,
        value: 'ok'
      })
    );
    const pending = store.getState().increment(1);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1_500);

    await expect(pending).resolves.toBe('ok');
    expect(internal.syncClientState).toHaveBeenCalledWith('epoch-1', 2);
  } finally {
    vi.useRealTimers();
  }
});

test('client action honors a custom catch-up timeout', async () => {
  vi.useFakeTimers();
  try {
    const { store, internal, trigger } = createClientStoreContext(
      async () =>
        encodeExecuteResponse({
          epoch: 'epoch-1',
          ok: true,
          sequence: 2,
          value: 'ok'
        }),
      { executeSyncTimeoutMs: 5_000 }
    );
    const pending = store.getState().increment(1);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1_600);
    expect(internal.syncClientState).not.toHaveBeenCalled();

    internal.sequence = 2;
    trigger();
    await expect(pending).resolves.toBe('ok');
  } finally {
    vi.useRealTimers();
  }
});

test('client action rejects when its full-sync fallback fails', async () => {
  vi.useFakeTimers();
  try {
    const { store, internal } = createClientStoreContext(async () =>
      encodeExecuteResponse({
        epoch: 'epoch-1',
        ok: true,
        sequence: 2,
        value: 'ok'
      })
    );
    internal.syncClientState.mockRejectedValueOnce(new Error('sync failed'));
    const pending = store.getState().increment(1);
    const assertion = expect(pending).rejects.toThrow('sync failed');
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1_500);
    await assertion;
  } finally {
    vi.useRealTimers();
  }
});

test('client action delays a tagged error until state catches up', async () => {
  const { store, internal, trigger } = createClientStoreContext(async () =>
    encodeExecuteResponse({
      epoch: 'epoch-1',
      error: 'late boom',
      ok: false,
      sequence: 2
    })
  );
  const pending = store.getState().increment(1);
  await Promise.resolve();
  internal.sequence = 2;
  trigger();

  await expect(pending).rejects.toThrow('late boom');
  expect(store.trace).toHaveBeenCalledTimes(2);
});

test('client action rejects invalid executeSyncTimeoutMs configuration', () => {
  expect(() => {
    createClientStoreContext(async () => '', {
      executeSyncTimeoutMs: -1
    });
  }).toThrow(
    'executeSyncTimeoutMs must be a finite number greater than or equal to 0'
  );
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
    runWithNotifications: (fn: () => unknown) => fn(),
    publishCommit: vi.fn(),
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
    runWithNotifications: (fn: () => unknown) => fn(),
    publishCommit: vi.fn(),
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
