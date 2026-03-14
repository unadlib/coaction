import { expectTypeOf } from 'vitest';
import { createSlice, configureStore } from '@reduxjs/toolkit';
import { runBinderAdapterContract } from '../../core/test/binderAdapterContract';
import { adapt, bindRedux, withCoactionReducer } from '../src';

type Counter = {
  count: number;
  dispatch: (...args: any[]) => unknown;
};

const createCounterStore = () => {
  const counterSlice = createSlice({
    name: 'counter',
    initialState: {
      count: 0
    },
    reducers: {
      increment(state) {
        state.count += 1;
      }
    }
  });
  const store = configureStore({
    reducer: withCoactionReducer(counterSlice.reducer)
  });
  return {
    counterSlice,
    store
  };
};

runBinderAdapterContract({
  packageName: '@coaction/redux',
  createLocalContract: () => {
    const { counterSlice, store } = createCounterStore();
    return {
      createState: () => adapt(bindRedux(store)),
      readValue: (useStore) => useStore.getState().count,
      invokeUpdate: (useStore) =>
        useStore.getState().dispatch(counterSlice.actions.increment()),
      expectedValueAfterUpdate: 1,
      writeExternal: () => {
        store.dispatch(counterSlice.actions.increment());
      },
      expectedValueAfterExternalWrite: 2
    };
  }
});

test('type expectations', () => {
  const { store } = createCounterStore();
  expectTypeOf(adapt(bindRedux(store))).toMatchTypeOf<Counter>();
});
