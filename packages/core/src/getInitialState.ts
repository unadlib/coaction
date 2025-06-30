import { bindSymbol } from './constant';
import type { CreateState, ISlices, Slice, Store } from './interface';
import { Internal } from './internal';

export const getInitialState = <T extends CreateState>(
  store: Store<T>,
  createState: any,
  internal: Internal<T>
) => {
  const makeState = (
    stateOrFn: ((setState: any, getState: any, store: Store<T>) => any) | object,
    key?: string
  ) => {
    let state: any; // Initialize state
    if (typeof stateOrFn === 'function') {
      // It's a slice creator function or a function returning state
      state = stateOrFn(store.setState, store.getState, store);
    } else if (typeof stateOrFn === 'object' && stateOrFn !== null) {
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
    if (state && typeof state.getState === 'function') { // Add null/undefined check for state
      state = state.getState();
      // support 3rd party library store like pinia
    } else if (typeof state === 'function') {
      // This was for when a slice function returns another function (e.g. Pinia setup store).
      // If stateOrFn was an object, and that object is itself a function, this would call it.
      state = state();
    }
    // support bind store like mobx
    if (state && state[bindSymbol]) { // Add null/undefined check for state
      const rawState = state[bindSymbol].bind(state);
      state[bindSymbol].handleStore(store, rawState, state, internal, key);
      delete state[bindSymbol];
      return rawState;
    }
    return state;
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
