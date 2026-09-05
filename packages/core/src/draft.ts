import { diffPatches } from './diffPatch';
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
};

type Root = { patches: Patches; inversePatches: Patches; finalized: boolean };

const isTraversable = (value: unknown) => {
  if (Array.isArray(value)) return true;
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/** `0`, `1`, `2`… — a position in a sequence, not a property that looks like one. */
const asArrayIndex = (key: PropertyKey) => {
  if (typeof key === 'number')
    return Number.isInteger(key) && key >= 0 ? key : undefined;
  if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key)) return undefined;
  return Number(key);
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
    // Descriptors, so holes survive and the ordinary and symbol properties an
    // array can carry come with it.
    const copy: unknown[] = [];
    Object.defineProperties(copy, Object.getOwnPropertyDescriptors(base));
    return copy as unknown as Record<PropertyKey, unknown>;
  }
  // Assignment rather than descriptors, so an accessor is read once and becomes
  // a value: a computed getter belongs to the state it was defined on, and
  // carrying it across would leave the copy reading from the original.
  return Object.assign(
    Object.create(Object.getPrototypeOf(base)),
    base
  ) as Record<PropertyKey, unknown>;
};

const assertActive = (root: Root) => {
  if (root.finalized) {
    throw new UnsupportedDraftOperationError(
      'This draft has been finalized. Its state is already published, so writing to it would change the store without a commit.'
    );
  }
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

const ensureCopy = (node: Node): Record<PropertyKey, unknown> => {
  if (node.copy) return node.copy;
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
    const before = (current(node) as unknown as unknown[]).slice();
    const copy = ensureCopy(node) as unknown as unknown[];
    const result = (Array.prototype as never as Record<string, Function>)[
      method
    ].apply(copy, args.map(unwrapDraft));
    node.children.clear();
    const path = pathOf(node);
    const { patches, inversePatches } = diffPatches(before, copy.slice());
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
    return result;
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
    root
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
      if (isTraversable(value)) {
        return childNode(node, property, value as object).proxy;
      }
      // A leaf is replaced whole, never edited in place. These carry their
      // contents in internal slots, so a method call on one changes the base
      // with no property write to see and no patch to record -- there is no
      // way to catch it later, which is why it is refused here. Other objects
      // read through untouched: a value with a prototype of its own is
      // ordinary state, and refusing to read it would break far more than it
      // protects.
      if (
        value instanceof Map ||
        value instanceof Set ||
        value instanceof Date ||
        value instanceof WeakMap ||
        value instanceof WeakSet
      ) {
        throw new UnsupportedDraftOperationError(
          `Reading a ${(value as object).constructor.name} through a draft is not supported, because a patch cannot describe a change inside one. Read it from the state and assign a replacement.`
        );
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
      const index = Array.isArray(copy) ? asArrayIndex(property) : undefined;
      const sourceLength = (source as unknown as unknown[]).length;
      if (index !== undefined && index >= sourceLength) {
        // Assigning past the end extends the array, leaving holes behind it.
        // Removing that one index would not undo the extension, so the inverse
        // restores the length the array had.
        const path = [...pathOf(node), property];
        node.root.patches.push({ op: 'add', path, value: nextValue });
        node.root.inversePatches.unshift({
          op: 'replace',
          path: [...pathOf(node), 'length'],
          value: sourceLength
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

const unwrapDraft = (value: unknown): unknown => {
  const node = getNode(value);
  return node ? (node.copy ?? node.base) : value;
};

export const isCoactionDraft = (value: unknown) => Boolean(getNode(value));

/**
 * Open a draft written over time and finalized later, which is what an
 * asynchronous action needs: its draft outlives the call that made it.
 */
export const openDraft = <T extends object>(
  base: T
): [draft: T, finalize: () => [T, Patches, Patches]] => {
  const root: Root = { patches: [], inversePatches: [], finalized: false };
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
