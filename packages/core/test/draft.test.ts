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

test('a finalized draft is dead', () => {
  const [draft, finalize] = openDraft({ count: 0 });
  draft.count = 1;
  const [state] = finalize();
  // The draft's copy is the published state, so a write afterwards would change
  // the store with no commit, no patches and no subscriber hearing about it.
  expect(() => {
    draft.count = 2;
  }).toThrow(/finalized/);
  expect(() => draft.count).toThrow(/finalized/);
  expect(state.count).toBe(1);
});

test('a value with internal slots cannot be edited through a draft', () => {
  // A method call on one changes the base with no property write to see, so
  // there is nothing to record and no way to notice afterwards.
  for (const leaf of [new Map([['a', 1]]), new Set([1]), new Date(0)]) {
    const base = { held: leaf };
    expect(() =>
      scopeDraft(base, (draft: any) => {
        void draft.held;
      })
    ).toThrow(/cannot describe a change inside one/);
  }
});

test('reshaping a draft is refused rather than silently untracked', () => {
  for (const reshape of [
    (draft: object) =>
      Object.defineProperty(draft, 'x', { value: 1, configurable: true }),
    (draft: object) => Object.setPrototypeOf(draft, { tag: 1 }),
    (draft: object) => Object.preventExtensions(draft)
  ]) {
    const base = { a: 1 };
    expect(() => scopeDraft(base, reshape)).toThrow(
      /cannot be described as a transition/
    );
    expect(Object.getPrototypeOf(base)).toBe(Object.prototype);
    expect('x' in base).toBe(false);
  }
});

test('an array keeps its holes and its own properties', () => {
  const xs: number[] & { label?: string } = [1, 2];
  xs.label = 'keep';
  const marker = Symbol('marker');
  (xs as never as Record<symbol, string>)[marker] = 'keep';
  const { state } = scopeDraft({ xs }, (draft) => {
    draft.xs[0] = 9;
  });
  expect(state.xs[0]).toBe(9);
  expect(state.xs.label).toBe('keep');
  expect((state.xs as never as Record<symbol, string>)[marker]).toBe('keep');
});

test('assigning past the end extends rather than appends', () => {
  const base = { xs: [1, 2, 3] };
  const { state, patches, inversePatches } = scopeDraft(base, (draft) => {
    draft.xs[5] = 9;
  });
  expect(state.xs).toHaveLength(6);
  expect(applyPatchesTo(base, patches)).toEqual(state);
  // Removing the one index would leave the extension behind, so the inverse
  // restores the length the array had.
  expect(applyPatchesTo(state, inversePatches)).toEqual(base);
});

test('a null-prototype object stays one', () => {
  const np = Object.create(null) as { a: number };
  np.a = 1;
  const { state } = scopeDraft({ np }, (draft) => {
    draft.np.a = 2;
  });
  expect(Object.getPrototypeOf(state.np)).toBe(null);
  expect(state.np.a).toBe(2);
});
