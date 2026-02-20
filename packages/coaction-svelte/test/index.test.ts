import { create } from '../src';

test('supports svelte subscribe contract', () => {
  const store = create<{
    count: number;
    increment: () => void;
  }>((set) => ({
    count: 0,
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }));

  const calls: number[] = [];
  const unsubscribe = store.subscribe((state: { count: number }) => {
    calls.push(state.count);
  });

  store.getState().increment();
  store.getState().increment();
  unsubscribe();

  expect(calls).toMatchInlineSnapshot(`
[
  0,
  1,
  2,
]
`);
});

test('preserves coaction listener subscribe', () => {
  const store = create<{
    count: number;
    increment: () => void;
  }>((set) => ({
    count: 0,
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }));

  const listener = jest.fn();
  const unsubscribe = store.subscribe(() => {
    listener();
  });
  store.getState().increment();
  unsubscribe();

  expect(listener).toHaveBeenCalledTimes(1);
});

test('supports selector readable', () => {
  const store = create<{
    count: number;
    increment: () => void;
  }>((set) => ({
    count: 0,
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }));

  const selectedValues: number[] = [];
  const count = store((state) => state.count);
  const unsubscribe = count.subscribe((value) => {
    selectedValues.push(value);
  });

  store.getState().increment();
  unsubscribe();

  expect(selectedValues).toMatchInlineSnapshot(`
[
  0,
  1,
]
`);
});

test('calls invalidate callback for svelte subscribe signature', () => {
  const store = create<{
    count: number;
    increment: () => void;
  }>((set) => ({
    count: 0,
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }));

  const values: number[] = [];
  const invalidates: number[] = [];
  const unsubscribe = store.subscribe(
    (state: { count: number }) => {
      values.push(state.count);
    },
    () => {
      invalidates.push(1);
    }
  );

  store.getState().increment();
  unsubscribe();

  expect(values).toMatchInlineSnapshot(`
[
  0,
  1,
]
`);
  expect(invalidates).toMatchInlineSnapshot(`
[
  1,
]
`);
});

test('returns plain state when called without selector', () => {
  const store = create<{
    count: number;
  }>(() => ({
    count: 3
  }));
  expect(store()).toMatchInlineSnapshot(`
{
  "count": 3,
}
`);
});
