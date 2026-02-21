import { create } from 'coaction';
import {
  adapt,
  bindRedux,
  configureStore,
  createSlice,
  withCoactionReducer
} from '@coaction/redux';

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

export const runExample = () => {
  const reduxStore = configureStore({
    reducer: withCoactionReducer(counterSlice.reducer)
  });

  const store = create(() => adapt(bindRedux(reduxStore)), {
    name: 'redux-example'
  });

  store.getState().dispatch(counterSlice.actions.increment());
  const result = {
    count: store.getState().count
  };
  store.destroy();

  return result;
};
