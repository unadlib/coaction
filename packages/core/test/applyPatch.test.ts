import { apply as applyWithMutative } from 'mutative';
import { applyPatchesTo } from '../src/applyPatch';
import type { Patches } from '../src/patch';

/**
 * The applier replaces one that was in use, so the test that matters is
 * whether they agree. Every case runs through both.
 */
const agrees = (state: unknown, patches: Patches) => {
  const mine = applyPatchesTo(state, patches);
  const theirs = applyWithMutative(state as never, patches as never);
  expect(mine).toEqual(theirs);
  return mine;
};

const base = () => ({
  count: 0,
  user: { name: 'Michael', tags: ['a', 'b'] },
  items: [{ id: 'x' }, { id: 'y' }, { id: 'z' }],
  flags: { on: true }
});

test('replacing, adding and removing object properties', () => {
  agrees(base(), [{ op: 'replace', path: ['count'], value: 5 }]);
  agrees(base(), [{ op: 'replace', path: ['user', 'name'], value: 'Lin' }]);
  agrees(base(), [{ op: 'add', path: ['flags', 'off'], value: false }]);
  agrees(base(), [{ op: 'remove', path: ['flags', 'on'] }]);
});

test('array insert, remove and replace shift the entries after them', () => {
  agrees(base(), [{ op: 'add', path: ['items', 0], value: { id: 'w' } }]);
  agrees(base(), [{ op: 'add', path: ['items', 3], value: { id: 'w' } }]);
  agrees(base(), [{ op: 'remove', path: ['items', 1] }]);
  agrees(base(), [{ op: 'replace', path: ['items', 2], value: { id: 'q' } }]);
  agrees(base(), [{ op: 'replace', path: ['user', 'tags', 0], value: 'c' }]);
});

test('a truncating length write drops the entries past it', () => {
  const next = agrees(base(), [
    { op: 'replace', path: ['items', 'length'], value: 1 }
  ]) as ReturnType<typeof base>;
  expect(next.items).toHaveLength(1);
  expect(next.items[0].id).toBe('x');
});

test('several patches apply in order', () => {
  agrees(base(), [
    { op: 'replace', path: ['count'], value: 1 },
    { op: 'add', path: ['items', 0], value: { id: 'w' } },
    { op: 'remove', path: ['items', 2] },
    { op: 'replace', path: ['user', 'name'], value: 'Lin' }
  ]);
});

test('replacing the root', () => {
  agrees(base(), [{ op: 'replace', path: [], value: { count: 9 } }]);
});

test('an RFC 6901 pointer names the same place as its array form', () => {
  const pointer = applyPatchesTo(base(), [
    { op: 'replace', path: '/user/name', value: 'Lin' }
  ]);
  const array = applyPatchesTo(base(), [
    { op: 'replace', path: ['user', 'name'], value: 'Lin' }
  ]);
  expect(pointer).toEqual(array);
});

test('untouched branches keep their identity', () => {
  const state = base();
  const next = applyPatchesTo(state, [
    { op: 'replace', path: ['user', 'name'], value: 'Lin' }
  ]);
  expect(next).not.toBe(state);
  expect(next.user).not.toBe(state.user);
  // Nothing on this path changed, so nothing about it should have been copied.
  expect(next.items).toBe(state.items);
  expect(next.flags).toBe(state.flags);
  expect(next.user.tags).toBe(state.user.tags);
});

test('an unsafe path segment is refused', () => {
  expect(() =>
    applyPatchesTo(base(), [
      { op: 'replace', path: ['__proto__', 'polluted'], value: 1 }
    ])
  ).toThrow(/Unsafe patch path/);
});

test('a batch copies each container once, not once per patch', () => {
  const size = 4000;
  const todos: Record<string, { id: string; title: string }> = {};
  for (let index = 0; index < size; index += 1) {
    todos[`id${index}`] = { id: `id${index}`, title: 'before' };
  }
  const state = { todos, elsewhere: { untouched: true } };
  const patches: Patches = Array.from({ length: size }, (_, index) => ({
    op: 'replace',
    path: ['todos', `id${index}`],
    value: { id: `id${index}`, title: 'after' }
  }));

  const started = performance.now();
  const next = applyPatchesTo(state, patches);
  const elapsed = performance.now() - started;

  expect(Object.keys(next.todos)).toHaveLength(size);
  expect(next.todos.id0.title).toBe('after');
  expect(next.todos[`id${size - 1}`].title).toBe('after');
  // Untouched branches keep their identity even across a large batch.
  expect(next.elsewhere).toBe(state.elsewhere);
  // The input is never written to.
  expect(state.todos.id0.title).toBe('before');

  // Copying the path per patch makes this quadratic: one patch per record
  // re-copies the whole collection once per record. Linear runs in single-digit
  // milliseconds here; the copy-per-patch version took several seconds. The
  // ceiling is far above the former and far below the latter.
  expect(elapsed).toBeLessThan(500);
});

test('a batch of array patches applies in order without re-copying', () => {
  const state = { items: Array.from({ length: 2000 }, (_, index) => index) };
  const patches: Patches = Array.from({ length: 2000 }, (_, index) => ({
    op: 'replace',
    path: ['items', index],
    value: index * 2
  }));
  const started = performance.now();
  const next = applyPatchesTo(state, patches);
  expect(performance.now() - started).toBeLessThan(500);
  expect(next.items[1999]).toBe(3998);
  expect(state.items[1999]).toBe(1999);
});

test('a patch cannot describe the inside of a value with internal slots', () => {
  // These keep their contents somewhere a property path cannot reach, so
  // copying one as an ordinary object produced something else entirely: a Map
  // became `{}`, a Date stopped being a Date -- all silently.
  const cases: object[] = [
    new Map([['a', 1]]),
    new Set([1]),
    new Date(0),
    new Uint8Array([1])
  ];
  for (const container of cases) {
    expect(() =>
      applyPatchesTo({ held: container }, [
        { op: 'replace', path: ['held', 'x'], value: 2 }
      ])
    ).toThrow(/cannot describe the inside of/);
  }
});

test('an object with a prototype of its own is ordinary state', () => {
  class Node {
    x = 1;
  }
  const state = { held: new Node() };
  const next = applyPatchesTo(state, [
    { op: 'replace', path: ['held', 'x'], value: 2 }
  ]);
  expect(next.held.x).toBe(2);
  expect(next.held).toBeInstanceOf(Node);
  expect(state.held.x).toBe(1);
});

test('a non-plain container can still be replaced whole', () => {
  const state = { stamp: new Date(0) };
  const next = applyPatchesTo(state, [
    { op: 'replace', path: ['stamp'], value: new Date(1000) }
  ]);
  // It is a leaf, not a container: the value goes in untouched.
  expect(next.stamp instanceof Date).toBe(true);
  expect(next.stamp.getTime()).toBe(1000);
});
