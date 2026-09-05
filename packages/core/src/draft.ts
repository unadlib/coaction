import { diffPatches } from './diffPatch';
import { asArrayIndex, isPatchTraversable } from './patch';
import type { Patches } from './patch';

/**
 * A copy-on-write draft over the tree a Coaction patch can describe.
 *
 * Writing state as mutation and publishing it as immutable is the library's
 * authoring model. Over the narrow tree `patch.ts` declares -- plain objects
 * and dense arrays, with everything else a leaf -- the mechanism is small: copy
 * a node the first time it is written, link the copy into its parent's copy,
 * and record the patch as it happens. Nothing is copied until it is written to,
 * so an untouched branch keeps its identity.
 *
 * The guarantees it has to hold, which is where the difficulty actually lives:
 * the base is never modified, a finalized draft is dead, and the inverse of a
 * transition returns exactly the state it started from.
 */
export type Draft<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Element)[]
    ? Draft<Element>[]
    : T extends object
      ? { -readonly [Key in keyof T]: Draft<T[Key]> }
      : T;

const draftState = Symbol('coaction.draft');

/** A draft was used in a way the transition it produces cannot describe. */
export class UnsupportedDraftOperationError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedDraftOperationError';
  }
}

type Node = {
  base: Record<PropertyKey, unknown>;
  copy: Record<PropertyKey, unknown> | null;
  parent: Node | null;
  key: PropertyKey | null;
  children: Map<PropertyKey, Node>;
  proxy: unknown;
  root: Root;
  /** Set when this path runs back through an object it already passed. */
  cyclic: boolean;
};

type Root = {
  patches: Patches;
  inversePatches: Patches;
  finalized: boolean;
};

const mutatingArrayMethods = new Set([
  'copyWithin',
  'fill',
  'pop',
  'push',
  'reverse',
  'shift',
  'sort',
  'splice',
  'unshift'
]);

/**
 * Copy a node without losing what it was.
 *
 * Descriptors rather than a spread or `slice`: a sparse array keeps its holes,
 * an array keeps the ordinary and symbol properties hung off it, and a
 * null-prototype object stays one. All three are state Coaction supports, and
 * all three disappear through the shorter forms.
 */
const shallowCopy = (base: Record<PropertyKey, unknown>) => {
  if (Array.isArray(base)) {
    const copy: unknown[] = [];
    Object.defineProperties(copy, Object.getOwnPropertyDescriptors(base));
    return copy as unknown as Record<PropertyKey, unknown>;
  }
  const copy = Object.create(Object.getPrototypeOf(base)) as Record<
    PropertyKey,
    unknown
  >;
  for (const key of Reflect.ownKeys(base)) {
    const descriptor = Object.getOwnPropertyDescriptor(base, key)!;
    if ('get' in descriptor || 'set' in descriptor) {
      // Read an accessor once and store what it gave: carrying the accessor
      // across would leave the copy reading from the original.
      Object.defineProperty(copy, key, {
        value: Reflect.get(base, key),
        writable: true,
        enumerable: descriptor.enumerable,
        configurable: true
      });
      continue;
    }
    // Descriptors, not assignment: a non-enumerable property is state Coaction
    // keeps, and assignment drops it.
    Object.defineProperty(copy, key, descriptor);
  }
  return copy;
};

const assertActive = (root: Root) => {
  if (root.finalized) {
    throw new UnsupportedDraftOperationError(
      'This draft has been finalized. Its state is already published, so writing to it would change the store without a commit.'
    );
  }
};

/**
 * A leaf keeps its contents where a property path cannot reach, so a method
 * call on one would move the base with nothing to observe and nothing to
 * record. It is replaced whole or not at all.
 */
const refuseLeaf = (value: object): never => {
  throw new UnsupportedDraftOperationError(
    `Reading a ${value.constructor?.name ?? 'value'} through a draft is not supported, because a patch cannot describe a change inside one. Read it from the state and assign a replacement.`
  );
};

const pathOf = (node: Node): PropertyKey[] => {
  const path: PropertyKey[] = [];
  let current: Node | null = node;
  while (current?.parent) {
    path.unshift(current.key as PropertyKey);
    current = current.parent;
  }
  return path;
};

/** Whether `base` is already on this node's path back to the root. */
const isAncestor = (node: Node | null, base: object) => {
  let current = node;
  while (current) {
    if (current.base === base) return true;
    current = current.parent;
  }
  return false;
};

const ensureCopy = (node: Node): Record<PropertyKey, unknown> => {
  if (node.copy) return node.copy;
  if (node.cyclic) {
    throw new UnsupportedDraftOperationError(
      'This path runs back through an object it already passed. A patch names a path, so a cycle has no transition to describe. Replace the whole branch instead.'
    );
  }
  node.copy = shallowCopy(node.base);
  if (node.parent) {
    ensureCopy(node.parent)[node.key as PropertyKey] = node.copy;
  }
  return node.copy;
};

const current = (node: Node) => node.copy ?? node.base;

const childNode = (node: Node, key: PropertyKey, value: object): Node => {
  const existing = node.children.get(key);
  if (existing && existing.base === value) return existing;
  const child = createNode(
    value as Record<PropertyKey, unknown>,
    node,
    key,
    node.root
  );
  node.children.set(key, child);
  return child;
};

/**
 * Run an array's own mutating method on the copy and diff the result.
 *
 * A `splice` is one operation to the caller and a burst of index assignments to
 * a proxy, and rebuilding the intent from those assignments is where inverse
 * patches went wrong: by the time they are reversed the indexes they name have
 * moved. Letting the array do its own work and describing what changed keeps
 * the two directions consistent, because they come from the same comparison.
 */
const runArrayMethod = (node: Node, method: string) =>
  function (this: unknown, ...args: unknown[]) {
    assertActive(node.root);
    const before = shallowCopy(
      current(node) as Record<PropertyKey, unknown>
    ) as unknown as unknown[];
    const copy = ensureCopy(node) as unknown as unknown[];
    // A comparator is handed elements straight off the copy, which for
    // anything untouched are still the base's objects. Detached drafts make a
    // comparator that writes -- which no comparator should -- reach nothing.
    const detached = new Map<object, unknown>();
    const forCallback = (element: unknown) => {
      if (!isPatchTraversable(element)) return element;
      const existing = detached.get(element);
      if (existing) return existing;
      const draft = detach(element);
      detached.set(element, draft);
      return draft;
    };
    const prepared =
      method === 'sort' && typeof args[0] === 'function'
        ? [
            (left: unknown, right: unknown) =>
              (args[0] as (a: unknown, b: unknown) => number)(
                forCallback(left),
                forCallback(right)
              )
          ]
        : args.map((argument) => unwrapDraft(argument));
    const result = (Array.prototype as never as Record<string, Function>)[
      method
    ].apply(copy, prepared);
    node.children.clear();
    const path = pathOf(node);
    const { patches, inversePatches } = diffPatches(
      before,
      shallowCopy(
        copy as unknown as Record<PropertyKey, unknown>
      ) as unknown as unknown[]
    );
    for (const patch of patches) {
      node.root.patches.push({
        ...patch,
        path: [...path, ...(patch.path as PropertyKey[])]
      });
    }
    for (let index = inversePatches.length - 1; index >= 0; index -= 1) {
      const patch = inversePatches[index];
      node.root.inversePatches.unshift({
        ...patch,
        path: [...path, ...(patch.path as PropertyKey[])]
      });
    }
    // `reverse`, `sort`, `fill` and `copyWithin` answer with the array itself.
    // Handing back the raw copy would let the rest of a chain write to it
    // without the draft seeing any of it.
    if (result === (copy as unknown)) return node.proxy;
    // `pop`, `shift` and `splice` answer with elements taken out, and those are
    // still the base's objects. Writing to one would change the base with
    // nothing recorded, so what comes back is detached: its own draft, rooted
    // nowhere, whose writes reach neither the array nor the state.
    // Elements taken out are still the base's objects. A traversable one comes
    // back detached, so writing to it reaches nothing; a leaf has no detached
    // form -- copying one by its properties makes something else -- so handing
    // it out is the same hole the read trap refuses, and is refused the same
    // way.
    const handOut = (element: unknown) => {
      if (isPatchTraversable(element)) return detach(element as object);
      if (typeof element === 'object' && element !== null) {
        return refuseLeaf(element);
      }
      return element;
    };
    if (Array.isArray(result)) return result.map(handOut);
    return handOut(result);
  };

/**
 * A draft over a value that is no longer part of the tree.
 *
 * It gets a root of its own, and that root is thrown away: the value has left
 * the array, so a write to it is not part of the transition. Sharing the
 * enclosing root would file those writes against the state's own path, since a
 * detached node has no parent to measure a path from.
 */
const detach = (value: object) =>
  createNode(value as Record<PropertyKey, unknown>, null, null, {
    patches: [],
    inversePatches: [],
    finalized: false
  }).proxy;

/**
 * Let an array take a write that changes its shape, and describe the result.
 *
 * Filling a hole, deleting an index and writing past the end are not what an
 * index patch means -- `add` at an index inserts and shifts. Comparing the
 * array before and after gives a transition that says what actually happened,
 * in both directions, from one comparison.
 */
const reshapeArray = (node: Node, write: (array: unknown[]) => void) => {
  const before = current(node) as unknown as unknown[];
  const previous = shallowCopy(
    before as unknown as Record<PropertyKey, unknown>
  ) as unknown as unknown[];
  const copy = ensureCopy(node) as unknown as unknown[];
  write(copy);
  node.children.clear();
  const path = pathOf(node);
  node.root.patches.push({
    op: 'replace',
    path,
    value: shallowCopy(copy as unknown as Record<PropertyKey, unknown>)
  });
  node.root.inversePatches.unshift({ op: 'replace', path, value: previous });
  return true;
};

const record = (
  node: Node,
  key: PropertyKey,
  op: 'add' | 'remove' | 'replace',
  previous: unknown,
  next: unknown
) => {
  const path = [...pathOf(node), key];
  const { patches, inversePatches } = node.root;
  if (op === 'remove') {
    patches.push({ op: 'remove', path });
    inversePatches.unshift({ op: 'add', path, value: previous });
    return;
  }
  patches.push({ op, path, value: next });
  inversePatches.unshift(
    op === 'replace'
      ? { op: 'replace', path, value: previous }
      : { op: 'remove', path }
  );
};

const createNode = (
  base: Record<PropertyKey, unknown>,
  parent: Node | null,
  key: PropertyKey | null,
  root: Root
): Node => {
  const node: Node = {
    base,
    copy: null,
    parent,
    key,
    children: new Map(),
    proxy: undefined,
    root,
    cyclic: isAncestor(parent, base)
  };
  const refuse = (what: string) => (): never => {
    throw new UnsupportedDraftOperationError(
      `${what} on a draft cannot be described as a transition. Build the value you want and assign it instead.`
    );
  };
  node.proxy = new Proxy(base, {
    get(_target, property, receiver) {
      if (property === draftState) return node;
      assertActive(node.root);
      const source = current(node);
      if (
        Array.isArray(source) &&
        mutatingArrayMethods.has(property as string)
      ) {
        return runArrayMethod(node, property as string);
      }
      const value = Reflect.get(source, property, receiver);
      if (isPatchTraversable(value)) {
        return childNode(node, property, value as object).proxy;
      }
      // A leaf is replaced whole, never edited in place, and a patch cannot
      // describe a change inside one -- so a mutation through here would move
      // the base with nothing recorded.
      //
      // Freezing rather than listing the types that misbehave: a class
      // instance, an object with a prototype of its own, anything at all is
      // then safe to hand back, because a write to it throws instead of
      // reaching the base. What cannot be frozen -- a typed array, a value
      // that refuses -- has no such guarantee and is refused instead. Reads
      // keep working either way, which listing types could not manage without
      // breaking ordinary state.
      if (typeof value === 'object' && value !== null) {
        return refuseLeaf(value);
      }
      return value;
    },
    set(_target, property, value) {
      assertActive(node.root);
      const source = current(node);
      const hadKey = Object.prototype.hasOwnProperty.call(source, property);
      const previous = (source as Record<PropertyKey, unknown>)[property];
      const nextValue = unwrapDraft(value);
      if (hadKey && Object.is(previous, nextValue)) return true;
      // Filling a hole and writing past the end both change an array's shape in
      // ways an index patch cannot describe -- `add` at an index means "insert
      // here", which is a different operation. Let the array take the write and
      // describe what changed, the way its own methods already do.
      if (
        Array.isArray(source) &&
        !hadKey &&
        asArrayIndex(property) !== undefined
      ) {
        return reshapeArray(node, (array) => {
          array[asArrayIndex(property) as number] = nextValue;
        });
      }
      const copy = ensureCopy(node);
      copy[property] = nextValue;
      node.children.delete(property);
      if (Array.isArray(copy) && property === 'length') {
        node.root.patches.push({
          op: 'replace',
          path: [...pathOf(node), 'length'],
          value: nextValue
        });
        node.root.inversePatches.unshift({
          op: 'replace',
          path: pathOf(node),
          value: source
        });
        return true;
      }
      record(node, property, hadKey ? 'replace' : 'add', previous, nextValue);
      return true;
    },
    deleteProperty(_target, property) {
      assertActive(node.root);
      const source = current(node);
      if (!Object.prototype.hasOwnProperty.call(source, property)) return true;
      // Deleting an index leaves a hole where `remove` would close the gap.
      if (Array.isArray(source) && asArrayIndex(property) !== undefined) {
        return reshapeArray(node, (array) => {
          delete array[asArrayIndex(property) as number];
        });
      }
      const previous = (source as Record<PropertyKey, unknown>)[property];
      const copy = ensureCopy(node);
      delete copy[property];
      node.children.delete(property);
      record(node, property, 'remove', previous, undefined);
      return true;
    },
    has: (_target, property) => Reflect.has(current(node) as object, property),
    ownKeys: () => Reflect.ownKeys(current(node) as object),
    getOwnPropertyDescriptor: (_target, property) =>
      Reflect.getOwnPropertyDescriptor(current(node) as object, property),
    getPrototypeOf: () => Object.getPrototypeOf(current(node) as object),
    defineProperty: refuse('Object.defineProperty()'),
    setPrototypeOf: refuse('Object.setPrototypeOf()'),
    preventExtensions: refuse('Object.preventExtensions()')
  });
  return node;
};

const getNode = (value: unknown): Node | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  return (value as Record<symbol, Node | undefined>)[draftState];
};

/**
 * Replace every draft inside a value with what it stands for.
 *
 * Shallow unwrapping is not enough. `draft.copy = draft.items.slice()` builds an
 * ordinary array out of child drafts, and `{ ...draft.user }` an ordinary object
 * — neither is a draft itself, so nothing used to look inside them, and the
 * drafts rode into the published state where reading one throws because it has
 * been finalized. Only what the caller assigns is walked, and a container with
 * nothing to replace is returned unchanged so identity survives.
 */
const containsDraft = (value: unknown, seen = new Set<object>()): boolean => {
  if (getNode(value)) return true;
  if (!isPatchTraversable(value) || seen.has(value as object)) return false;
  seen.add(value as object);
  return Reflect.ownKeys(value as object).some((key) =>
    containsDraft((value as Record<PropertyKey, unknown>)[key], seen)
  );
};

const cloneWithout = (
  value: unknown,
  done: WeakMap<object, unknown>
): unknown => {
  const node = getNode(value);
  if (node) return node.copy ?? node.base;
  if (!isPatchTraversable(value)) return value;
  const existing = done.get(value as object);
  if (existing !== undefined) return existing;
  const source = value as Record<PropertyKey, unknown>;
  const copy = shallowCopy(source);
  // Registered before its children are walked, so an object reached twice --
  // an alias, or a cycle -- resolves to the same clone both times instead of
  // being returned as itself with a draft still inside it.
  done.set(source, copy);
  for (const key of Reflect.ownKeys(source)) {
    const child = source[key];
    const replaced = cloneWithout(child, done);
    if (!Object.is(child, replaced)) copy[key] = replaced;
  }
  return copy;
};

/**
 * Replace every draft inside a value with what it stands for.
 *
 * Shallow unwrapping is not enough: `draft.copy = draft.items.slice()` builds
 * an ordinary array out of child drafts and `{ ...draft.user }` an ordinary
 * object, and neither is a draft itself. A value with no draft anywhere in it
 * is returned as it is, so identity survives the common case; one that has any
 * is cloned as a graph, which is what keeps an alias pointing at one object and
 * a cycle a cycle rather than leaving a draft behind on the second visit.
 */
const unwrapDraft = (value: unknown): unknown => {
  const node = getNode(value);
  if (node) return node.copy ?? node.base;
  if (!containsDraft(value)) return value;
  return cloneWithout(value, new WeakMap());
};

export const isCoactionDraft = (value: unknown) => Boolean(getNode(value));

/**
 * Open a draft written over time and finalized later, which is what an
 * asynchronous action needs: its draft outlives the call that made it.
 */
export const openDraft = <T extends object>(
  base: T
): [draft: T, finalize: () => [T, Patches, Patches]] => {
  const root: Root = {
    patches: [],
    inversePatches: [],
    finalized: false
  };
  const node = createNode(
    base as Record<PropertyKey, unknown>,
    null,
    null,
    root
  );
  const finalize = (): [T, Patches, Patches] => {
    const state = (node.copy ?? node.base) as T;
    // The draft dies here. What it produced is the published state, and a write
    // afterwards would change that state with no commit, no patches and no
    // subscriber ever hearing about it.
    root.finalized = true;
    return [state, root.patches, root.inversePatches];
  };
  return [node.proxy as T, finalize];
};

/** Run a recipe against a draft of `base` and report the transition it made. */
export const scopeDraft = <T extends object>(
  base: T,
  recipe: (draft: T) => unknown
): { state: T; result: unknown; patches: Patches; inversePatches: Patches } => {
  const [draft, finalize] = openDraft(base);
  const result = recipe(draft);
  const [state, patches, inversePatches] = finalize();
  return { state, result, patches, inversePatches };
};
