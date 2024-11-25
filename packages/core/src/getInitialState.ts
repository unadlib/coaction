import { bindSymbol } from './constant';
import type { ISlices, Slice, Store } from './interface';

export const getInitialState = (store: Store<any>, createState: any) => {
  const makeState = (fn: (...args: any[]) => any) => {
    // make sure createState is a function
    if (process.env.NODE_ENV !== 'production' && typeof fn !== 'function') {
      throw new Error('createState should be a function');
    }
    let state = fn(store.setState, store.getState, store);
    if (typeof state === 'function') {
      state = state();
    }
    if (state[bindSymbol]) {
      const rawState = state[bindSymbol].bind(state);
      state[bindSymbol].handleStore(store, rawState, state);
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
