#!/usr/bin/env node
/** GC ownership check against the published runtime, including retained consumers. */
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { create, computed } from '../packages/core/dist/index.mjs';
import { derive, derivePath } from '../packages/core/dist/derived.mjs';

assert.equal(typeof global.gc, 'function', 'Run with node --expose-gc');

// Separate closures: a test consumer must not accidentally capture the setup
// function's store/token variables and become the reason they stay reachable.
const select = (token) => (state) => ({ value: state.user.n + token.offset });
const compare = (token) => (a, b) => a.value + token.offset === b.value;
const fail = (error) => () => {
  throw error;
};
const consume = (read) =>
  computed(() => {
    try {
      return read().value;
    } catch {
      return 0;
    }
  });

const setup = (mode) => {
  const store = create({ user: { n: 1 } });
  const selectorToken = { offset: 0 };
  const comparatorToken = { offset: 0 };
  const failure = { payload: new Array(1000).fill('retained error') };
  const read =
    mode === 'path'
      ? derivePath(store, ['user'])
      : derive(
          store,
          mode === 'error' ? fail(failure) : select(selectorToken),
          { deep: true, equals: compare(comparatorToken) }
        );
  const parent = consume(read);
  const references = [
    store.getState().user,
    selectorToken,
    comparatorToken,
    failure
  ].map((value) => new WeakRef(value));
  if (mode !== 'unread') {
    parent();
    if (mode !== 'error') references.push(new WeakRef(read()));
  }
  if (mode === 'destroy') store.destroy();
  else read.dispose();
  return { mode, read, parent, references };
};

const held = ['destroy', 'dispose', 'unread', 'error', 'path'].map(setup);
// End the allocation job before collection; deref() itself keeps a target alive
// for its current job, so only inspect the WeakRefs after all collection turns.
for (let i = 0; i < 20; i++) {
  await setImmediate();
  global.gc();
}
for (const { mode, read, parent, references } of held) {
  assert.equal(typeof parent, 'function');
  assert.throws(() => read(), /disposed/);
  read.dispose();
  assert.ok(
    references.every((reference) => reference.deref() === undefined),
    `${mode}: disposed handle retains its owner, callback or cached result`
  );
}
console.log(
  'Derived disposal releases owners, callbacks and cached results, even with retained handles/consumers.'
);
