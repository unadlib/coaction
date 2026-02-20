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
