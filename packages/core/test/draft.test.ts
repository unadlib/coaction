import { create as createWithMutative } from 'mutative';
import { applyPatchesTo } from '../src/applyPatch';
import { scopeDraft, openDraft, isCoactionDraft } from '../src/draft';
import type { Patches } from '../src/patch';

/**
 * The invariant, not the exact patches: the recipe has to reach the same state,
 * the patches have to describe getting there, and the inverse has to come back.
 * Mutative is the reference for the state; the patches are checked by applying
 * them, since two producers can describe one transition differently.
 */
const behavesLike = <T extends object>(
  base: T,
  recipe: (draft: any) => void
) => {
  const mine = scopeDraft(base, recipe as never);
  const [theirs] = createWithMutative(base, recipe as never, {
    enablePatches: true
  }) as [T, Patches, Patches];

  expect(mine.state).toEqual(theirs);
  expect(applyPatchesTo(base, mine.patches)).toEqual(mine.state);
  expect(applyPatchesTo(mine.state, mine.inversePatches)).toEqual(base);
  return mine;
};

test('writing a field', () => {
  behavesLike({ count: 0 }, (d) => {
    d.count = 1;
  });
});

test('writing through nesting', () => {
  behavesLike({ user: { name: 'Michael', age: 1 } }, (d) => {
    d.user.name = 'Lin';
  });
});

test('adding and deleting keys', () => {
  behavesLike({ a: 1 } as Record<string, number>, (d) => {
    d.b = 2;
  });
  behavesLike({ a: 1, b: 2 } as Record<string, number>, (d) => {
    delete d.b;
  });
});

test('array element, push, pop and splice', () => {
  behavesLike({ xs: [1, 2, 3] }, (d) => {
    d.xs[1] = 9;
  });
  behavesLike({ xs: [1, 2, 3] }, (d) => {
    d.xs.push(4);
  });
  behavesLike({ xs: [1, 2, 3] }, (d) => {
    d.xs.pop();
  });
  behavesLike({ xs: [{ id: 'a' }, { id: 'b' }] }, (d) => {
    d.xs[0].id = 'z';
  });
});

test('several writes in one recipe', () => {
  behavesLike({ a: 1, nested: { b: 2, deep: { c: 3 } } }, (d) => {
    d.a = 10;
    d.nested.b = 20;
    d.nested.deep.c = 30;
  });
});

test('a write that changes nothing produces no patches', () => {
  const result = behavesLike({ a: 1 }, (d) => {
    d.a = 1;
  });
  expect(result.patches).toEqual([]);
  expect(result.state).toEqual({ a: 1 });
});

test('untouched branches keep their identity', () => {
  const base = { user: { name: 'Michael' }, settings: { theme: 'dark' } };
  const { state } = scopeDraft(base, (draft) => {
    draft.user.name = 'Lin';
  });
  expect(state).not.toBe(base);
  expect(state.user).not.toBe(base.user);
  expect(state.settings).toBe(base.settings);
  expect(base.user.name).toBe('Michael');
});

test('reading without writing returns the base untouched', () => {
  const base = { a: { b: 1 } };
  const { state, patches } = scopeDraft(base, (draft) => {
    void draft.a.b;
  });
  expect(state).toBe(base);
  expect(patches).toEqual([]);
});

test('a draft is recognisable and can be finalized later', () => {
  const [draft, finalize] = openDraft({ count: 0 });
  expect(isCoactionDraft(draft)).toBe(true);
  expect(isCoactionDraft({ count: 0 })).toBe(false);
  draft.count = 5;
  const [state, patches] = finalize();
  expect(state).toEqual({ count: 5 });
  expect(patches).toHaveLength(1);
});

test('assigning a draft value unwraps it', () => {
  const base = { a: { v: 1 }, b: null as unknown };
  const { state } = scopeDraft(base, (draft: any) => {
    draft.a.v = 2;
    draft.b = draft.a;
  });
  expect(isCoactionDraft((state as any).b)).toBe(false);
  expect((state as any).b).toEqual({ v: 2 });
});
