import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { create } from '../src';

type Shape = {
  user: { name: string; age: number };
  other: number;
  birthday: () => void;
  touchOther: () => void;
};

const createStore = () =>
  create<Shape>((set) => ({
    user: { name: 'Michael', age: 30 },
    other: 0,
    birthday() {
      set(() => {
        this.user.age += 1;
      });
    },
    touchOther() {
      set(() => {
        this.other += 1;
      });
    }
  }));

test('an object carried out in a composite result stays a dependency', () => {
  const useStore = createStore();
  let seen: { user: { age: number }; name: string } | undefined;
  const View = () => {
    const result = useStore((state) => ({
      user: state.user,
      name: state.user.name
    }));
    seen = result;
    return React.createElement(
      'span',
      { 'data-testid': 'age' },
      String(result.user.age)
    );
  };
  render(React.createElement(View) as any);
  expect(screen.getByTestId('age').textContent).toBe('30');

  // Reading the deeper leaf must not drop `user` as a traversal-only ancestor:
  // it is part of the result, so a change inside it is a change to the result.
  act(() => useStore.getState().birthday());
  expect(seen!.user.age).toBe(31);
  expect(screen.getByTestId('age').textContent).toBe('31');
  useStore.destroy();
});

test('a composite result still ignores unrelated paths', () => {
  const useStore = createStore();
  let selectorRuns = 0;
  const View = () => {
    useStore((state) => {
      selectorRuns += 1;
      return { user: state.user, name: state.user.name };
    });
    return null;
  };
  render(React.createElement(View) as any);
  const before = selectorRuns;

  act(() => useStore.getState().touchOther());
  expect(selectorRuns).toBe(before);
  useStore.destroy();
});

test('state objects nested in arrays and deeper wrappers are tracked too', () => {
  const useStore = createStore();
  let seen: any;
  const View = () => {
    const result = useStore((state) => ({
      rows: [{ entry: state.user }],
      label: state.user.name
    }));
    seen = result;
    return React.createElement(
      'span',
      { 'data-testid': 'nested' },
      String(result.rows[0].entry.age)
    );
  };
  render(React.createElement(View) as any);
  expect(screen.getByTestId('nested').textContent).toBe('30');

  act(() => useStore.getState().birthday());
  expect(seen.rows[0].entry.age).toBe(31);
  expect(screen.getByTestId('nested').textContent).toBe('31');
  useStore.destroy();
});
