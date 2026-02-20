import { create, Slices } from 'coaction';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import {
  adapt,
  bindRedux,
  replaceStateAction,
  withCoactionReducer
} from '../src';

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

test('replace action strips nested functions from payload', () => {
  const reducer = withCoactionReducer((state = {} as any) => state);
  const next = reducer(
    undefined,
    replaceStateAction({
      items: [
        {
          count: 1,
          toText() {
            return String(this.count);
          }
        }
      ],
      nested: {
        value: 2,
        fn() {
          return this.value;
        }
      },
      callback: () => {}
    } as any)
  ) as any;
  expect(next).toMatchInlineSnapshot(`
{
  "items": [
    {
      "count": 1,
    },
  ],
  "nested": {
    "value": 2,
  },
}
`);
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
    }).toThrow(
      'Third-party state binding does not support Slices mode. Please inject a whole store instead.'
    );
  });
});
