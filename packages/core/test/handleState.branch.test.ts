import { vi } from 'vitest';
import { emit } from '../src/asyncClientStore';
import { handleState } from '../src/handleState';
import { decodeUpdateMessage } from '../src/transportProtocol';

const createContext = (options?: {
  share?: 'client' | false;
  enablePatches?: boolean;
  patch?: (payload: any) => any;
}) => {
  const internal = {
    runWithNotifications: (fn: () => unknown) => fn(),
    notifyStateChange() {
      this.listeners.forEach((listener: () => void) => listener());
    },
    publishCommit(patches: any) {
      this.emitPatches(patches);
    },
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
    sequence: 0,
    transportEpoch: 'epoch-1'
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
  internal.emitPatches = (patches: any) => emit(store, internal, patches);

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
    expect.any(String)
  );
  expect(decodeUpdateMessage(store.transport.emit.mock.calls[0][1])).toEqual({
    epoch: 'epoch-1',
    patches: patched,
    sequence: 1
  });
  expect(internal.sequence).toBe(1);
});

test('setState rejects unsafe patch-hook output before apply and emit', () => {
  const safePatch = {
    op: 'replace',
    path: ['count'],
    value: JSON.parse('{"value":2,"__proto__":{"polluted":true}}')
  };
  const unsafePatch = {
    op: 'replace',
    path: ['__proto__', 'polluted'],
    value: true
  };
  const { setState, store } = createContext({
    enablePatches: true,
    patch: () => ({
      patches: [unsafePatch, safePatch],
      inversePatches: []
    })
  });
  store.transport = {
    emit: vi.fn()
  };

  expect(() => {
    setState({
      count: 1
    });
  }).toThrow(
    "Unsafe patch path '__proto__.polluted' cannot be applied from store.patch()."
  );
  expect(store.apply).not.toHaveBeenCalled();
  expect(store.transport.emit).not.toHaveBeenCalled();
});

test('setState sanitizes safe patch-hook values before apply and emit', () => {
  const safePatch = {
    op: 'replace',
    path: ['count'],
    value: JSON.parse('{"value":2,"__proto__":{"polluted":true}}')
  };
  const { setState, store } = createContext({
    enablePatches: true,
    patch: () => ({
      patches: [safePatch],
      inversePatches: []
    })
  });
  store.transport = {
    emit: vi.fn()
  };

  setState({
    count: 1
  });

  const expectedPatches = [
    {
      op: 'replace',
      path: ['count'],
      value: {
        value: 2
      }
    }
  ];
  expect(store.apply).toHaveBeenCalledWith(expect.any(Object), expectedPatches);
  expect(store.transport.emit).toHaveBeenCalledWith(
    {
      name: 'update',
      respond: false
    },
    expect.any(String)
  );
  expect(decodeUpdateMessage(store.transport.emit.mock.calls[0][1])).toEqual({
    epoch: 'epoch-1',
    patches: expectedPatches,
    sequence: 1
  });
});

test('setState rejects unsafe custom updater returned patches before emit', () => {
  const safePatch = {
    op: 'replace' as const,
    path: ['count'],
    value: 2
  };
  const unsafePatch = {
    op: 'replace' as const,
    path: ['prototype', 'polluted'],
    value: true
  };
  const { setState, store } = createContext({
    enablePatches: true
  });
  store.transport = {
    emit: vi.fn()
  };

  expect(() => {
    setState({ count: 1 }, () => [
      {
        count: 0
      },
      [unsafePatch, safePatch],
      []
    ]);
  }).toThrow(
    "Unsafe patch path 'prototype.polluted' cannot be applied from setState updater result."
  );
  expect(store.transport.emit).not.toHaveBeenCalled();
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
    internal.rootState = {
      count: 0,
      nested: {
        value: 0
      }
    };

    setState(
      JSON.parse(
        `{"count":1,"nested":{"value":2,"__proto__":{"${pollutedKey}":true},"constructor":{"value":3}},"__proto__":{"${pollutedKey}":true},"prototype":{"value":2}}`
      )
    );

    expect(internal.rootState).toEqual({
      count: 1,
      nested: {
        value: 2
      }
    });
    expect(Object.getPrototypeOf(internal.rootState.nested)).toBe(
      Object.prototype
    );
    expect(
      Object.prototype.hasOwnProperty.call(internal.rootState, '__proto__')
    ).toBeFalsy();
    expect(
      Object.prototype.hasOwnProperty.call(
        internal.rootState.nested,
        '__proto__'
      )
    ).toBeFalsy();
    expect(
      Object.prototype.hasOwnProperty.call(
        internal.rootState.nested,
        'constructor'
      )
    ).toBeFalsy();
    expect(objectPrototype[pollutedKey]).toBeUndefined();
  } finally {
    delete objectPrototype[pollutedKey];
  }
});

test('setState fast path resets batching when object payload merge throws', () => {
  const { setState, internal } = createContext();
  const payload = {};
  Object.defineProperty(payload, 'count', {
    enumerable: true,
    get() {
      throw new Error('payload failed');
    }
  });

  expect(() => {
    setState(payload as any);
  }).toThrow('payload failed');
  expect(internal.rootState).toEqual({
    count: 0
  });

  expect(() => {
    setState({
      count: 2
    });
  }).not.toThrow();
  expect(internal.rootState).toEqual({
    count: 2
  });
});

test('setState fast path resets batching when listeners throw', () => {
  const { setState, internal } = createContext();
  const listener = vi.fn(() => {
    throw new Error('listener failed');
  });
  internal.listeners.add(listener);

  expect(() => {
    setState({
      count: 1
    });
  }).toThrow('listener failed');
  expect(internal.rootState).toEqual({
    count: 1
  });

  internal.listeners.clear();
  expect(() => {
    setState({
      count: 2
    });
  }).not.toThrow();
  expect(internal.rootState).toEqual({
    count: 2
  });
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
