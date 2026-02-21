import { create } from 'coaction';
import { history } from '@coaction/history';

type CounterState = {
  count: number;
  increment: () => void;
};

type HistoryApi = {
  undo: () => boolean;
  redo: () => boolean;
  canUndo: () => boolean;
  canRedo: () => boolean;
};

export const runExample = () => {
  const store = create<CounterState>(
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

  const api = (store as unknown as { history: HistoryApi }).history;
  store.getState().increment();
  store.getState().increment();

  const afterIncrement = store.getState().count;
  const undone = api.undo();
  const afterUndo = store.getState().count;
  const redone = api.redo();
  const afterRedo = store.getState().count;

  store.destroy();

  return {
    afterIncrement,
    undone,
    afterUndo,
    redone,
    afterRedo,
    canUndo: api.canUndo(),
    canRedo: api.canRedo()
  };
};
