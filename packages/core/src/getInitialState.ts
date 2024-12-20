import { bindSymbol } from './constant';
import type { CreateState, ISlices, Slice, Store } from './interface';
import { Internal } from './internal';

export const getInitialState = <T extends CreateState>(
  store: Store<T>,
  createState: any,
  internal: Internal<T>
) => {
  const makeState = (fn: (...args: any[]) => any) => {
    // make sure createState is a function
    if (process.env.NODE_ENV !== 'production' && typeof fn !== 'function') {
      throw new Error('createState should be a function');
    }
    let state = fn(store.setState, store.getState, store);
    // support 3rd party library store like zustand, pinia
    if (state.getState) {
      state = state.getState();
    } else if (typeof state === 'function') {
      state = state();
    }
    // support bind store like mobx
    if (state[bindSymbol]) {
      const rawState = state[bindSymbol].bind(state);
      state[bindSymbol].handleStore(store, rawState, state, internal);
      return rawState;
    }
    return state;
  };
  return store.isSliceStore
    ? Object.entries(createState).reduce(
        (stateTree, [key, value]) =>
          Object.assign(stateTree, { [key]: makeState(value as Slice<any>) }),
        {} as ISlices<Slice<any>>
      )
    : makeState(createState as Slice<any>);
};
