import { create } from 'coaction';
import type { Patches } from 'coaction/adapter';
import { expect, test, vi } from 'vitest';

type Entry = {
  patches: Patches;
  inversePatches: Patches;
};

const controlledCalls = vi.hoisted(() => ({
  recordPatches: vi.fn()
}));

vi.mock('travels', async (importOriginal) => {
  const original = await importOriginal<typeof import('travels')>();
  return {
    ...original,
    createTravelJournal<T extends object>(
      initialState: T,
      options: {
        apply: (transition: Entry & { state: T }) => T;
        maxHistory: number;
      }
    ) {
      let state = initialState;
      let entries: Entry[] = [];
      let position = 0;
      return {
        back() {
          const entry = entries[position - 1];
          if (!entry) return;
          state = options.apply({
            state,
            patches: entry.inversePatches,
            inversePatches: entry.patches
          });
          position -= 1;
        },
        forward() {
          const entry = entries[position];
          if (!entry) return;
          state = options.apply({ state, ...entry });
          position += 1;
        },
        canBack: () => position > 0,
        canForward: () => position < entries.length,
        getHistoryEntries: () => entries,
        getPosition: () => position,
        getState: () => state,
        rebase() {
          entries = [];
          position = 0;
        },
        recordPatches(nextState: T, entry: Entry) {
          controlledCalls.recordPatches(nextState, entry);
          entries = entries.slice(0, position);
          entries.push(entry);
          if (entries.length > options.maxHistory) {
            entries.shift();
          }
          position = entries.length;
          state = nextState;
        }
      };
    }
  };
});

import { history } from '../src';

test('partialized commits use patches with a restricted controlled journal', () => {
  controlledCalls.recordPatches.mockClear();
  const store = create(
    (set) => ({
      count: 0,
      label: 'initial',
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      },
      rename(label: string) {
        set({ label });
      }
    }),
    {
      middlewares: [
        history({
          partialize: (state) => ({ count: state.count })
        })
      ]
    }
  );
  const api = (store as any).history;

  store.getState().increment();
  store.getState().rename('changed');

  expect(controlledCalls.recordPatches).toHaveBeenCalledTimes(1);
  expect(api.getPatches()).toMatchObject({ position: 1 });
  expect(api.undo()).toBe(true);
  expect(store.getState()).toMatchObject({ count: 0, label: 'changed' });
  expect(api.redo()).toBe(true);
  expect(store.getState()).toMatchObject({ count: 1, label: 'changed' });
});
