import { vi } from 'vitest';

type FakeStore = {
  name: string;
  share: boolean;
  apply: (state?: unknown, patches?: unknown) => unknown;
  setState: (state: unknown, action?: unknown) => unknown;
  getPureState: () => unknown;
  trace?: (options: any) => void;
};

const createFakeStore = (): FakeStore => {
  let currentState: Record<string, unknown> = {
    count: 0
  };
  return {
    name: 'fake',
    share: false,
    apply: (state = currentState) => {
      currentState = state as Record<string, unknown>;
      return state;
    },
    setState: (state) => {
      if (typeof state === 'object' && state !== null) {
        currentState = Object.assign({}, currentState, state as object);
      }
      return [];
    },
    getPureState: () => currentState
  };
};

const createCustomLogger = () => ({
  log: vi.fn(),
  group: vi.fn(),
  groupCollapsed: vi.fn(),
  trace: vi.fn(),
  groupEnd: vi.fn()
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

test('covers verbose/serialized stack trace branches', async () => {
  vi.resetModules();
  const { logger } = await import('../src/logger');
  const customLogger = createCustomLogger();
  const store = createFakeStore();
  logger({
    logger: customLogger as any,
    verbose: true,
    serialized: true,
    stackTrace: true,
    collapsed: false
  })(store as any);
  store.apply(
    {
      count: 1
    },
    [
      {
        op: 'replace',
        path: ['count'],
        value: 1
      }
    ]
  );
  store.trace?.({
    id: 'trace-id',
    method: 'increment',
    parameters: [1],
    sliceKey: 'counter'
  });
  store.trace?.({
    id: 'trace-id',
    method: 'increment',
    result: {
      ok: true
    },
    sliceKey: 'counter'
  });
  store.setState({
    count: 2
  });
  expect(customLogger.trace).toHaveBeenCalled();
  expect(customLogger.group).toHaveBeenCalled();
  expect(customLogger.log).toHaveBeenCalled();
});

test('covers compact mode and duplicate middleware short-circuit', async () => {
  vi.resetModules();
  const { logger } = await import('../src/logger');
  const customLogger = createCustomLogger();
  const store = createFakeStore();
  const middleware = logger({
    logger: customLogger as any,
    verbose: false,
    serialized: false,
    stackTrace: false,
    collapsed: true
  });
  middleware(store as any);
  middleware(store as any);
  store.apply({
    count: 2
  });
  store.apply(
    {
      count: 3
    },
    [
      {
        op: 'replace',
        path: ['count'],
        value: 3
      }
    ]
  );
  store.trace?.({
    id: 'compact-id',
    method: 'set'
  });
  store.trace?.({
    id: 'compact-id',
    method: 'set',
    result: 1
  });
  store.setState({
    count: 4
  });
  expect(customLogger.groupCollapsed).toHaveBeenCalledTimes(1);
});

test('closes action log group when setState throws', async () => {
  vi.resetModules();
  const { logger } = await import('../src/logger');
  const customLogger = createCustomLogger();
  const store = createFakeStore();
  store.setState = () => {
    throw new Error('setState failed');
  };

  logger({
    logger: customLogger as any,
    collapsed: false
  })(store as any);

  expect(() => {
    store.setState({
      count: 1
    });
  }).toThrow('setState failed');
  expect(customLogger.group).toHaveBeenCalledTimes(1);
  expect(customLogger.groupEnd).toHaveBeenCalledTimes(1);
});

test('uses Date timer fallback when performance is unavailable', async () => {
  vi.resetModules();
  vi.stubGlobal('performance', undefined);
  const { timer } = await import('../src/logger');
  expect(timer).toBe(Date);
});
