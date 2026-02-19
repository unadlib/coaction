import { create, Slices } from 'coaction';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { adapt, bindRedux, withCoactionReducer } from '../src';

test('base', () => {
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
  const reduxStore = configureStore({
    reducer: withCoactionReducer(counterSlice.reducer)
  });
  const useStore = create(() => adapt(bindRedux(reduxStore)), {
    name: 'test'
  });
  expect(useStore.getState().dispatch).toBeInstanceOf(Function);
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "count": 0,
}
`);
  useStore.getState().dispatch(counterSlice.actions.increment());
  expect(useStore.getState().count).toBe(1);
  reduxStore.dispatch(counterSlice.actions.increment());
  expect(useStore.getState().count).toBe(2);
  useStore.setState({
    count: 10
  });
  expect(useStore.getState().count).toBe(10);
  expect(reduxStore.getState().count).toBe(10);
});

describe('Slices', () => {
  test('base - unsupported', () => {
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
    const reduxStore = configureStore({
      reducer: withCoactionReducer(counterSlice.reducer)
    });
    expect(() => {
      create<{
        counter: Slices<
          {
            counter: {
              count: number;
              dispatch: typeof reduxStore.dispatch;
            };
          },
          'counter'
        >;
      }>(
        {
          counter: () => adapt(bindRedux(reduxStore))
        },
        {
          name: 'test'
        }
      );
    }).toThrowError(
      'Third-party state binding does not support Slices mode. Please inject a whole store instead.'
    );
  });
});
