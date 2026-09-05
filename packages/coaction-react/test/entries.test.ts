import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { create as createDefault } from '../src/index';
import { create as createShared } from '../src/shared';

type EntryState = {
  user: { name: string };
  count: number;
  rename: (name: string) => void;
  increment: () => void;
};

const entryState = (set: any) =>
  ({
    user: { name: 'Michael' },
    count: 0,
    rename(name: string) {
      set(() => {
        (this as EntryState).user.name = name;
      });
    },
    increment() {
      set(() => {
        (this as EntryState).count += 1;
      });
    }
  }) as EntryState;

// The local and shared entries are separate published builds. Bundle isolation
// is checked by scripts/check-react-entry-isolation.mjs; these cover that each
// one still produces a working store and a path-tracked hook.
const assertEntryBehaviour = (
  label: string,
  useStore: { (selector: (state: EntryState) => string): string } & {
    getState: () => EntryState;
    destroy: () => void;
  }
) => {
  let renders = 0;
  const Name = () => {
    renders += 1;
    const name = useStore((state) => state.user.name);
    return React.createElement('span', { 'data-testid': label }, name);
  };

  render(React.createElement(Name) as any);
  expect(screen.getByTestId(label).textContent).toBe('Michael');

  // An unrelated path must not re-render a tracked selector.
  const before = renders;
  act(() => useStore.getState().increment());
  expect(renders).toBe(before);

  act(() => useStore.getState().rename('Lin'));
  expect(screen.getByTestId(label).textContent).toBe('Lin');
  expect(renders).toBeGreaterThan(before);

  useStore.destroy();
};

test('@coaction/react drives a component through its selector', () => {
  assertEntryBehaviour('default-name', createDefault(entryState) as any);
});

test('@coaction/react/shared drives a component through its selector', () => {
  assertEntryBehaviour('shared-name', createShared(entryState) as any);
});

test('a wrapper the selector reuses does not hide a change inside it', () => {
  const useStore = createDefault(
    (set: any) =>
      ({
        user: { name: 'Michael' },
        rename(name: string) {
          set(() => {
            (this as any).user.name = name;
          });
        }
      }) as any
  ) as any;
  // The selector returns the same object every time, so reference equality can
  // never report the change; only the carried state value's version can.
  const wrapper = { user: null as any };
  const App = () => {
    const held = useStore((state: any) => {
      wrapper.user = state.user;
      return wrapper;
    });
    return React.createElement(
      'span',
      { 'data-testid': 'wrapped' },
      held.user.name
    );
  };
  render(React.createElement(App));
  expect(screen.getByTestId('wrapped').textContent).toBe('Michael');
  act(() => {
    useStore.getState().rename('Lin');
  });
  expect(screen.getByTestId('wrapped').textContent).toBe('Lin');
  useStore.destroy();
});

test('a reused wrapper that swaps which state object it carries re-renders', () => {
  const useStore = createDefault(
    (set: any) =>
      ({
        useA: true,
        userA: { name: 'Ann' },
        userB: { name: 'Bo' },
        toggle() {
          set(() => {
            (this as any).useA = !(this as any).useA;
          });
        }
      }) as any
  ) as any;
  // Neither user has ever been written to, so both have the same version. Only
  // identity separates them.
  const wrapper = { user: null as any };
  const App = () => {
    const held = useStore((state: any) => {
      wrapper.user = state.useA ? state.userA : state.userB;
      return wrapper;
    });
    return React.createElement(
      'span',
      { 'data-testid': 'swapped' },
      held.user.name
    );
  };
  render(React.createElement(App));
  expect(screen.getByTestId('swapped').textContent).toBe('Ann');
  act(() => {
    useStore.getState().toggle();
  });
  expect(screen.getByTestId('swapped').textContent).toBe('Bo');
  useStore.destroy();
});
