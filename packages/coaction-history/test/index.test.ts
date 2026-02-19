import { create } from 'coaction';
import { history } from '../src';

test('undo and redo', () => {
  const useStore = create(
    (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      }
    }),
    {
      middlewares: [history()]
    }
  );
  const api = (useStore as any).history;
  useStore.getState().increment();
  useStore.getState().increment();
  expect(useStore.getState().count).toBe(2);
  expect(api.canUndo()).toBeTruthy();
  expect(api.undo()).toBeTruthy();
  expect(useStore.getState().count).toBe(1);
  expect(api.undo()).toBeTruthy();
  expect(useStore.getState().count).toBe(0);
  expect(api.undo()).toBeFalsy();
  expect(api.canRedo()).toBeTruthy();
  expect(api.redo()).toBeTruthy();
  expect(useStore.getState().count).toBe(1);
});

test('respects history limit', () => {
  const useStore = create(
    (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      }
    }),
    {
      middlewares: [
        history({
          limit: 1
        })
      ]
    }
  );
  const api = (useStore as any).history;
  useStore.getState().increment();
  useStore.getState().increment();
  useStore.getState().increment();
  expect(useStore.getState().count).toBe(3);
  expect(api.getPast()).toHaveLength(1);
  expect(api.undo()).toBeTruthy();
  expect(useStore.getState().count).toBe(2);
  expect(api.undo()).toBeFalsy();
});

test('clear history and partialize', () => {
  const useStore = create(
    (set) => ({
      count: 0,
      name: 'coaction',
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      },
      rename(name: string) {
        set({
          name
        });
      }
    }),
    {
      middlewares: [
        history({
          partialize: (state) => ({
            count: state.count
          })
        })
      ]
    }
  );
  const api = (useStore as any).history;
  useStore.getState().increment();
  useStore.getState().rename('next');
  expect(useStore.getState().count).toBe(1);
  expect(useStore.getState().name).toBe('next');
  // name change is ignored because of partialize.
  expect(api.getPast()).toHaveLength(1);
  api.clear();
  expect(api.canUndo()).toBeFalsy();
  expect(api.getPast()).toHaveLength(0);
  expect(api.getFuture()).toHaveLength(0);
});
