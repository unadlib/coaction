import { bindSymbol } from './constant';
import type { CreateState, ISlices, Slice, Store } from './interface';
import { Internal } from './internal';

export const getInitialState = <T extends CreateState>(
  store: Store<T>,
  createState: any,
  internal: Internal<T>
) => {
  const makeState = (
    /**
     * createState is a function to create the state object.
     */
    createState: (
      setState: (state: any) => void,
      getState: () => any,
      store: Store<T>
    ) => any,
    /**
     * the key of the slice state object.
     */
    key?: string
  ) => {
    // make sure createState is a function
    if (
      process.env.NODE_ENV !== 'production' &&
      typeof createState !== 'function'
    ) {
      throw new Error('createState should be a function');
    }
    let state = createState(store.setState, store.getState, store);
    // support 3rd party library store like zustand, redux
    if (state.getState) {
      state = state.getState();
      // support 3rd party library store like pinia
    } else if (typeof state === 'function') {
      state = state();
    }
    // support bind store like mobx
    if (state[bindSymbol]) {
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
    : makeState(createState as Slice<any>);
};
