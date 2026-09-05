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
  for (const leaf of [
    new Map([['a', 1]]),
    new Set([1]),
    new Date(0),
    new Uint8Array([1])
  ]) {
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

test('filling a hole and deleting an index keep the array they describe', () => {
  const holed = { xs: [1, , 3] as number[] };
  const filled = scopeDraft(holed, (draft) => {
    draft.xs[1] = 2;
  });
  // `add` at an index means "insert here", which would make this four long.
  expect(filled.state.xs).toHaveLength(3);
  expect(applyPatchesTo(holed, filled.patches)).toEqual(filled.state);
  expect(applyPatchesTo(filled.state, filled.inversePatches)).toEqual(holed);

  const dense = { xs: [1, 2, 3] };
  const deleted = scopeDraft(dense, (draft: any) => {
    delete draft.xs[1];
  });
  // Deleting an index leaves a hole; `remove` would close the gap.
  expect(deleted.state.xs).toHaveLength(3);
  expect(applyPatchesTo(dense, deleted.patches)).toEqual(deleted.state);
  expect(applyPatchesTo(deleted.state, deleted.inversePatches)).toEqual(dense);
});

test('an array method that answers with the array keeps the draft', () => {
  const base = { xs: [1, 2, 3] };
  const { state, patches } = scopeDraft(base, (draft) => {
    draft.xs.reverse().push(4);
  });
  // Handing back the raw copy would let the rest of the chain write to it
  // without the draft seeing any of it.
  expect(state.xs).toEqual([3, 2, 1, 4]);
  expect(applyPatchesTo(base, patches)).toEqual(state);
});

test('an element taken out of an array is detached from the base', () => {
  const base = { xs: [{ value: 1 }, { value: 2 }] };
  scopeDraft(base, (draft) => {
    const removed = draft.xs.pop()!;
    removed.value = 9;
  });
  expect(base.xs[1].value).toBe(2);

  const spliced = { xs: [{ value: 1 }, { value: 2 }] };
  scopeDraft(spliced, (draft) => {
    draft.xs.splice(0, 1)[0].value = 9;
  });
  expect(spliced.xs[0].value).toBe(1);
});

test('a draft cannot ride into the published state inside a container', () => {
  // `slice()` and spread build ordinary containers out of child drafts. Neither
  // is a draft itself, so nothing used to look inside them.
  const base = { items: [{ v: 1 }], copy: null as unknown };
  const sliced = scopeDraft(base, (draft: any) => {
    draft.copy = draft.items.slice();
  });
  expect((sliced.state as any).copy[0].v).toBe(1);

  const nested = { user: { profile: { name: 'a' } }, copy: null as unknown };
  const spread = scopeDraft(nested, (draft: any) => {
    draft.copy = { ...draft.user };
  });
  expect((spread.state as any).copy.profile.name).toBe('a');
});

test('an array keeps its own properties through a shape change', () => {
  const list: number[] & { foo?: string } = [];
  list.length = 3;
  list[0] = 1;
  list[2] = 3;
  list.foo = 'hello';
  const marker = Symbol('marker');
  (list as never as Record<symbol, string>)[marker] = 'kept';

  const base = { list };
  const { state, patches, inversePatches } = scopeDraft(base, (draft) => {
    draft.list[1] = 2;
  });
  // Snapshotting the array with `slice` would have dropped both of these.
  const applied = applyPatchesTo(base, patches) as typeof base;
  expect(applied.list.foo).toBe('hello');
  expect((applied.list as never as Record<symbol, string>)[marker]).toBe(
    'kept'
  );
  expect(applied).toEqual(state);
  expect(applyPatchesTo(state, inversePatches)).toEqual(base);
});

test('a hole and an explicit undefined are not the same array', () => {
  const base = { xs: [, 2] as unknown[] };
  const { state, patches, inversePatches } = scopeDraft(base, (draft) => {
    draft.xs.reverse();
  });
  const applied = applyPatchesTo(base, patches) as typeof base;
  expect(0 in applied.xs).toBe(0 in state.xs);
  expect(1 in applied.xs).toBe(1 in state.xs);
  expect(applyPatchesTo(state, inversePatches)).toEqual(base);
  expect(0 in (applyPatchesTo(state, inversePatches) as typeof base).xs).toBe(
    false
  );
});

test('a non-enumerable property survives a draft write', () => {
  const base = { count: 1 } as { count: number; hidden?: number };
  Object.defineProperty(base, 'hidden', {
    value: 7,
    enumerable: false,
    writable: true,
    configurable: true
  });
  const { state } = scopeDraft(base, (draft) => {
    draft.count = 2;
  });
  expect(state.hidden).toBe(7);
  expect(Object.keys(state)).toEqual(['count']);
});

test('only objects made of properties are reached into', () => {
  // `Object.create` over a plain prototype is ordinary state.
  const proto = { inherited: 1 };
  const held = Object.create(proto) as { own: number };
  held.own = 1;
  const { state } = scopeDraft({ held }, (draft) => {
    draft.held.own = 2;
  });
  expect(state.held.own).toBe(2);
  expect(Object.getPrototypeOf(state.held)).toBe(proto);

  // Anything a constructor built keeps state a property copy would not carry.
  for (const built of [new URL('https://a.test/p'), new Error('boom')]) {
    expect(() =>
      scopeDraft({ built }, (draft: any) => {
        void draft.built;
      })
    ).toThrow(/cannot describe a change inside one/);
  }
});

test('a cycle has no transition to describe', () => {
  const base: { v: number; self?: unknown } = { v: 1 };
  base.self = base;
  expect(() =>
    scopeDraft(base, (draft: any) => {
      draft.self.v = 2;
    })
  ).toThrow(/runs back through an object it already passed/);
});
