import { create } from 'coaction';
import { derive, derivePath } from 'coaction/derived';
import { history } from '../src';

test('derived reads follow history undo and redo without entering state history', () => {
  const store = create({ user: { n: 1 } }, { middlewares: [history()] });
  const n = derivePath(store, ['user', 'n']);
  const doubled = derive(store, (s) => s.user.n * 2, { deep: true });
  const api = (
    store as unknown as { history: { undo(): boolean; redo(): boolean } }
  ).history;
  expect(doubled()).toBe(2);
  store.setState((s) => {
    s.user.n = 3;
  });
  expect(n()).toBe(3);
  expect(doubled()).toBe(6);
  expect(api.undo()).toBe(true);
  expect(n()).toBe(1);
  expect(doubled()).toBe(2);
  expect(api.redo()).toBe(true);
  expect(doubled()).toBe(6);
  expect(Object.keys(store.getPureState())).toEqual(['user']);
  store.destroy();
});
