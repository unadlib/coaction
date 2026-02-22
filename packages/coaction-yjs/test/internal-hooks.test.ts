import { create } from 'coaction';
import * as Y from 'yjs';
import { __unsafeTestOnly__ as yjsTestHooks, bindYjs } from '../src';

test('test hooks cover defensive path helpers', () => {
  const doc = new Y.Doc();
  const root = doc.getMap<unknown>('root');
  const list = new Y.Array<unknown>();
  list.insert(0, [1, 2]);
  root.set('list', list);
  root.set('leaf', 1);
  expect(
    yjsTestHooks.getYValueAtPath(root, ['list', 'invalid'])
  ).toBeUndefined();
  expect(yjsTestHooks.getYValueAtPath(root, ['leaf', 'deep'])).toBeUndefined();

  const target: Record<string, unknown> = {
    list: [1, 2, 3]
  };
  yjsTestHooks.setAtPath(target, [], 'noop');
  expect(target).toEqual({
    list: [1, 2, 3]
  });
  yjsTestHooks.setAtPath(target, ['missing', 0], 'created');
  expect(target).toEqual({
    list: [1, 2, 3],
    missing: ['created']
  });

  yjsTestHooks.deleteAtPath(target, []);
  expect(target).toEqual({
    list: [1, 2, 3],
    missing: ['created']
  });
  yjsTestHooks.deleteAtPath(target, ['list', 10]);
  expect(target).toEqual({
    list: [1, 2, 3],
    missing: ['created']
  });
  yjsTestHooks.deleteAtPath(target, ['list', 1]);
  expect(target).toEqual({
    list: [1, 3],
    missing: ['created']
  });
});

test('binding test hook covers empty remote operations guard', () => {
  const doc = new Y.Doc();
  const store = create((set) => ({
    count: 0
  }));
  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });
  expect(binding.__unsafeTestOnly__).toBeDefined();
  binding.__unsafeTestOnly__!.applyRemoteOperations([]);
  expect(store.getState().count).toBe(0);
  binding.destroy();
});
