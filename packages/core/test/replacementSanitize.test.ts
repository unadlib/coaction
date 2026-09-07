import { create } from '../index';
import {
  applyPatches,
  onStoreCommit,
  type StoreCommit
} from 'coaction/adapter';

test.each([false, true])(
  'replacement preserves local array shape and input isolation (observed: %s)',
  (observed) => {
    const store = create<{ items: unknown[] }>(() => ({ items: [] }));
    const before = store.getPureState();
    const commits: StoreCommit[] = [];
    if (observed) onStoreCommit(store, (commit) => commits.push(commit));
    const symbol = Symbol('extra');
    const hidden = Symbol('hidden');
    const value = { count: 1 };
    const fn = () => 1;
    const input = new Array(4) as unknown[] & Record<PropertyKey, unknown>;
    Object.defineProperty(input, '0', { value, enumerable: false });
    input[2] = fn;
    input[symbol] = value;
    input.self = input;
    input.method = fn;
    Object.defineProperty(input, hidden, { value });
    Object.defineProperty(input, 'secret', { value });
    Object.defineProperty(input, '__proto__', {
      enumerable: true,
      get() {
        throw new Error('unsafe value read');
      }
    });
    store.setState({ items: input });
    const result = store.getPureState().items as typeof input;
    expect(result).toHaveLength(4);
    expect(1 in result).toBe(false);
    expect(3 in result).toBe(false);
    expect(result[0]).toEqual(value);
    expect(result[0]).not.toBe(value);
    expect(result[2]).toBe(fn);
    expect(result[symbol]).toBe(result[0]);
    expect(result.self).toBe(result);
    for (const key of ['method', 'secret', '__proto__', hidden]) {
      expect(Object.prototype.hasOwnProperty.call(result, key)).toBe(false);
    }
    value.count = 9;
    expect(result[0]).toEqual({ count: 1 });
    expect(Object.isFrozen(value)).toBe(false);
    if (observed) {
      expect(commits).toHaveLength(1);
      const replayed = applyPatches(before, commits[0].patches)
        .items as typeof input;
      expect(replayed[symbol]).toBe(replayed[0]);
      expect(replayed.self).toBe(replayed);
      expect(
        applyPatches(store.getPureState(), commits[0].inversePatches)
      ).toEqual(before);
    }
  }
);
