import { bindSymbol } from './constant';
import type { CreateState, ISlices, Slice, Store } from './interface';
import { Internal } from './internal';

type StateFactory<T extends CreateState> = (
  setState: Store<T>['setState'],
  getState: Store<T>['getState'],
  store: Store<T>
) => unknown;

type StoreWithGetState = {
  getState: () => unknown;
};

type BoundState = {
  [bindSymbol]?: {
    bind: (state: object) => object;
    handleStore: (
      store: Store<object>,
      rawState: object,
      state: object,
      internal: Internal<object>,
      key?: string
    ) => void;
  };
};

const isObject = (value: unknown): value is object =>
  typeof value === 'object' && value !== null;

const isStateFactory = <T extends CreateState>(
  value: unknown
): value is StateFactory<T> => typeof value === 'function';

const hasGetState = (value: unknown): value is StoreWithGetState =>
  (typeof value === 'object' || typeof value === 'function') &&
  value !== null &&
  typeof (value as StoreWithGetState).getState === 'function';

const hasBindState = (value: unknown): value is object & BoundState =>
  isObject(value) && !!(value as BoundState)[bindSymbol];

export const getInitialState = <T extends CreateState>(
  store: Store<T>,
  createState: Slice<T> | T,
  internal: Internal<T>
) => {
  const makeState = (stateOrFn: StateFactory<T> | object, key?: string) => {
    let state: unknown;
    if (isStateFactory<T>(stateOrFn)) {
      // It's a slice creator function or a function returning state
      state = stateOrFn(store.setState, store.getState, store);
    } else if (isObject(stateOrFn)) {
      // It's a pre-existing object, potentially a third-party store instance or plain data
      state = stateOrFn;
    } else {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(
          `Invalid state value encountered in makeState: ${key ? `for key ${key}, ` : ''}${typeof stateOrFn}`
        );
      }
      return {}; // Return empty object or handle error appropriately
    }

    // Preserve existing logic for unwrapping/handling state:
    // support 3rd party library store like zustand, redux
    if (hasGetState(state)) {
      state = state.getState();
      // support 3rd party library store like pinia
    } else if (typeof state === 'function') {
      // This was for when a slice function returns another function (e.g. Pinia setup store).
      // If stateOrFn was an object, and that object is itself a function, this would call it.
      state = state();
    }
    // support bind store like mobx
    if (hasBindState(state)) {
      if (store.isSliceStore) {
        throw new Error(
          'Third-party state binding does not support Slices mode. Please inject a whole store instead.'
        );
      }
      const rawState = state[bindSymbol].bind(state);
      state[bindSymbol].handleStore(
        store as unknown as Store<object>,
        rawState,
        state,
        internal as unknown as Internal<object>,
        key
      );
      delete state[bindSymbol];
      return rawState;
    }
    return state as object;
  };
  return store.isSliceStore
    ? Object.entries(createState).reduce(
        (stateTree, [key, value]) =>
          Object.assign(stateTree, {
            [key]: makeState(value as Slice<any>, key)
          }),
        {} as ISlices<Slice<any>>
      )
    : makeState(createState as Slice<any> | object);
};
