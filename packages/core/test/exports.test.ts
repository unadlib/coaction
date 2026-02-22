import * as core from '../src';
import { create } from '../src/create';
import { createBinder } from '../src/binder';
import { wrapStore } from '../src/wrapStore';

test('re-exports runtime APIs from package entry', () => {
  expect(core.create).toBe(create);
  expect(core.createBinder).toBe(createBinder);
  expect(core.wrapStore).toBe(wrapStore);
});
