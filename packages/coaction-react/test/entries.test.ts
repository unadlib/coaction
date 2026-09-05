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
