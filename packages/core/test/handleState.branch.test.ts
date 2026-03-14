import { vi } from 'vitest';
import { handleState } from '../src/handleState';

const createContext = (options?: {
  share?: 'client' | false;
  enablePatches?: boolean;
  patch?: (payload: any) => any;
}) => {
  const internal = {
    module: {
      count: 0
    },
    rootState: {
      count: 0
    },
    backupState: {
      count: 0
    },
    listeners: new Set<() => void>(),
    isBatching: false,
    mutableInstance: false,
    sequence: 0
  } as any;

  const store = {
    share: options?.share ?? false,
    isSliceStore: false,
    apply: vi.fn((state: any) => {
      internal.rootState = state;
      internal.module = state;
    }),
    patch: options?.patch
  } as any;

  const stateOps = handleState(store, internal, {
    enablePatches: options?.enablePatches
  } as any);
  store.setState = stateOps.setState;
  store.getState = stateOps.getState;

  return {
    store,
    internal,
    setState: stateOps.setState
  };
};

test('setState rejects async updater when patches flow is enabled', () => {
  const { setState } = createContext({
    enablePatches: true
  });

  expect(() => {
    setState(async () => ({
      count: 1
    }));
  }).toThrow('setState with async function is not supported');
});

test('setState uses store.patch hook in patches flow', () => {
  const patch = vi.fn((value) => value);
  const { setState, store } = createContext({
    enablePatches: true,
    patch
  });

  setState({
    count: 1
  });

  expect(patch).toHaveBeenCalledTimes(1);
  expect(store.apply).toHaveBeenCalledTimes(1);
});

test('setState emits patch-hook output instead of raw patches', () => {
  const patched = [
    {
      op: 'replace',
      path: ['count'],
      value: 9
    }
  ];
  const { setState, store, internal } = createContext({
    enablePatches: true,
    patch: () => ({
      patches: patched,
      inversePatches: []
    })
  });
  store.transport = {
    emit: vi.fn()
  };

  setState({
    count: 1
  });

  expect(store.transport.emit).toHaveBeenCalledWith(
    {
      name: 'update',
      respond: false
    },
    {
      patches: patched,
      sequence: 1
    }
  );
  expect(internal.sequence).toBe(1);
});

test('setState does not emit when patch hook removes all patches', () => {
  const { setState, store, internal } = createContext({
    enablePatches: true,
    patch: () => ({
      patches: [],
      inversePatches: []
    })
  });
  store.transport = {
    emit: vi.fn()
  };

  setState({
    count: 1
  });

  expect(store.transport.emit).not.toHaveBeenCalled();
  expect(internal.sequence).toBe(0);
});

test('setState throws for client share store', () => {
  const { setState } = createContext({
    share: 'client',
    enablePatches: true
  });

  expect(() => {
    setState({
      count: 1
    });
  }).toThrow(
    'setState() cannot be called in the client store. To update the state, please trigger a store method with setState() instead.'
  );
});

test('setState fast path ignores unsafe keys', () => {
  const pollutedKey = '__coactionSetStatePolluted__';
  const objectPrototype = Object.prototype as Record<string, unknown>;
  delete objectPrototype[pollutedKey];

  try {
    const { setState, internal } = createContext();

    setState(
      JSON.parse(
        `{"count":1,"__proto__":{"${pollutedKey}":true},"prototype":{"value":2}}`
      )
    );

    expect(internal.rootState).toEqual({
      count: 1
    });
    expect(
      Object.prototype.hasOwnProperty.call(internal.rootState, '__proto__')
    ).toBeFalsy();
    expect(objectPrototype[pollutedKey]).toBeUndefined();
  } finally {
    delete objectPrototype[pollutedKey];
  }
});

test('setState treats null as a no-op in fast path', () => {
  const listener = vi.fn();
  const { setState, internal } = createContext();
  internal.listeners.add(listener);

  expect(setState(null)).toEqual([]);
  expect(internal.rootState).toEqual({
    count: 0
  });
  expect(listener).not.toHaveBeenCalled();
});

test('setState treats null as a no-op when patches are enabled', () => {
  const { setState, store, internal } = createContext({
    enablePatches: true
  });

  expect(setState(null)).toEqual([]);
  expect(store.apply).not.toHaveBeenCalled();
  expect(internal.rootState).toEqual({
    count: 0
  });
});
