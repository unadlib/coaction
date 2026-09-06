import { create } from 'coaction';
import { makeAutoObservable } from 'mobx';
import { bindMobx } from '../../coaction-mobx/src';
import { history } from '../src';

/**
 * History is the commit stream, kept. Undo walks it backwards, so a transition
 * missing from the stream is a transition undo walks straight past -- and the
 * state it leaves behind is one the user never asked for and cannot get out of.
 *
 * Undoing everything therefore has to arrive back at the state the store
 * started in, whatever shape the writes were made in. That is a stronger claim
 * than any single undo assertion, and it is the one that failed while writes
 * were escaping into the mutable instance without a commit.
 */
const buildStore = () => {
  const waiting: Array<() => void> = [];
  const gate = () =>
    new Promise<void>((resolve) => {
      waiting.push(resolve);
    });
  const store = create<{
    n: number;
    step: () => void;
    nested: () => void;
    suspend: () => Promise<void>;
  }>(
    () =>
      makeAutoObservable(
        bindMobx({
          n: 0,
          step() {
            this.n += 1;
          },
          nested() {
            this.n += 10;
            this.step();
            this.n += 10;
          },
          async suspend() {
            this.n += 100;
            await gate();
            this.n += 100;
          }
        })
      ),
    { middlewares: [history()] }
  );
  return { store, release: () => waiting.splice(0).forEach((go) => go()) };
};

test('undoing everything returns to the state the store started in', async () => {
  const { store, release } = buildStore();
  const api = (store as never as { history: any }).history;

  store.getState().step();
  store.getState().nested();
  // The shape that used to lose a write: an async action interrupted by one
  // that finishes inside its await.
  const pending = store.getState().suspend();
  await Promise.resolve();
  store.getState().nested();
  release();
  await pending;

  const final = store.getState().n;
  expect(final).toBe(243);

  let guard = 0;
  while (api.canUndo()) {
    expect(api.undo()).toBeTruthy();
    if (++guard > 50) throw new Error('undo did not terminate');
  }
  expect(store.getState().n).toBe(0);

  guard = 0;
  while (api.canRedo()) {
    expect(api.redo()).toBeTruthy();
    if (++guard > 50) throw new Error('redo did not terminate');
  }
  expect(store.getState().n).toBe(final);
  store.destroy();
});
